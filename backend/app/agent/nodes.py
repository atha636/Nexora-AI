"""The steps of the agent graph. Each node is a small function with ONE job:

  call_model  asks the LLM what to do next (answer, or call tools)
  run_tools   executes the tool calls the model asked for, behind a series of guards
  route_after_model  decides whether to run tools or finish (an "edge", not a node)

The guards in `run_tools` are the security-critical part, so they live in plain code the model
cannot talk its way past: unknown tool, role check, prompt-injection (taint) block, duplicate-call
loop guard, tool budget, argument validation, and error isolation.
"""

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from langgraph.graph import END
from pydantic import ValidationError

from app.agent.state import AgentState
from app.agent.tools import Tool, ToolContext, ToolError, tools_for_role
from app.services.llm import ChatLLM

log = logging.getLogger(__name__)

FALLBACK_ANSWER = "I wasn't able to finish that request. Please try rephrasing it or breaking it into smaller steps."
MAX_TOOL_OUTPUT_CHARS = 12_000


@dataclass(frozen=True)
class Limits:
    max_steps: int = 6  # model calls per run; the last one is made WITHOUT tools to force an answer
    max_tool_calls: int = 8  # tool executions per run
    max_calls_per_step: int = 4  # tool calls the model may request in one reply
    max_output_tokens: int = 1500


@dataclass
class ToolRecord:
    """What happened in one tool call. Saved to the database as a `tool_executions` row."""

    sequence: int
    name: str
    status: str  # ok | error | blocked
    arguments: Any
    duration_ms: int
    summary: str | None = None
    error: str | None = None
    kind: str | None = None
    data: dict | None = None


@dataclass
class AgentDeps:
    """Per-run dependencies, handed to the nodes through closures (not stored in the state)."""

    llm: ChatLLM
    tool_ctx: ToolContext
    tools: dict[str, Tool]
    system_prompt: str
    limits: Limits = field(default_factory=Limits)
    records: list[ToolRecord] = field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    usage_reported: bool = False
    model_ms: int = 0


def _signature(name: str, raw_args: str) -> str:
    try:
        return name + ":" + json.dumps(json.loads(raw_args or "{}"), sort_keys=True, default=str)
    except ValueError:
        return name + ":" + (raw_args or "")


def _blocked(message: str) -> str:
    return json.dumps({"error": message})


# ------------------------------------------------------------------ node: call_model
def make_call_model(deps: AgentDeps):
    def call_model(state: AgentState) -> dict:
        limits = deps.limits
        is_last_step = state["steps"] + 1 >= limits.max_steps
        budget_left = state["tool_calls"] < limits.max_tool_calls
        allow_tools = not is_last_step and budget_left
        specs = [t.spec() for t in tools_for_role(deps.tools, deps.tool_ctx.auth.role)] if allow_tools else None

        result = deps.llm.chat(
            [{"role": "system", "content": deps.system_prompt}, *state["messages"]],
            specs,
            max_tokens=limits.max_output_tokens,
        )
        deps.model_ms += result.latency_ms
        if result.prompt_tokens is not None or result.completion_tokens is not None:
            deps.usage_reported = True
            deps.prompt_tokens += result.prompt_tokens or 0
            deps.completion_tokens += result.completion_tokens or 0

        message: dict = {"role": "assistant", "content": result.content or None}
        update: dict = {"steps": state["steps"] + 1}
        if result.tool_calls and allow_tools:
            message["tool_calls"] = [
                {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.arguments}}
                for c in result.tool_calls
            ]
        else:
            # Either a normal final answer, or the model tried to call tools when none were allowed.
            update["final"] = result.content or FALLBACK_ANSWER
        update["messages"] = [message]
        return update

    return call_model


# ------------------------------------------------------------------ edge: route_after_model
def route_after_model(state: AgentState) -> str:
    return "run_tools" if state["messages"][-1].get("tool_calls") else END


# ------------------------------------------------------------------ node: run_tools
def make_run_tools(deps: AgentDeps):
    def run_tools(state: AgentState) -> dict:
        calls = state["messages"][-1]["tool_calls"]
        seen = list(state["seen_calls"])
        tainted = state["tainted"]
        executed = state["tool_calls"]
        replies: list[dict] = []

        for index, call in enumerate(calls):
            name = call["function"]["name"]
            raw = call["function"].get("arguments") or "{}"
            started = time.perf_counter()
            record = ToolRecord(sequence=len(deps.records) + 1, name=name, status="error", arguments=None, duration_ms=0)
            try:
                tool = deps.tools.get(name)
                if tool is None:
                    raise _Refused("error", f"Unknown tool '{name}'. Available tools: {', '.join(deps.tools)}.")
                if not tool.allowed_for(deps.tool_ctx.auth.role):
                    raise _Refused("blocked", "You are not allowed to use this tool.")
                if index >= deps.limits.max_calls_per_step:
                    raise _Refused("blocked", "Too many tool calls at once. Make fewer calls per step.")
                if executed >= deps.limits.max_tool_calls:
                    raise _Refused("blocked", "The tool budget for this request is used up. Answer with what you have.")
                if tool.writes and tainted:
                    # Prompt-injection defence: once document text is in the conversation, the model
                    # could have been tricked by it, so it may not change any data in this run.
                    raise _Refused(
                        "blocked",
                        "Blocked: document text was read in this request and could contain hidden instructions, "
                        "so changing data is disabled for the rest of it. Tell the user what you found and ask "
                        "them to request the change in a new message.",
                    )
                sig = _signature(name, raw)
                if sig in seen:
                    raise _Refused("error", "You already made this exact call. Use the earlier result instead of repeating it.")
                seen.append(sig)

                try:
                    parsed = json.loads(raw or "{}")
                except ValueError:
                    record.arguments = raw[:500]
                    raise _Refused("error", "The arguments were not valid JSON.") from None
                try:
                    args = tool.args_model.model_validate(parsed)
                except ValidationError as e:
                    record.arguments = parsed if isinstance(parsed, dict) else None
                    raise _Refused("error", "Invalid arguments: " + "; ".join(_describe(x) for x in e.errors()[:4])) from None
                record.arguments = args.model_dump(mode="json", exclude_none=True)

                executed += 1
                try:
                    result = tool.handler(deps.tool_ctx, args)
                except ToolError as e:
                    deps.tool_ctx.db.rollback()
                    raise _Refused("error", str(e)) from None
                except Exception as e:  # noqa: BLE001 - one broken tool must not crash the whole run
                    deps.tool_ctx.db.rollback()
                    log.error("Tool %s crashed: %s", name, type(e).__name__)  # type only: messages may hold data
                    raise _Refused("error", "The tool failed unexpectedly.") from None

                if tool.reads_documents and result.untrusted:
                    tainted = True
                record.status, record.summary, record.kind, record.data = "ok", result.summary, result.kind, result.data
                content = json.dumps(result.data, default=str)
                if len(content) > MAX_TOOL_OUTPUT_CHARS:
                    content = json.dumps({"error": "The result was too large. Ask for fewer items or a narrower filter."})
            except _Refused as r:
                record.status, record.error = r.status, str(r)
                content = _blocked(str(r))
            record.duration_ms = int((time.perf_counter() - started) * 1000)
            deps.records.append(record)
            replies.append({"role": "tool", "tool_call_id": call["id"], "content": content})

        return {"messages": replies, "tool_calls": executed, "seen_calls": seen, "tainted": tainted}

    return run_tools


class _Refused(Exception):
    """Internal: a tool call that did not run. `status` is 'blocked' (a guard stopped it) or
    'error' (bad input or the tool failed). The text goes back to the model so it can adapt."""

    def __init__(self, status: str, message: str):
        super().__init__(message)
        self.status = status


def _describe(err: dict) -> str:
    where = ".".join(str(p) for p in err.get("loc", ()))
    return f"{where}: {err.get('msg')}" if where else str(err.get("msg"))
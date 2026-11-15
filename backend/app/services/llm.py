"""Talking to a language model. The rest of the app only sees `LLMClient` (single question, used
by the cited-answer feature) and `ChatLLM` (multi-turn with tool calling, used by the agent), so
the provider can be swapped, or faked in tests, without touching the business logic.

We call Groq's OpenAI-compatible HTTP endpoint with httpx directly instead of adding another SDK:
one fewer dependency, full control over error handling, and easy testing with a mock transport."""

import logging
import time
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)


class LLMError(Exception):
    """The model could not be reached or returned something unusable. The message is safe to
    show to users: it never contains keys, prompts or document text."""


class LLMNotConfigured(LLMError):
    pass


@dataclass
class LLMResult:
    text: str
    latency_ms: int
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str  # raw JSON text exactly as the model wrote it; validated before use


@dataclass
class ChatResult:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    latency_ms: int = 0
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class LLMClient(Protocol):
    model: str

    def complete(self, system: str, user: str, *, max_tokens: int) -> LLMResult: ...


class ChatLLM(Protocol):
    model: str

    def chat(self, messages: list[dict], tools: list[dict] | None, *, max_tokens: int) -> ChatResult: ...


class GroqClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str,
        timeout: float,
        reasoning_effort: str | None = None,
        transport: httpx.BaseTransport | None = None,
    ):
        self._api_key = api_key
        self._reasoning_effort = reasoning_effort
        self.model = model
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._timeout = timeout
        self._transport = transport  # tests inject a mock transport here

    # ---------- shared HTTP + error handling ----------
    def _post(self, messages: list[dict], tools: list[dict] | None, max_tokens: int) -> tuple[dict, int]:
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": 0,  # factual work: we want the same answer every time
            "max_tokens": max_tokens,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        if self._reasoning_effort and self.model.startswith("openai/gpt-oss"):
            payload["reasoning_effort"] = self._reasoning_effort

        started = time.perf_counter()
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                res = client.post(self._url, json=payload, headers={"Authorization": f"Bearer {self._api_key}"})
        except httpx.TimeoutException:
            raise LLMError("The AI service took too long to respond. Please try again.") from None
        except httpx.HTTPError:
            raise LLMError("Could not reach the AI service. Please try again.") from None

        if res.status_code == 429:
            raise LLMError("The AI service is busy (free-tier rate limit). Wait a minute and try again.")
        if res.status_code in (401, 403):
            # Log the status only. Never log the key, the prompt or the response body.
            log.error("LLM rejected our credentials (HTTP %s)", res.status_code)
            raise LLMError("The AI service rejected the server's credentials. Ask an administrator to check GROQ_API_KEY.")
        if res.status_code == 404:
            log.error("LLM model %r not found (HTTP 404): %s", self.model, _provider_error(res))
            raise LLMError("The configured AI model was not found. It may have been retired: ask an administrator to check GROQ_MODEL.")
        if res.status_code >= 400:
            log.error("LLM call failed (HTTP %s): %s", res.status_code, _provider_error(res))
            raise LLMError("The AI service returned an error. Please try again.")
        try:
            return res.json(), int((time.perf_counter() - started) * 1000)
        except ValueError:
            raise LLMError("The AI service returned an unreadable response.") from None

    # ---------- single question (cited answers) ----------
    def complete(self, system: str, user: str, *, max_tokens: int) -> LLMResult:
        body, latency = self._post(
            [{"role": "system", "content": system}, {"role": "user", "content": user}], None, max_tokens
        )
        try:
            text = body["choices"][0]["message"]["content"] or ""
            usage = body.get("usage") or {}
        except (KeyError, IndexError, TypeError, AttributeError):
            raise LLMError("The AI service returned an unreadable response.") from None
        if not text.strip():
            # Typically a reasoning model that ran out of tokens while thinking.
            log.error("LLM returned an empty answer (model %s)", self.model)
            raise LLMError("The AI service returned an empty answer. Please try again.")
        return LLMResult(
            text=text.strip(),
            latency_ms=latency,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
        )

    # ---------- multi-turn with tools (the agent) ----------
    def chat(self, messages: list[dict], tools: list[dict] | None, *, max_tokens: int) -> ChatResult:
        body, latency = self._post(messages, tools, max_tokens)
        try:
            message = body["choices"][0]["message"]
            usage = body.get("usage") or {}
            content = (message.get("content") or "").strip()
            calls = [
                ToolCall(
                    id=str(c["id"]),
                    name=str(c["function"]["name"]),
                    arguments=c["function"].get("arguments") or "{}",
                )
                for c in (message.get("tool_calls") or [])
            ]
        except (KeyError, IndexError, TypeError, AttributeError):
            raise LLMError("The AI service returned an unreadable response.") from None
        if not content and not calls:
            log.error("LLM returned neither text nor tool calls (model %s)", self.model)
            raise LLMError("The AI service returned an empty answer. Please try again.")
        return ChatResult(
            content=content,
            tool_calls=calls,
            latency_ms=latency,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
        )


def _provider_error(res: httpx.Response) -> str:
    """The provider's own error message (e.g. "model ... does not exist"). It describes the
    problem, not our prompt, so it is safe to log; capped in length just in case."""
    try:
        err = res.json().get("error", {})
        return f'{err.get("code") or err.get("type") or "error"}: {err.get("message", "")}'[:300]
    except Exception:  # noqa: BLE001 - logging helper must never raise
        return "unreadable error body"


class _Unconfigured:
    model = "unconfigured"

    def complete(self, system: str, user: str, *, max_tokens: int) -> LLMResult:
        raise LLMNotConfigured("AI answers are not configured on this server (missing GROQ_API_KEY).")

    def chat(self, messages: list[dict], tools: list[dict] | None, *, max_tokens: int) -> ChatResult:
        raise LLMNotConfigured("AI answers are not configured on this server (missing GROQ_API_KEY).")


def get_llm() -> LLMClient:
    """FastAPI dependency. Cheap to build per request; tests override it."""
    s = get_settings()
    if s.llm_provider == "groq" and s.groq_api_key:
        return GroqClient(
            s.groq_api_key, s.groq_model, s.groq_base_url, s.llm_timeout_seconds, reasoning_effort=s.groq_reasoning_effort
        )
    return _Unconfigured()


def get_chat_llm() -> ChatLLM:
    """FastAPI dependency for the agent. The same client as `get_llm`, typed for tool calling."""
    return get_llm()  # type: ignore[return-value]  # GroqClient and _Unconfigured implement both
"""Wires the nodes into a LangGraph state machine.

            +-------------+   tool calls?    +-----------+
  START --> | call_model  | ---- yes ------> | run_tools |
            +-------------+ <--------------- +-----------+
                   |  no
                   v
                  END

The loop is bounded three ways (see Limits): a maximum number of model calls (the last one is
made without tools, forcing a text answer), a maximum number of tool executions, and a block on
repeating an identical call. LangGraph's own `recursion_limit` is a final backstop.
"""

from langgraph.graph import END, START, StateGraph

from app.agent.nodes import AgentDeps, make_call_model, make_run_tools, route_after_model
from app.agent.state import AgentState


def build_agent_graph(deps: AgentDeps):
    graph = StateGraph(AgentState)
    graph.add_node("call_model", make_call_model(deps))
    graph.add_node("run_tools", make_run_tools(deps))
    graph.add_edge(START, "call_model")
    graph.add_conditional_edges("call_model", route_after_model, {"run_tools": "run_tools", END: END})
    graph.add_edge("run_tools", "call_model")
    return graph.compile()


def initial_state(history: list[dict]) -> AgentState:
    return {"messages": history, "steps": 0, "tool_calls": 0, "seen_calls": [], "tainted": False, "final": None}
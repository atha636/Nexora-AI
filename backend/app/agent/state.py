"""The agent's working memory for ONE run (one user message).

LangGraph passes this dictionary from node to node. A node returns only the keys it changes.
Keys annotated with a reducer (`operator.add`) are appended to instead of overwritten.

Things that must not be shared between runs or users (database session, who is asking, the
model client) are NOT in the state: they live in `AgentDeps` (nodes.py) and reach the nodes
through closures, so the state stays small, plain data.
"""

import operator
from typing import Annotated, TypedDict


class AgentState(TypedDict):
    # The conversation as the model sees it (OpenAI chat format), without the system prompt.
    # Nodes return NEW messages only; the reducer appends them.
    messages: Annotated[list[dict], operator.add]
    steps: int  # how many times the model has been called in this run
    tool_calls: int  # how many tool calls have been executed in this run
    seen_calls: list[str]  # signatures of calls already made: the loop guard
    tainted: bool  # True once untrusted document text has entered the conversation
    final: str | None  # the answer to show the user, set by the last model call
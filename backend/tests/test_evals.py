"""Tests for the evaluation harness itself (scoring maths and plumbing), using fake models.
The real quality numbers come from `python -m evals.run` with a real API key."""

import json
import uuid

from app.services.embeddings import HashEmbedder
from app.services.llm import ChatResult, LLMResult, ToolCall
from evals import metrics
from evals.runner import Environment, run_retrieval, run_safety, run_tools

GOOD = json.dumps({"subject": "Hello", "body": "Hi there,\n\nThanks.\n\nTeam"})


def test_percentile_and_means():
    assert metrics.percentile([], 50) is None
    assert metrics.percentile([10, 20, 30, 40], 50) == 20
    assert metrics.percentile([10, 20, 30, 40], 95) == 40
    assert metrics.mean([1, 0]) == 0.5


def test_tool_case_scoring():
    assert metrics.tool_case_passed(["search_leads"], ["search_leads"], ["create_lead"])[0]
    assert not metrics.tool_case_passed(["create_lead"], ["search_leads"], ["create_lead"])[0]
    assert not metrics.tool_case_passed([], ["search_leads"], [])[0]
    assert metrics.tool_case_passed([], [], ["create_lead"])[0]  # nothing expected, nothing called
    assert not metrics.tool_case_passed(["search_leads"], [], [])[0]  # nothing expected but a tool ran
    assert metrics.tool_case_passed(["query_analytics"], ["get_sales_summary", "query_analytics"], [])[0]


def test_retrieval_metrics():
    assert metrics.recall_at_k([False, False, True], 3) == 1.0
    assert metrics.recall_at_k([False, False, True], 2) == 0.0
    assert metrics.reciprocal_rank([False, True]) == 0.5
    assert metrics.reciprocal_rank([False, False]) == 0.0


def test_grounding_rules():
    assert metrics.grounded("x", found=False, citations=0, answerable=False, must_contain=[])[0]
    assert not metrics.grounded("made up", found=True, citations=1, answerable=False, must_contain=[])[0]
    assert metrics.grounded("14 days [1]", True, 1, True, ["14"])[0]
    assert not metrics.grounded("14 days", True, 0, True, ["14"])[0]  # no citation
    assert not metrics.grounded("n/a", False, 0, True, ["14"])[0]  # wrongly refused
    assert not metrics.grounded("30 days", True, 1, True, ["14"])[0]  # wrong fact


class KeywordAgent:
    """A fake model with simple rules, standing in for the real one."""

    model = "keyword-fake"

    def chat(self, messages, tools, *, max_tokens):
        if messages[-1]["role"] == "tool":
            return ChatResult(content="Done.", prompt_tokens=1, completion_tokens=1, latency_ms=1)
        text = messages[-1]["content"].lower()
        rules = [
            ("high-priority leads", "search_leads", {"city": "Delhi", "priority": "high"}),
            ("refund policy", "search_documents", {"query": "refund policy"}),
            ("meeting notes", "search_documents", {"query": "meeting notes"}),
        ]
        for needle, name, args in rules:
            if needle in text:
                call = ToolCall(id=f"c{uuid.uuid4().hex[:6]}", name=name, arguments=json.dumps(args))
                return ChatResult(content="", tool_calls=[call], prompt_tokens=1, completion_tokens=1, latency_ms=1)
        return ChatResult(content="Happy to help.", prompt_tokens=1, completion_tokens=1, latency_ms=1)

    def complete(self, system, user, *, max_tokens):
        return LLMResult(text=GOOD, model=self.model, latency_ms=1, prompt_tokens=1, completion_tokens=1)


def test_harness_runs_end_to_end_with_fakes():
    with Environment(KeywordAgent(), HashEmbedder()) as env:
        assert env.lead_count() == 8
        tools = run_tools(env)
        by_id = {c["id"]: c for c in tools["cases"]}
        assert by_id["ts01"]["passed"] and by_id["ts01"]["called"] == ["search_leads"]
        assert by_id["ts03"]["passed"]
        assert by_id["ts12"]["passed"]  # greeting -> no tools
        assert not by_id["ts05"]["passed"]  # this fake never creates leads, so the harness must notice
        assert tools["total"] == 17 and 0 < tools["accuracy"] < 1

        retrieval = run_retrieval(env)
        assert retrieval["total"] == 6 and retrieval["recall@3"] is not None

        safety = run_safety(env)  # the injected document is read, but nothing may change
        assert safety["passed"] == safety["total"] == 2
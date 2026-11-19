"""Pure scoring functions. No database, no network, so they are easy to test."""

import math


def percentile(values: list[float], p: float) -> float | None:
    """Nearest-rank percentile (p in 0..100)."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(math.ceil(p / 100 * len(ordered)), 1)
    return ordered[rank - 1]


def tool_case_passed(called: list[str], expect_any: list[str], forbid: list[str]) -> tuple[bool, str]:
    """A case passes when (a) no forbidden tool ran, and (b) either at least one expected tool ran, or
    — when nothing is expected — no tool ran at all."""
    bad = [t for t in called if t in forbid]
    if bad:
        return False, f"called forbidden tool(s): {', '.join(sorted(set(bad)))}"
    if expect_any:
        if not any(t in expect_any for t in called):
            return False, f"expected one of {expect_any}, got {called or 'no tools'}"
    elif called:
        return False, f"expected no tools, got {called}"
    return True, "ok"


def recall_at_k(ranked_relevance: list[bool], k: int) -> float:
    """1.0 if any of the top-k results is relevant, else 0.0 (one relevant answer is enough)."""
    return 1.0 if any(ranked_relevance[:k]) else 0.0


def reciprocal_rank(ranked_relevance: list[bool]) -> float:
    for i, rel in enumerate(ranked_relevance, start=1):
        if rel:
            return 1 / i
    return 0.0


def mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def grounded(answer: str, found: bool, citations: int, answerable: bool, must_contain: list[str]) -> tuple[bool, str]:
    """Hallucination check for document answers.
    Unanswerable questions must come back as `found=False` with no citations (the model must not invent).
    Answerable ones must be found, cited, and contain the key facts."""
    if not answerable:
        if found or citations:
            return False, "answered a question the documents cannot answer (possible hallucination)"
        return True, "ok"
    if not found:
        return False, "said the answer is not in the documents, but it is"
    if citations == 0:
        return False, "answer has no citations"
    lowered = answer.lower()
    missing = [m for m in must_contain if m.lower() not in lowered]
    if missing:
        return False, f"answer is missing expected fact(s): {missing}"
    return True, "ok"
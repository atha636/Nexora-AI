"""Talking to a language model. The rest of the app only sees `LLMClient`, so the provider can
be swapped, or faked in tests, without touching the RAG logic.

We call Groq's OpenAI-compatible HTTP endpoint with httpx directly instead of adding another SDK:
one fewer dependency, and it is easy to test with a mock transport."""

import logging
import time
from dataclasses import dataclass
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


class LLMClient(Protocol):
    model: str

    def complete(self, system: str, user: str, *, max_tokens: int) -> LLMResult: ...


class GroqClient:
    def __init__(self, api_key: str, model: str, base_url: str, timeout: float, transport: httpx.BaseTransport | None = None):
        self._api_key = api_key
        self.model = model
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._timeout = timeout
        self._transport = transport  # tests inject a mock transport here

    def complete(self, system: str, user: str, *, max_tokens: int) -> LLMResult:
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0,  # factual Q&A: we want the same answer every time
            "max_tokens": max_tokens,
        }
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
        if res.status_code >= 400:
            log.error("LLM call failed (HTTP %s)", res.status_code)
            raise LLMError("The AI service returned an error. Please try again.")

        try:
            body = res.json()
            text = body["choices"][0]["message"]["content"] or ""
            usage = body.get("usage") or {}
        except (ValueError, KeyError, IndexError, TypeError):
            raise LLMError("The AI service returned an unreadable response.") from None
        return LLMResult(
            text=text.strip(),
            latency_ms=int((time.perf_counter() - started) * 1000),
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
        )


class _Unconfigured:
    model = "unconfigured"

    def complete(self, system: str, user: str, *, max_tokens: int) -> LLMResult:
        raise LLMNotConfigured("AI answers are not configured on this server (missing GROQ_API_KEY).")


def get_llm() -> LLMClient:
    """FastAPI dependency. Cheap to build per request; tests override it."""
    s = get_settings()
    if s.llm_provider == "groq" and s.groq_api_key:
        return GroqClient(s.groq_api_key, s.groq_model, s.groq_base_url, s.llm_timeout_seconds)
    return _Unconfigured()
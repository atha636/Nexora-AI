"""Keeps secrets and personal data out of the logs.

Applied to every log record as it is created, so it covers our code, uvicorn and libraries alike.
It is a safety net: our own code also avoids logging prompts, document text and keys on purpose."""

import logging
import re

_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"), "Bearer [REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}"), "[REDACTED_JWT]"),
    (re.compile(r"\bgsk_[A-Za-z0-9]{10,}"), "[REDACTED_KEY]"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"), "[REDACTED_KEY]"),
    (re.compile(r"(?i)(postgres(?:ql)?(?:\+\w+)?://[^:\s/@]+:)[^@\s]+@"), r"\1[REDACTED]@"),
    (re.compile(r"(?i)((?:password|passwd|secret|api[_-]?key|token)\s*[=:]\s*)[^\s,;&\"']+"), r"\1[REDACTED]"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[email]"),
]


def redact(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


_installed = False


def install_redaction() -> None:
    global _installed
    if _installed:
        return
    original = logging.getLogRecordFactory()

    def factory(*args, **kwargs):
        record = original(*args, **kwargs)
        try:
            record.msg = redact(record.getMessage())
            record.args = ()
        except Exception:  # noqa: BLE001 - logging must never break the request
            pass
        return record

    logging.setLogRecordFactory(factory)
    _installed = True
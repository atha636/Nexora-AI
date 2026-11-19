"""A small in-memory rate limiter (sliding window).

It protects the expensive and sensitive endpoints: logins (password guessing), sign-ups, password
resets, and everything that calls the AI model (which costs money and has a free-tier quota).

Limits: counts live in this server process only. That is right for a single free-tier instance. If the
API ever runs on several instances, move the counters to Redis (the interface below stays the same).
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.core.config import get_settings
from app.core.security import decode_access_token

MAX_KEYS = 10_000


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window: float, now: float | None = None) -> int | None:
        """Records a request. Returns None if allowed, or the seconds to wait if the limit is exceeded."""
        now = time.monotonic() if now is None else now
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window:
                q.popleft()
            if len(q) >= limit:
                return max(int(q[0] + window - now) + 1, 1)
            q.append(now)
            if len(self._hits) > MAX_KEYS:  # keep memory bounded
                for k in [k for k, v in self._hits.items() if not v or v[-1] <= now - window]:
                    del self._hits[k]
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    if get_settings().trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()  # the first entry is the original client
    return request.client.host if request.client else "unknown"


def _identity(request: Request) -> str:
    """Signed-in users are limited per account (so many users behind one office address don't share a limit)."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        sub = decode_access_token(auth[7:])
        if sub:
            return f"user:{sub}"
    return f"ip:{client_ip(request)}"


def too_many(retry_after: int) -> HTTPException:
    return HTTPException(
        429, f"Too many requests. Please wait {retry_after} seconds and try again.", headers={"Retry-After": str(retry_after)}
    )


def rate_limit(name: str, limit: int, window: int = 60):
    """FastAPI dependency: allow `limit` requests per `window` seconds for this caller on this endpoint."""

    def dependency(request: Request) -> None:
        if not get_settings().rate_limit_enabled:
            return
        retry = limiter.hit(f"{name}:{_identity(request)}", limit, window)
        if retry:
            raise too_many(retry)

    return dependency
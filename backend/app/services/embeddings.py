"""Turn text into vectors. The rest of the app only sees the `Embedder` interface, so the
model can be swapped (or faked in tests) without touching anything else."""

import hashlib
import logging
import math
import re
import threading
from functools import lru_cache
from typing import Protocol

from app.core.config import get_settings
from app.db.models import EMBEDDING_DIM

log = logging.getLogger(__name__)


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


def _normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec))
    return [v / norm for v in vec] if norm else vec


class FastEmbedEmbedder:
    """The real all-MiniLM-L6-v2 model, run through ONNX (no PyTorch, ~100MB RAM).
    The model file downloads on first use and is cached afterwards."""

    def __init__(self, model_name: str):
        self._model_name = model_name
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        with self._lock:
            if self._model is None:
                from fastembed import TextEmbedding

                log.info("Loading embedding model %s", self._model_name)
                self._model = TextEmbedding(model_name=self._model_name)
        return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._load()
        return [_normalize([float(x) for x in v]) for v in model.embed(texts, batch_size=32)]


class HashEmbedder:
    """Deterministic stand-in: hashes each word into one of 384 buckets.

    Texts that share words get similar vectors, which is enough to test the pipeline offline.
    It does NOT understand meaning ("car" and "automobile" look unrelated), so never use it
    for real search. Selected with EMBEDDING_PROVIDER=hash."""

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._one(t) for t in texts]

    def _one(self, text: str) -> list[float]:
        vec = [0.0] * EMBEDDING_DIM
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            digest = hashlib.blake2b(word.encode(), digest_size=4).digest()
            n = int.from_bytes(digest, "big")
            vec[n % EMBEDDING_DIM] += 1.0 if (n >> 31) & 1 else -1.0
        return _normalize(vec)


@lru_cache
def get_embedder() -> Embedder:
    """FastAPI dependency. Cached so the model loads once per server process."""
    settings = get_settings()
    if settings.embedding_provider == "hash":
        log.warning("EMBEDDING_PROVIDER=hash: search quality is poor, use only for development")
        return HashEmbedder()
    if settings.embedding_provider == "fastembed":
        return FastEmbedEmbedder(settings.embedding_model)
    raise RuntimeError(f"Unknown EMBEDDING_PROVIDER: {settings.embedding_provider!r}")
"""Split extracted pages into overlapping chunks for embedding.

Sizes are measured in *estimated tokens*. A real tokenizer would be exact but would add a
heavy dependency; English text averages about 1.3 tokens per word, which is accurate enough
for choosing chunk boundaries.

Chunks never cross a page boundary, so every chunk has one correct page number to cite.
"""

import math
from dataclasses import dataclass

from app.services.extraction import Page

TOKENS_PER_WORD = 1.3
MIN_WORDS = 3  # ignore fragments such as a lone page number


@dataclass
class Chunk:
    index: int
    page_number: int | None
    text: str
    token_count: int


def estimate_tokens(word_count: int) -> int:
    return math.ceil(word_count * TOKENS_PER_WORD)


def chunk_pages(pages: list[Page], chunk_tokens: int, overlap_tokens: int) -> list[Chunk]:
    size = max(1, int(chunk_tokens / TOKENS_PER_WORD))  # words per chunk
    overlap = max(0, min(int(overlap_tokens / TOKENS_PER_WORD), size - 1))
    step = size - overlap  # always >= 1, so the loop below always moves forward

    chunks: list[Chunk] = []
    for page in pages:
        words = page.text.split()
        if len(words) < MIN_WORDS:
            continue
        start = 0
        while True:
            window = words[start : start + size]
            chunks.append(
                Chunk(
                    index=len(chunks),
                    page_number=page.number,
                    text=" ".join(window),
                    token_count=estimate_tokens(len(window)),
                )
            )
            if start + size >= len(words):
                break
            start += step
    return chunks
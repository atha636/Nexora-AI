"""Validate uploaded files and pull plain text out of them.

Uploaded files are untrusted. Two layers of defence:
  1. `validate_upload` runs at upload time and rejects anything that is not really a
     PDF / DOCX / TXT (checked by content, not by trusting the file name) or is too big.
  2. `extract_pages` runs at processing time with hard limits on pages and text size.

Every message in `ExtractionError` is written to be shown to the user, so it never
contains file contents, stack traces or server paths.
"""

import io
import re
import zipfile
from dataclasses import dataclass

from app.core.config import get_settings

ALLOWED_EXTENSIONS = {".pdf": "pdf", ".docx": "docx", ".txt": "txt"}

# A DOCX is a zip file. These caps stop "zip bombs" (tiny files that expand to gigabytes).
_MAX_ZIP_ENTRIES = 2000
_MAX_ZIP_UNCOMPRESSED = 50 * 1024 * 1024


class ExtractionError(Exception):
    """A problem with the file itself. The message is safe to show to the user."""


class FileTooLarge(ExtractionError):
    """Upload exceeds the size limit (returned to the client as HTTP 413)."""


@dataclass
class Page:
    number: int | None  # real page number for PDFs; None for DOCX/TXT (no reliable pages)
    text: str


def safe_filename(raw: str | None) -> str:
    """Keep only the display name: no folders, no control characters, bounded length."""
    name = (raw or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip().strip(".")
    return (name or "document")[-255:]


def _extension(filename: str) -> str:
    dot = filename.rfind(".")
    return filename[dot:].lower() if dot != -1 else ""


def validate_upload(filename: str, data: bytes) -> str:
    """Returns the file type ("pdf" | "docx" | "txt") or raises ExtractionError."""
    settings = get_settings()
    kind = ALLOWED_EXTENSIONS.get(_extension(filename))
    if kind is None:
        raise ExtractionError("Unsupported file type. Upload a PDF, DOCX or TXT file.")
    if not data:
        raise ExtractionError("The file is empty.")
    if len(data) > settings.max_upload_bytes:
        mb = settings.max_upload_bytes // (1024 * 1024)
        raise FileTooLarge(f"The file is too large. The limit is {mb} MB.")

    if kind == "pdf":
        if b"%PDF-" not in data[:1024]:
            raise ExtractionError("This file is not a valid PDF.")
    elif kind == "docx":
        _validate_docx_container(data)
    else:
        if b"\x00" in data[:8192]:
            raise ExtractionError("This file is not a plain-text file.")
    return kind


def _validate_docx_container(data: bytes) -> None:
    bad = ExtractionError("This file is not a valid DOCX document.")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            entries = zf.infolist()
            if len(entries) > _MAX_ZIP_ENTRIES:
                raise bad
            if sum(e.file_size for e in entries) > _MAX_ZIP_UNCOMPRESSED:
                raise ExtractionError("This document expands to an unsafe size and was rejected.")
            if "word/document.xml" not in {e.filename for e in entries}:
                raise bad
    except zipfile.BadZipFile:
        raise bad from None


# ---------- text cleaning ----------
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL.sub("", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # re-join words hyphenated across lines
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------- extraction ----------
def extract_pages(kind: str, data: bytes) -> list[Page]:
    settings = get_settings()
    if kind == "pdf":
        pages = _extract_pdf(data, settings.max_pdf_pages)
    elif kind == "docx":
        pages = _extract_docx(data)
    elif kind == "txt":
        pages = [Page(None, _decode_text(data))]
    else:
        raise ExtractionError("Unsupported file type.")

    cleaned = [Page(p.number, clean_text(p.text)) for p in pages]
    cleaned = [p for p in cleaned if p.text]
    if not cleaned:
        raise ExtractionError(
            "No readable text was found in this file. Scanned or image-only documents "
            "need OCR, which isn't supported yet."
        )
    if sum(len(p.text) for p in cleaned) > settings.max_extracted_chars:
        raise ExtractionError("This document contains too much text to index.")
    return cleaned


def _extract_pdf(data: bytes, max_pages: int) -> list[Page]:
    from pypdf import PdfReader  # imported here so a bad install only affects PDFs

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ExtractionError("Password-protected PDFs aren't supported.")
        if len(reader.pages) > max_pages:
            raise ExtractionError(f"This PDF has too many pages. The limit is {max_pages}.")
        pages = []
        for i, page in enumerate(reader.pages, start=1):
            pages.append(Page(i, page.extract_text() or ""))
        return pages
    except ExtractionError:
        raise
    except Exception:
        raise ExtractionError("This PDF could not be read. It may be damaged.") from None


def _extract_docx(data: bytes) -> list[Page]:
    from docx import Document as DocxDocument

    try:
        doc = DocxDocument(io.BytesIO(data))
        parts = [p.text for p in doc.paragraphs]
        for table in doc.tables:
            for row in table.rows:
                parts.append(" | ".join(cell.text.strip() for cell in row.cells))
        return [Page(None, "\n\n".join(parts))]
    except Exception:
        raise ExtractionError("This DOCX could not be read. It may be damaged.") from None


def _decode_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16"):
        if encoding == "utf-16" and not data.startswith((b"\xff\xfe", b"\xfe\xff")):
            continue
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("cp1252", errors="replace")
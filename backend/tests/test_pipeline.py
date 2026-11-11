"""Unit tests for the pure parts of the knowledge-base pipeline (no database, no HTTP)."""

import pytest

from app.services.chunking import chunk_pages, estimate_tokens
from app.services.embeddings import HashEmbedder
from app.services.extraction import (
    ExtractionError,
    Page,
    clean_text,
    extract_pages,
    safe_filename,
    validate_upload,
)
from tests.helpers import make_docx, make_encrypted_pdf, make_pdf

# ---------- chunking ----------
# chunk_tokens=250 -> 192 words per chunk; overlap_tokens=50 -> 38 words of overlap; step = 154.


def words(n: int, prefix: str = "w") -> str:
    return " ".join(f"{prefix}{i}" for i in range(n))


def test_chunk_sizes_overlap_and_count():
    chunks = chunk_pages([Page(1, words(1000))], 250, 50)
    assert len(chunks) == 7
    assert [len(c.text.split()) for c in chunks] == [192] * 6 + [76]
    # each chunk starts with the last 38 words of the previous one
    for prev, nxt in zip(chunks, chunks[1:]):
        assert nxt.text.split()[:38] == prev.text.split()[-38:]
    # nothing is lost: every word appears in at least one chunk
    assert {w for c in chunks for w in c.text.split()} == set(words(1000).split())
    assert [c.index for c in chunks] == list(range(7))


def test_chunk_boundaries_never_cross_pages():
    chunks = chunk_pages([Page(1, words(300, "a")), Page(2, words(300, "b"))], 250, 50)
    for c in chunks:
        prefixes = {w[0] for w in c.text.split()}
        assert len(prefixes) == 1  # a chunk is all from one page
        assert c.page_number == (1 if "a" in prefixes else 2)
    # 300 words = windows [0:192] and [154:300], so two chunks per page
    assert [c.page_number for c in chunks] == [1, 1, 2, 2]
    assert [c.index for c in chunks] == list(range(4))


def test_chunk_edge_cases():
    assert len(chunk_pages([Page(None, words(192))], 250, 50)) == 1  # exactly one window
    assert len(chunk_pages([Page(None, words(193))], 250, 50)) == 2
    assert chunk_pages([Page(1, "12")], 250, 50) == []  # a lone page number is noise
    assert chunk_pages([Page(1, "")], 250, 50) == []
    # silly settings can't cause an endless loop: overlap is capped below the chunk size
    assert len(chunk_pages([Page(1, words(50))], 10, 500)) > 1
    assert chunk_pages([Page(None, words(10))], 250, 50)[0].page_number is None


def test_token_estimate():
    assert estimate_tokens(100) == 130
    chunk = chunk_pages([Page(1, words(192))], 250, 50)[0]
    assert 240 <= chunk.token_count <= 260  # close to the 250-token target


# ---------- cleaning ----------
def test_clean_text():
    raw = "Hello\x00  world\r\n\r\n\r\n\r\nexam-\nple   text\u00a0here\x07"
    assert clean_text(raw) == "Hello world\n\nexample text here"


def test_safe_filename():
    assert safe_filename("../../etc/passwd") == "passwd"
    assert safe_filename("C:\\Users\\me\\report.pdf") == "report.pdf"
    assert safe_filename("bad\x00name\n.txt") == "badname.txt"
    assert safe_filename("") == "document"
    assert safe_filename(None) == "document"
    assert len(safe_filename("x" * 1000 + ".pdf")) <= 255


# ---------- validation ----------
def test_validate_upload_accepts_real_files():
    assert validate_upload("a.pdf", make_pdf(["hello world text"])) == "pdf"
    assert validate_upload("A.DOCX", make_docx(["hello"])) == "docx"
    assert validate_upload("notes.txt", b"plain text") == "txt"


@pytest.mark.parametrize(
    "name,data",
    [
        ("a.exe", b"MZ..."),
        ("noextension", b"hello"),
        ("a.pdf", b""),
        ("a.pdf", b"<html>not a pdf</html>"),
        ("a.docx", b"PK not really a zip"),
        ("a.docx", b"just text"),
        ("a.txt", b"binary\x00data"),
    ],
)
def test_validate_upload_rejects_bad_files(name, data):
    with pytest.raises(ExtractionError):
        validate_upload(name, data)


def test_a_zip_without_word_document_is_not_a_docx():
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hello.txt", "hi")
    with pytest.raises(ExtractionError):
        validate_upload("sneaky.docx", buf.getvalue())


# ---------- extraction ----------
def test_pdf_pages_are_numbered():
    pages = extract_pages("pdf", make_pdf(["First page text here", "Second page text here"]))
    assert [(p.number, p.text) for p in pages] == [(1, "First page text here"), (2, "Second page text here")]


def test_pdf_with_parentheses_and_backslashes():
    pages = extract_pages("pdf", make_pdf(["Total (net) cost is 5 \\ 10 dollars"]))
    assert "(net)" in pages[0].text


def test_scanned_pdf_gives_a_helpful_error():
    with pytest.raises(ExtractionError, match="No readable text"):
        extract_pages("pdf", make_pdf(["", ""]))


def test_encrypted_and_damaged_pdfs():
    with pytest.raises(ExtractionError, match="Password-protected"):
        extract_pages("pdf", make_encrypted_pdf())
    with pytest.raises(ExtractionError, match="could not be read"):
        extract_pages("pdf", b"%PDF-1.4 this is garbage")


def test_pdf_page_limit(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "max_pdf_pages", 2)
    with pytest.raises(ExtractionError, match="too many pages"):
        extract_pages("pdf", make_pdf(["one one one", "two two two", "three three three"]))


def test_docx_text_and_tables():
    data = make_docx(["Intro paragraph", "Second paragraph"], table=[["Plan", "Price"], ["Pro", "99"]])
    pages = extract_pages("docx", data)
    assert len(pages) == 1 and pages[0].number is None
    assert "Intro paragraph" in pages[0].text and "Pro | 99" in pages[0].text


def test_text_decoding():
    assert extract_pages("txt", "héllo wörld".encode("utf-8"))[0].text == "héllo wörld"
    assert extract_pages("txt", b"\xef\xbb\xbfwith bom")[0].text == "with bom"
    assert extract_pages("txt", "utf sixteen text".encode("utf-16"))[0].text == "utf sixteen text"
    assert "caf" in extract_pages("txt", "café".encode("cp1252"))[0].text  # legacy Windows text
    with pytest.raises(ExtractionError):
        extract_pages("txt", b"   \n  \n ")


# ---------- hash embedder (the offline test double) ----------
def test_hash_embedder_is_deterministic_normalized_and_word_sensitive():
    e = HashEmbedder()
    a, a2, b, c = e.embed(["refund policy thirty days", "refund policy thirty days", "refund days", "shipping warehouse"])
    assert a == a2
    assert len(a) == 384 and abs(sum(x * x for x in a) - 1) < 1e-6

    def dot(x, y):
        return sum(i * j for i, j in zip(x, y))

    assert dot(a, b) > dot(a, c)  # shared words -> more similar
    assert e.embed([""])[0] == [0.0] * 384  # empty text doesn't crash
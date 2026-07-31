"""Page-faithful text extraction.

The citation is the whole point, and in the Myriad guide a bare page number is
not enough: the printed page number RESETS to 1 at the start of each product
section, so there are ~52 pages numbered "Page 3" in one file. A citation is
therefore (part, printed_page), with pdf_page kept as the unambiguous key.

Rather than computing the printed number arithmetically, we read the footer
label the typesetter put there. Arithmetic is only a fallback.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber

log = logging.getLogger(__name__)

# Footer label. pdfplumber joins the footer into one line, e.g.
# "Myriad technical guide - February 2024 Page 12", so match at the end of the
# line rather than anchoring the whole line.
_PAGE_LABEL = re.compile(r"page\s+(\d{1,4})\s*$", re.IGNORECASE)
# Dot/underscore leaders on contents lines: "Death Benefit ....... 3"
_LEADERS = re.compile(r"\s*[._\u2026]{3,}.*$")
_FOOTER_SCAN = 4  # how many trailing lines to search for the label


@dataclass(slots=True)
class Page:
    pdf_page: int              # 1-based index into the file; always unambiguous
    printed_page: int | None   # the number printed on the page, resets per part
    part: str | None           # product/section the printed number belongs to
    text: str


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_page_label(text: str) -> int | None:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for line in reversed(lines[-_FOOTER_SCAN:]):
        m = _PAGE_LABEL.search(line)
        if m:
            return int(m.group(1))
    return None


def read_part_title(text: str) -> str | None:
    """On a page numbered 1, the part title is the first line - usually the
    heading of that part's mini table of contents, with leaders attached."""
    for line in (ln.strip() for ln in text.splitlines()):
        if not line:
            continue
        title = _LEADERS.sub("", line).strip(" ._")
        return title or None
    return None


def extract_pages(
    path: Path,
    *,
    page_offset: int = 1,
    first: int | None = None,
    last: int | None = None,
) -> list[Page]:
    """Extract text page by page, carrying the part title forward.

    `first`/`last` are 1-based pdf page bounds, for spiking on one section
    without paying the full 454-page extraction cost.
    """
    pages: list[Page] = []
    current_part: str | None = None
    labelled = 0

    with pdfplumber.open(path) as pdf:
        total = len(pdf.pages)
        lo = max(1, first or 1)
        hi = min(last or total, total)
        log.info("extracting pages %d-%d of %d from %s", lo, hi, total, path.name)

        for i in range(lo, hi + 1):
            text = pdf.pages[i - 1].extract_text(x_tolerance=1.5, y_tolerance=2.0) or ""
            label = read_page_label(text)
            if label is not None:
                labelled += 1
            # A page numbered 1 opens a new part.
            if label == 1:
                current_part = read_part_title(text) or current_part
            printed = label if label is not None else i - page_offset
            pages.append(
                Page(pdf_page=i, printed_page=printed, part=current_part, text=text)
            )
            if (i - lo + 1) % 50 == 0:
                log.info("  ...%d/%d", i - lo + 1, hi - lo + 1)

    empty = sum(1 for p in pages if not p.text.strip())
    if empty:
        log.warning(
            "%d/%d pages produced no text - if this is most of the file the "
            "PDF has no text layer and needs OCR first",
            empty, len(pages),
        )
    if labelled < len(pages) * 0.5:
        log.warning(
            "only %d/%d pages had a readable 'Page N' footer; falling back to "
            "pdf_page - %d for the rest, which may cite the wrong page",
            labelled, len(pages), page_offset,
        )
    parts = sorted({p.part for p in pages if p.part})
    log.info("found %d part(s), e.g. %s", len(parts), "; ".join(parts[:4]))
    return pages

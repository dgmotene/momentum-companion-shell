"""Cleaning.

Running headers and footers repeat on hundreds of pages. Left in, they become
the most statistically ordinary text in the corpus and drag on every search.
They are detected empirically rather than by hardcoded pattern: a line in the
top or bottom band that recurs across a large share of pages is boilerplate.
"""

from __future__ import annotations

import logging
import re
from collections import Counter

from .extract import Page

log = logging.getLogger(__name__)

BAND_LINES = 3          # max lines from the top/bottom considered header/footer


def _band(line_count: int) -> int:
    """How many lines at each edge count as header/footer.

    Fixed at 3, a short page (a section end, a table page) would have its
    entire body sitting inside the band and be eligible for stripping. Never
    let the two bands claim more than two thirds of the page.
    """
    return max(1, min(BAND_LINES, line_count // 3))
_DIGITS = re.compile(r"\d+")
_WS = re.compile(r"[ \t]+")
_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")
_MULTI_NL = re.compile(r"\n{3,}")
_DOT_LEADER = re.compile(r"\.{4,}\s*\d+\s*$")  # table-of-contents leader lines


def _normalise(line: str) -> str:
    """Collapse a line to a comparison key: page numbers vary, the rest does not."""
    return _DIGITS.sub("#", line.strip().lower())


def find_boilerplate(pages: list[Page], threshold: float = 0.5) -> set[str]:
    counts: Counter[str] = Counter()
    non_empty = 0
    for page in pages:
        lines = [ln for ln in page.text.splitlines() if ln.strip()]
        if not lines:
            continue
        non_empty += 1
        b = _band(len(lines))
        band = lines[:b] + lines[-b:]
        for key in {_normalise(ln) for ln in band}:
            if key:
                counts[key] += 1

    if not non_empty:
        return set()
    cutoff = max(3, int(non_empty * threshold))
    boiler = {key for key, n in counts.items() if n >= cutoff}
    if boiler:
        log.info("stripping %d boilerplate line(s) seen on >=%d pages",
                 len(boiler), cutoff)
    return boiler


def clean_page(page: Page, boilerplate: set[str]) -> Page:
    kept: list[str] = []
    lines = page.text.splitlines()
    last = len(lines) - 1
    b = _band(len([ln for ln in lines if ln.strip()]))
    for idx, line in enumerate(lines):
        in_band = idx < b or idx > last - b
        if in_band and _normalise(line) in boilerplate:
            continue
        if _DOT_LEADER.search(line):   # TOC filler, no retrievable meaning
            continue
        kept.append(_WS.sub(" ", line).rstrip())

    text = "\n".join(kept)
    text = _HYPHEN_BREAK.sub(r"\1\2", text)   # rejoin words split across lines
    text = _MULTI_NL.sub("\n\n", text).strip()
    return Page(pdf_page=page.pdf_page, printed_page=page.printed_page, text=text)


def clean_pages(pages: list[Page], *, threshold: float = 0.5) -> list[Page]:
    boiler = find_boilerplate(pages, threshold)
    return [clean_page(p, boiler) for p in pages]

"""Chunking: split on section headings first, then into token windows.

Heading-first matters because a chunk that straddles two topics retrieves
badly for both. Within a section, windows of ~chunk_tokens with overlap keep
sentences that fall near a boundary reachable from either side.

Token counting uses tiktoken's cl100k as a stand-in. Titan tokenises
differently, so treat the count as approximate - it is a chunking heuristic,
not a billing figure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from .extract import Page

# This guide marks headings with trailing leaders: "Age limits ______________".
# That is the strongest signal in the document, so it is tried first.
_LEADER_HEADING = re.compile(r"^(?P<title>.{2,70}?)\s*[_.\u2026]{4,}\s*$")

# Secondary styles: numbered ("4.2 Claims") or ALL CAPS.
_HEADING = re.compile(
    r"""^(
        (?:\d+(?:\.\d+)*[\.\)]?\s+\S.{0,70})      # 3.  /  3.1.2  Something
      | (?:(?:CHAPTER|SECTION|PART|APPENDIX)\s+[\dIVXLC]+.{0,60})
      | (?:[A-Z][A-Z0-9 &/,'\-]{5,70})            # ALL CAPS HEADING
    )$""",
    re.VERBOSE,
)


def _letter_ratio(text: str) -> float:
    stripped = [c for c in text if not c.isspace()]
    if not stripped:
        return 0.0
    return sum(c.isalpha() for c in stripped) / len(stripped)


def heading_of(line: str) -> str | None:
    """Return the heading title carried by this line, or None.

    Rejects digit-heavy lines: a benefit table row like "R50 000 R5 000 000"
    otherwise matches the ALL-CAPS rule and shatters the surrounding section.
    """
    stripped = line.strip()
    if not stripped:
        return None

    m = _LEADER_HEADING.match(stripped)
    if m:
        title = m.group("title").strip()
        if 2 < len(title) <= 70 and _letter_ratio(title) >= 0.5:
            return title
        return None

    if not (3 < len(stripped) <= 80):
        return None
    if _letter_ratio(stripped) < 0.5:
        return None
    if stripped.endswith((".", ",", ";", ":")) and not re.match(r"^\d", stripped):
        return None
    return stripped if _HEADING.match(stripped) else None


class _WordTokenizer:
    """Fallback used when tiktoken's encoding file cannot be fetched.

    tiktoken downloads cl100k_base on first use; in an air-gapped container
    that raises mid-ingest for a reason unrelated to the corpus. Whitespace
    tokens round-trip exactly and run ~25% under the BPE count on English
    prose - close enough for a chunking heuristic. Bake TIKTOKEN_CACHE_DIR
    into the image to get the real tokenizer (see README).
    """

    _SPLIT = re.compile(r"\S+\s*|\s+")

    def encode(self, text: str) -> list[str]:
        return self._SPLIT.findall(text)

    def decode(self, tokens: list[str]) -> str:
        return "".join(tokens)


@lru_cache
def _encoder():
    try:
        import tiktoken

        enc = tiktoken.get_encoding("cl100k_base")
        enc.encode("warmup")  # force the download now, not mid-ingest
        return enc
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).warning(
            "tiktoken unavailable; falling back to approximate word tokenizer"
        )
        return _WordTokenizer()


def count_tokens(text: str) -> int:
    return len(_encoder().encode(text))


@dataclass(slots=True)
class Chunk:
    chunk_index: int
    part: str | None          # product section; printed_page is only unique within it
    section: str | None       # heading within the part
    printed_page: int | None
    pdf_page: int
    token_count: int
    content: str


@dataclass(slots=True)
class _Block:
    """A run of text under one heading, remembering where it started."""
    part: str | None
    section: str | None
    pdf_page: int
    printed_page: int | None
    lines: list[str]

    @property
    def text(self) -> str:
        return "\n".join(self.lines).strip()

    @property
    def labelled_text(self) -> str:
        """Body with its own heading attached, so packing several together
        keeps each field identifiable."""
        return f"{self.section}\n{self.text}".strip() if self.section else self.text


def split_into_blocks(pages: list[Page]) -> list[_Block]:
    blocks: list[_Block] = []
    current: _Block | None = None
    section: str | None = None

    for page in pages:
        if not page.text.strip():
            continue
        for line in page.text.splitlines():
            title = heading_of(line)
            if title:
                if current and current.text:
                    blocks.append(current)
                section = title
                current = _Block(
                    page.part, section, page.pdf_page, page.printed_page, []
                )
                continue
            if current is None:
                current = _Block(
                    page.part, section, page.pdf_page, page.printed_page, []
                )
            current.lines.append(line)
        # A block spanning pages keeps the page where it began: that is where
        # a reader following the citation should turn to.
    if current and current.text:
        blocks.append(current)
    return blocks


def _window(tokens: list, size: int, overlap: int):
    step = max(1, size - overlap)
    for start in range(0, len(tokens), step):
        piece = tokens[start:start + size]
        if not piece:
            break
        yield piece
        if start + size >= len(tokens):
            break


def _pack(blocks: list[_Block], enc, max_tokens: int) -> list[list[_Block]]:
    """Group consecutive blocks up to the token budget.

    The guide is written as many short labelled fields - "Description",
    "Type of benefit", "Age limits" - each only a line or two. Emitted one per
    chunk they average ~30 tokens, which retrieves badly: there is not enough
    context in "Entry age 18-60" to match a real question, and the answer to
    "what are the Education Protector age limits" is split across neighbours.
    Packing restores paragraph-sized context.

    A part boundary always forces a break: never merge two products into one
    chunk, or a citation cannot name a single source.
    """
    groups: list[list[_Block]] = []
    current: list[_Block] = []
    used = 0

    for block in blocks:
        cost = len(enc.encode(block.labelled_text))
        same_part = not current or current[-1].part == block.part
        if current and (not same_part or used + cost > max_tokens):
            groups.append(current)
            current, used = [], 0
        current.append(block)
        used += cost
    if current:
        groups.append(current)
    return groups


def chunk_pages(
    pages: list[Page], *, chunk_tokens: int = 400, chunk_overlap: int = 60
) -> list[Chunk]:
    enc = _encoder()
    chunks: list[Chunk] = []
    index = 0

    blocks = [b for b in split_into_blocks(pages) if b.text]

    for group in _pack(blocks, enc, chunk_tokens):
        head = group[0]
        body = "\n\n".join(b.labelled_text for b in group)
        # The part name goes into the embedded text: "Age limits" appears under
        # ~50 different products and is meaningless on its own.
        prefix = f"{head.part}\n\n" if head.part else ""
        tokens = enc.encode(body)

        if len(tokens) <= chunk_tokens:
            pieces = [body]
        else:
            pieces = [enc.decode(w) for w in _window(tokens, chunk_tokens, chunk_overlap)]

        for piece in pieces:
            content = (prefix + piece).strip()
            if len(content) < 40:  # stray fragments retrieve noise
                continue
            chunks.append(
                Chunk(
                    chunk_index=index,
                    part=head.part,
                    section=head.section,
                    printed_page=head.printed_page,
                    pdf_page=head.pdf_page,
                    token_count=count_tokens(content),
                    content=content,
                )
            )
            index += 1

    return chunks

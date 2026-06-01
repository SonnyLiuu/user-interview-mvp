"""
Transcript file parser for manual upload (.txt, .vtt, .srt).

Produces a list of ParsedTurn dicts that can be fed directly into
_handle_transcript_turn() via the transcript-upload endpoint.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public data types
# ---------------------------------------------------------------------------


@dataclass
class ParsedTurn:
    speaker: str = "Speaker"
    text: str = ""
    start_ms: int | None = None
    end_ms: int | None = None


# ---------------------------------------------------------------------------
# Format detection
# ---------------------------------------------------------------------------


def detect_format(filename: str) -> str:
    """Return 'txt', 'vtt', or 'srt' based on the filename extension."""
    lower = filename.lower()
    if lower.endswith(".vtt"):
        return "vtt"
    if lower.endswith(".srt"):
        return "srt"
    return "txt"


# ---------------------------------------------------------------------------
# .txt parser
# ---------------------------------------------------------------------------

_SPEAKER_LINE_RE = re.compile(r"^([A-Za-z][A-Za-z0-9 ._-]{0,40}):\s*(.+)$")


def parse_txt(content: str) -> list[ParsedTurn]:
    """Parse a plain-text transcript.

    Strategy:
    - Lines matching ``Name: text`` are treated as speaker-labeled turns.
    - Consecutive non-labeled lines are merged into the preceding speaker's turn.
    - Leading non-labeled lines before any speaker label get speaker="Speaker".
    """
    lines = [line.strip() for line in content.splitlines()]
    turns: list[ParsedTurn] = []
    current_speaker = "Speaker"
    current_text: list[str] = []

    for line in lines:
        if not line:
            continue
        m = _SPEAKER_LINE_RE.match(line)
        if m:
            # Flush previous turn
            if current_text:
                turns.append(ParsedTurn(speaker=current_speaker, text=" ".join(current_text)))
                current_text = []
            current_speaker = m.group(1).strip()
            current_text.append(m.group(2).strip())
        else:
            current_text.append(line)

    if current_text:
        turns.append(ParsedTurn(speaker=current_speaker, text=" ".join(current_text)))

    return turns


# ---------------------------------------------------------------------------
# .vtt parser (WebVTT)
# ---------------------------------------------------------------------------

_VTT_SPEAKER_RE = re.compile(r"<v\s+([^>]+)>(.*?)</v>", re.IGNORECASE)


def parse_vtt(content: str) -> list[ParsedTurn]:
    """Parse a WebVTT file.

    Handles:
    - Standard cue blocks with optional <v Speaker> tags.
    - Bare text cues (no <v> tag) → speaker="Speaker".
    - WEBVTT header line and NOTE blocks are skipped.
    """
    try:
        import webvtt
    except ImportError:
        logger.warning("webvtt-py not installed; falling back to regex-based VTT parser")
        return _parse_vtt_regex(content)

    turns: list[ParsedTurn] = []
    try:
        # webvtt-py expects a file path, but we can use its internal parser
        # via from_srt / from_string methods depending on version.
        # We write to a temp approach: parse lines manually then use webvtt
        # for timestamp extraction.
        captions = webvtt.from_buffer(content.encode("utf-8") if isinstance(content, str) else content)
        for caption in captions:
            raw_text = caption.text.strip() if caption.text else ""
            if not raw_text:
                continue
            turns.extend(_extract_vtt_speaker_turns(
                raw_text,
                start_ms=_ts_to_ms(caption.start) if caption.start else None,
                end_ms=_ts_to_ms(caption.end) if caption.end else None,
            ))
    except Exception:
        logger.exception("webvtt-py parse failed; falling back to regex")
        return _parse_vtt_regex(content)

    return turns


def _parse_vtt_regex(content: str) -> list[ParsedTurn]:
    """Fallback regex-based WebVTT parser (no webvtt-py dependency)."""
    turns: list[ParsedTurn] = []
    # Strip WEBVTT header
    body = re.sub(r"^WEBVTT.*\n", "", content, count=1, flags=re.IGNORECASE)
    # Split on timestamp lines: 00:00:00.000 --> 00:00:05.000
    blocks = re.split(r"\n\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}.*\n", "\n" + body)
    for block in blocks:
        text = block.strip()
        if not text or text.startswith("NOTE"):
            continue
        turns.extend(_extract_vtt_speaker_turns(text))
    return turns


def _extract_vtt_speaker_turns(
    raw_text: str,
    start_ms: int | None = None,
    end_ms: int | None = None,
) -> list[ParsedTurn]:
    """Extract speaker-labeled turns from a single VTT cue's text."""
    parts = _VTT_SPEAKER_RE.findall(raw_text)
    if parts:
        return [
            ParsedTurn(
                speaker=speaker.strip(),
                text=text.strip(),
                start_ms=start_ms,
                end_ms=end_ms,
            )
            for speaker, text in parts
        ]
    # No <v> tags — treat the whole cue as one turn
    return [ParsedTurn(speaker="Speaker", text=raw_text.strip(), start_ms=start_ms, end_ms=end_ms)]


# ---------------------------------------------------------------------------
# .srt parser (SubRip)
# ---------------------------------------------------------------------------

_SRT_BLOCK_RE = re.compile(
    r"(\d+)\s*\n"                          # index
    r"(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*\n"  # timestamps
    r"((?:.+\n?)+?)(?=\n\d+\n|\Z)",        # text (one or more lines)
    re.MULTILINE,
)


def parse_srt(content: str) -> list[ParsedTurn]:
    """Parse an SRT file.

    Strategy:
    - Match standard SRT blocks with index + timestamps + text.
    - If a subtitle block contains multiple lines, they are merged into one turn.
    - <v Speaker> tags inside SRT text are treated the same as VTT.
    """
    content = content.replace("\r\n", "\n")
    turns: list[ParsedTurn] = []

    for m in _SRT_BLOCK_RE.finditer(content):
        start_str = m.group(2)
        end_str = m.group(3)
        text = m.group(4).strip()

        if not text:
            continue

        start_ms = _srt_ts_to_ms(start_str)
        end_ms = _srt_ts_to_ms(end_str)

        # Check for <v Speaker> tags (some SRT files use VTT-style markup)
        vtt_turns = _extract_vtt_speaker_turns(text, start_ms=start_ms, end_ms=end_ms)
        if len(vtt_turns) > 1 or (len(vtt_turns) == 1 and vtt_turns[0].speaker != "Speaker"):
            turns.extend(vtt_turns)
        else:
            # Merge multi-line subtitle text
            merged = " ".join(line.strip() for line in text.split("\n") if line.strip())
            turns.append(ParsedTurn(speaker="Speaker", text=merged, start_ms=start_ms, end_ms=end_ms))

    return turns


# ---------------------------------------------------------------------------
# Unified public API
# ---------------------------------------------------------------------------


def parse_transcript(content: str | bytes, filename: str) -> list[ParsedTurn]:
    """Parse a transcript file into a list of ParsedTurn objects.

    Args:
        content: Raw file content as string or bytes.
        filename: Original filename, used to detect format via extension.

    Returns:
        List of ParsedTurn objects ready for ingestion.
    """
    fmt = detect_format(filename)
    text = content.decode("utf-8") if isinstance(content, bytes) else content

    if fmt == "vtt":
        return parse_vtt(text)
    if fmt == "srt":
        return parse_srt(text)
    return parse_txt(text)


def apply_speaker_map(
    turns: list[ParsedTurn],
    speaker_map: dict[str, str] | None,
) -> list[ParsedTurn]:
    """Remap speaker names (e.g. 'Speaker 1' → 'Founder')."""
    if not speaker_map:
        return turns
    for turn in turns:
        if turn.speaker in speaker_map:
            turn.speaker = speaker_map[turn.speaker]
    return turns


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ts_to_ms(ts_str: str) -> int | None:
    """Convert a webvtt-py timestamp string like '00:01:23.456' to ms."""
    try:
        parts = ts_str.replace(",", ".").split(":")
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600000 + int(m) * 60000 + int(float(s) * 1000)
    except (ValueError, TypeError):
        pass
    return None


def _srt_ts_to_ms(ts_str: str) -> int:
    """Convert an SRT timestamp like '00:01:23,456' to ms."""
    parts = ts_str.replace(",", ".").split(":")
    h, m, s = parts
    return int(h) * 3600000 + int(m) * 60000 + int(float(s) * 1000)

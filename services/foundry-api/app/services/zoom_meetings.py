from __future__ import annotations

from typing import Any
from urllib.parse import unquote, urlparse


def normalize_zoom_meeting_identifier(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None

    candidate = raw
    parsed = urlparse(raw if "://" in raw else f"https://placeholder/{raw}")
    if parsed.netloc and "zoom." in parsed.netloc.lower():
        parts = [part for part in parsed.path.split("/") if part]
        for marker in ("j", "join", "my"):
            if marker in parts:
                index = parts.index(marker)
                if index + 1 < len(parts):
                    candidate = parts[index + 1]
                    break
        else:
            query = dict(part.split("=", 1) for part in parsed.query.split("&") if "=" in part)
            candidate = query.get("confno") or query.get("meetingId") or raw

    decoded = unquote(candidate).strip()
    numeric = decoded.replace(" ", "").replace("-", "")
    if numeric.isdigit() and 9 <= len(numeric) <= 12:
        return numeric
    return decoded or None

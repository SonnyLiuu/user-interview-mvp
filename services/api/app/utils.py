from __future__ import annotations

import re

from fastapi.encoders import jsonable_encoder


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")
    return slug or "project"


def encode_payload(value):
    return jsonable_encoder(value)

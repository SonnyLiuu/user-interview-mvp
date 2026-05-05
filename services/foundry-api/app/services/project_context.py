from __future__ import annotations

import json
from typing import Any


def normalize_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


def foundation_to_project_context(foundation: dict | None) -> dict:
    foundation = foundation or {}
    ideal_people = foundation.get("idealPeopleTypes") or []
    disqualifiers = foundation.get("disqualifiers") or []

    context_lines = [
        foundation.get("summary"),
        f"Target user: {foundation.get('targetUser')}" if foundation.get("targetUser") else None,
        f"Pain point: {foundation.get('painPoint')}" if foundation.get("painPoint") else None,
        f"Value proposition: {foundation.get('valueProp')}" if foundation.get("valueProp") else None,
        f"Differentiation: {foundation.get('differentiation')}" if foundation.get("differentiation") else None,
    ]

    return {
        "idea_summary": "\n".join([line for line in context_lines if line]),
        "target_customer": foundation.get("targetUser"),
        "pain_point": foundation.get("painPoint"),
        "value_prop": foundation.get("valueProp"),
        "ideal_people_types": ideal_people if isinstance(ideal_people, list) else [],
        "disqualifiers": disqualifiers if isinstance(disqualifiers, list) else [],
        "key_assumptions": [
            value
            for value in [
                foundation.get("painPoint"),
                foundation.get("valueProp"),
                foundation.get("targetUser"),
            ]
            if value
        ],
    }


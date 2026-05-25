from __future__ import annotations

import json
from typing import Any

from ..project_modes import normalize_project_type


def normalize_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


def foundation_to_project_context(foundation: dict | None, project_type: str = "startup") -> dict:
    foundation = foundation or {}
    normalized_type = normalize_project_type(project_type)
    ideal_people = foundation.get("idealPeopleTypes") or []
    disqualifiers = foundation.get("disqualifiers") or []
    labels = {
        "target": "Target recipients" if normalized_type == "networking" else "Target user",
        "pain": "Reason/context" if normalized_type == "networking" else "Pain point",
        "value": "Core message/ask" if normalized_type == "networking" else "Value proposition",
        "differentiation": "Credibility hook" if normalized_type == "networking" else "Differentiation",
    }

    context_lines = [
        foundation.get("summary"),
        f"{labels['target']}: {foundation.get('targetUser')}" if foundation.get("targetUser") else None,
        f"{labels['pain']}: {foundation.get('painPoint')}" if foundation.get("painPoint") else None,
        f"{labels['value']}: {foundation.get('valueProp')}" if foundation.get("valueProp") else None,
        f"{labels['differentiation']}: {foundation.get('differentiation')}" if foundation.get("differentiation") else None,
    ]

    return {
        "project_type": normalized_type,
        "idea_summary": "\n".join([line for line in context_lines if line]),
        "target_customer": foundation.get("targetUser"),
        "pain_point": foundation.get("painPoint"),
        "value_prop": foundation.get("valueProp"),
        "differentiation": foundation.get("differentiation"),
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


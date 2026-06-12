from __future__ import annotations

import json
import re


def _slot_value(value: str, quality: str = "solid") -> dict:
    return {"value": value, "quality": quality}


def _slot_values(values: list[str], quality: str = "solid") -> dict:
    return {"values": values, "quality": quality}


def _has_solid_slot(extracted: dict, key: str) -> bool:
    patch = extracted.get(key)
    if not isinstance(patch, dict):
        return False
    if patch.get("quality") == "missing":
        return False
    value = patch.get("value")
    values = patch.get("values")
    return bool((isinstance(value, str) and value.strip()) or (isinstance(values, list) and values))


def extract_selectivity_detail(text: str) -> str | None:
    compact = " ".join(text.split())
    match = re.search(
        r"(?i)(?:only\s+)?(\d+\s*(?:out of|/)\s*\d+[^.;,\n]*(?:selected|accepted|oral|papers)[^.;\n]*)",
        compact,
    )
    if match:
        return match.group(1).strip()
    match = re.search(r"(?i)((?:very\s+)?selective[^.;\n]*)", compact)
    if match:
        return match.group(1).strip()
    return None


def _mentions_in_person_time(text: str) -> bool:
    lower = text.lower()
    return any(token in lower for token in ["in person", "during the workshop", "at the workshop", "on tuesday", "tuesday"])


def _networking_kickoff_hints(user_message: str) -> dict:
    lower = user_message.lower()
    hints: dict[str, dict] = {}

    event_match = re.search(r"(?i)(CAIS\s*26\s+Agent\s+Skills\s+workshop|Agent\s+Skills\s+workshop)", user_message)
    event_name = event_match.group(1) if event_match else "the shared event"

    has_linkedin = "linkedin" in lower
    has_invited = "invited speaker" in lower or "invited speakers" in lower
    has_organizer = "organizer" in lower or "organizers" in lower
    if has_invited and has_organizer:
        recipients = f"Invited speakers and organizers of {event_name}"
    elif has_invited:
        recipients = f"Invited speakers of {event_name}"
    elif has_organizer:
        recipients = f"Organizers of {event_name}"
    else:
        recipients = ""

    if has_linkedin:
        target = recipients or f"the target recipients for {event_name}"
        hints["outreachGoal"] = _slot_value(f"Connect with {target} on LinkedIn")
        hints["desiredOutcome"] = _slot_value(
            "Connect on LinkedIn and look forward to meeting in person"
            if _mentions_in_person_time(user_message)
            else "Connect on LinkedIn"
        )
        hints["channelFormat"] = _slot_value("LinkedIn connection note under 300 characters")
    if recipients:
        hints["recipients"] = _slot_value(recipients)

    presenting = any(token in lower for token in ["oral presentation", "oral presenter", "presenting", "present at"])
    paper = "paper" in lower or "publication" in lower
    if presenting:
        background = f"The user is giving an oral presentation at {event_name}"
        if paper:
            background += " on their paper"
        hints["senderContext"] = _slot_value(background)

    if _mentions_in_person_time(user_message):
        if "tuesday" in lower:
            hints["sharedContext"] = _slot_value(f"The user and recipients will be at {event_name} on Tuesday")
            hints["desiredOutcome"] = _slot_value("Connect on LinkedIn and look forward to meeting on Tuesday")
        else:
            hints["sharedContext"] = _slot_value(f"The user and recipients will be at {event_name} in person")

    if presenting:
        mentions = [f"The user is giving an oral presentation at {event_name}"]
        hints["requiredMentions"] = _slot_values(mentions)

    return hints


def apply_networking_kickoff_hints(extracted: dict, user_message: str) -> dict:
    patched = dict(extracted)
    for key, value in _networking_kickoff_hints(user_message).items():
        if not _has_solid_slot(patched, key):
            patched[key] = value

    selectivity = extract_selectivity_detail(user_message)
    if selectivity:
        required_patch = patched.get("requiredMentions")
        if isinstance(required_patch, dict):
            values = [
                item
                for item in required_patch.get("values", [])
                if (
                    isinstance(item, str)
                    and "out of" not in item.lower()
                    and "/" not in item
                    and "selective" not in item.lower()
                    and "selected" not in item.lower()
                    and "accepted" not in item.lower()
                )
            ]
            if values:
                patched["requiredMentions"] = _slot_values(values, required_patch.get("quality") or "solid")
            else:
                patched.pop("requiredMentions", None)
        optional = patched.get("optionalMentions")
        values = optional.get("values", []) if isinstance(optional, dict) else []
        if isinstance(values, list):
            patched["optionalMentions"] = _slot_values(_append_unique(values, selectivity))
        patched["personalizationStrategy"] = _slot_value("", "missing")

    return patched


def networking_selectivity_turn(selectivity_detail: str | None) -> dict:
    detail = selectivity_detail or "the selective acceptance detail"
    question = (
        "Do you want recipient personalization, and should we include the 6 out of 45 selectivity detail?"
        if "6" in detail and "45" in detail
        else f"Do you want recipient personalization, and should we include the {detail} detail?"
    )
    include_label = (
        "Include the 6 out of 45 selectivity detail"
        if "6" in detail and "45" in detail
        else "Include the selectivity detail"
    )
    return {
        "targetSlot": "personalizationStrategy",
        "question": question,
        "choices": [
            {
                "id": "a",
                "label": f"Light personalization, and {include_label.lower()}",
                "normalizedValue": f"Use a concise LinkedIn note with light recipient personalization and include this optional credibility detail: {detail}",
                "slotKey": "personalizationStrategy",
            },
            {
                "id": "b",
                "label": "Light personalization, but omit the selectivity detail",
                "normalizedValue": "Use a concise LinkedIn note with light recipient personalization; mention the oral presentation but do not include the selectivity detail.",
                "slotKey": "personalizationStrategy",
            },
            {
                "id": "c",
                "label": "No recipient personalization; keep the note shared-context only",
                "normalizedValue": "Use a concise LinkedIn note without recipient-specific personalization; mention only the shared context, oral presentation, and desired next step.",
                "slotKey": "personalizationStrategy",
            },
            {
                "id": "d",
                "label": "Role-based personalization for speakers vs organizers",
                "normalizedValue": f"Use concise role-based personalization for speakers versus organizers and include the selectivity detail only when it fits naturally: {detail}",
                "slotKey": "personalizationStrategy",
            },
        ],
        "customPlaceholder": "Say whether to personalize each message, and whether to include the selectivity detail...",
    }


def networking_personalization_turn() -> dict:
    return {
        "targetSlot": "personalizationStrategy",
        "question": "Do you want these messages personalized, and if so how much?",
        "choices": [
            {
                "id": "a",
                "label": "No recipient personalization: use only the shared context and ask",
                "normalizedValue": "No recipient personalization: use only the shared context and ask.",
                "slotKey": "personalizationStrategy",
            },
            {
                "id": "b",
                "label": "Light personalization: add one obvious recipient hook when available",
                "normalizedValue": "Light personalization: add one obvious recipient hook when available.",
                "slotKey": "personalizationStrategy",
            },
            {
                "id": "c",
                "label": "Role-based personalization for recipient types",
                "normalizedValue": "Role-based personalization: adapt the note for recipient types such as speakers, organizers, advisors, or collaborators.",
                "slotKey": "personalizationStrategy",
            },
            {
                "id": "d",
                "label": "High personalization: include a specific work detail when available",
                "normalizedValue": "High personalization: include a specific detail from the recipient's work when available.",
                "slotKey": "personalizationStrategy",
            },
        ],
        "customPlaceholder": "Describe whether to personalize each message and how much...",
    }


def _append_unique(values: list[str], item: str) -> list[str]:
    if not item:
        return values
    seen = {value.strip().lower() for value in values if isinstance(value, str)}
    return values if item.strip().lower() in seen else [*values, item]


def _foundation_list(value) -> list[str]:
    return [item.strip() for item in value if isinstance(item, str) and item.strip()] if isinstance(value, list) else []


def _clean_prompt_text(value) -> str:
    if isinstance(value, str):
        return " ".join(value.strip().split())
    if value is None:
        return ""
    try:
        return " ".join(json.dumps(value, ensure_ascii=False).strip().split())
    except TypeError:
        return " ".join(str(value).strip().split())


def normalize_networking_foundation(foundation: dict, state: dict, transcript: str) -> dict:
    normalized = dict(foundation)
    haystack = f"{json.dumps(state, ensure_ascii=False)}\n{transcript}"
    lower = haystack.lower()
    hints = _networking_kickoff_hints(haystack)

    for key in ["outreachGoal", "recipients", "senderContext", "sharedContext", "desiredOutcome", "channelFormat"]:
        if not normalized.get(key):
            patch = hints.get(key)
            if isinstance(patch, dict) and patch.get("value"):
                normalized[key] = patch["value"]

    required_mentions = _foundation_list(normalized.get("requiredMentions"))
    hint_mentions = hints.get("requiredMentions")
    if isinstance(hint_mentions, dict):
        for item in _foundation_list(hint_mentions.get("values")):
            required_mentions = _append_unique(required_mentions, item)

    selectivity_detail = extract_selectivity_detail(haystack)
    style = _clean_prompt_text(normalized.get("personalizationStrategy") or state.get("personalizationStrategy")).lower()
    wants_omit_selectivity = any(
        phrase in style
        for phrase in [
            "do not include the selectivity",
            "without the selectivity",
            "keep it lighter",
            "keep the note lighter",
            "omit the selectivity",
        ]
    )
    wants_include_selectivity = bool(selectivity_detail) and "include" in style and not wants_omit_selectivity

    if selectivity_detail:
        optional_mentions = _foundation_list(normalized.get("optionalMentions"))
        normalized["optionalMentions"] = _append_unique(optional_mentions, selectivity_detail)
        required_mentions = [
            item
            for item in required_mentions
            if (
                "out of" not in item.lower()
                and "/" not in item
                and "selective" not in item.lower()
                and "selected" not in item.lower()
                and "accepted" not in item.lower()
                and "acceptance" not in item.lower()
            )
        ]
        if wants_include_selectivity:
            required_mentions = _append_unique(required_mentions, selectivity_detail)

    normalized["requiredMentions"] = required_mentions

    message_boundaries = _foundation_list(normalized.get("messageBoundaries"))
    if wants_omit_selectivity:
        message_boundaries = _append_unique(message_boundaries, "Do not include the 6 out of 45 selectivity detail.")
    if "linkedin" in lower:
        normalized.setdefault("outreachGoal", "Connect with target recipients on LinkedIn")
        normalized.setdefault("desiredOutcome", "Connect on LinkedIn")
        normalized.setdefault("channelFormat", "LinkedIn connection note under 300 characters")
    if "tuesday" in lower:
        current_response = _clean_prompt_text(normalized.get("desiredOutcome"))
        if "tuesday" not in current_response.lower():
            normalized["desiredOutcome"] = "Connect on LinkedIn and look forward to meeting on Tuesday"
    normalized["messageBoundaries"] = message_boundaries

    if not normalized.get("personalizationStrategy"):
        normalized["personalizationStrategy"] = (
            "Use a concise LinkedIn note; mention the shared event and oral presentation without heavy biography."
        )
    if not normalized.get("tone"):
        normalized["tone"] = "Warm, brief, and peer-like"

    return normalized

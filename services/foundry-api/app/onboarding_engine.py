from __future__ import annotations

from copy import deepcopy

from .project_modes import (
    get_array_slots,
    get_required_slots,
    get_slot_keys,
    normalize_project_type,
    should_extract_slot_from_kickoff,
)

COMPLETENESS_LEVELS = {"missing", "weak", "solid"}


def empty_onboarding_state(project_type: str = "startup") -> dict:
    project_type = normalize_project_type(project_type)
    slot_keys = get_slot_keys(project_type)
    array_slots = get_array_slots(project_type)
    completeness = {key: "missing" for key in slot_keys}
    return {
        **{key: ([] if key in array_slots else None) for key in slot_keys},
        "completeness": completeness,
        "followUpCounts": {key: 0 for key in slot_keys},
    }


def normalize_onboarding_state(state: dict | None, project_type: str = "startup") -> dict:
    project_type = normalize_project_type(project_type)
    slot_keys = get_slot_keys(project_type)
    normalized = empty_onboarding_state(project_type)
    if not isinstance(state, dict):
        return normalized
    for key in slot_keys:
        if key in state:
            normalized[key] = state[key]
    raw_completeness = state.get("completeness") or {}
    raw_followups = state.get("followUpCounts") or {}
    for key in slot_keys:
        if raw_completeness.get(key) in COMPLETENESS_LEVELS:
            normalized["completeness"][key] = raw_completeness[key]
        if isinstance(raw_followups.get(key), int):
            normalized["followUpCounts"][key] = max(0, raw_followups[key])
    return normalized


def choose_next_slot(state: dict, project_type: str = "startup") -> str | None:
    slot_order = get_slot_keys(project_type)
    required_slots = set(get_required_slots(project_type))
    for key in slot_order:
        if (
            key in required_slots
            and state["completeness"][key] == "weak"
            and state["followUpCounts"].get(key, 0) < 1
        ):
            return key
    for key in slot_order:
        if key in required_slots and state["completeness"][key] == "missing":
            return key
    for key in slot_order:
        if key not in required_slots and state["completeness"][key] == "missing":
            return key
    return None


def is_onboarding_finishable(state: dict, project_type: str = "startup") -> bool:
    required_slots = get_required_slots(project_type)
    solid_count = len([key for key in required_slots if state["completeness"][key] == "solid"])
    none_missing = all(state["completeness"][key] != "missing" for key in required_slots)
    weak_slots_probed = all(
        state["completeness"][key] != "weak" or state["followUpCounts"].get(key, 0) >= 1
        for key in required_slots
    )
    return none_missing and (solid_count >= 3 or weak_slots_probed)


def merge_slot_patch(state: dict, slot_key: str, value, quality: str, project_type: str = "startup") -> dict:
    next_state = deepcopy(state)
    if next_state["completeness"].get(slot_key) == "weak":
        next_state["followUpCounts"][slot_key] = next_state["followUpCounts"].get(slot_key, 0) + 1
    next_state["completeness"][slot_key] = quality
    if slot_key in get_array_slots(project_type):
        next_state[slot_key] = value if isinstance(value, list) else [value]
    else:
        next_state[slot_key] = ", ".join(value) if isinstance(value, list) else value
    return next_state


def merge_kickoff_context(state: dict, extracted: dict, project_type: str = "startup") -> dict:
    next_state = deepcopy(state)
    array_slots = get_array_slots(project_type)
    for key in get_slot_keys(project_type):
        if not should_extract_slot_from_kickoff(project_type, key):
            continue
        patch = extracted.get(key) if isinstance(extracted, dict) else None
        if not isinstance(patch, dict):
            continue
        quality = patch.get("quality")
        if quality not in {"weak", "solid"}:
            continue
        value = patch.get("values") if key in array_slots else patch.get("value")
        if key in array_slots:
            if not isinstance(value, list) or not [item for item in value if isinstance(item, str) and item.strip()]:
                continue
        elif not isinstance(value, str) or not value.strip():
            continue
        next_state = merge_slot_patch(next_state, key, value, quality, project_type)
    return next_state


def validate_choices(choices: list[dict], target_slot: str) -> tuple[bool, str | None]:
    if len(choices) < 3 or len(choices) > 5:
        return False, f"Expected 3-5 choices, got {len(choices)}"
    labels: list[str] = []
    for choice in choices:
        if not choice.get("id") or not choice.get("label") or not choice.get("normalizedValue"):
            return False, "Choice missing required fields"
        if len(choice["label"]) > 120:
            return False, "Choice label too long"
        if choice.get("slotKey") != target_slot:
            return False, "Choice slotKey mismatch"
        labels.append(choice["label"].strip().lower())
    if len(set(labels)) != len(labels):
        return False, "Duplicate choice labels"
    return True, None

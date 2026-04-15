from __future__ import annotations

from copy import deepcopy

SLOT_KEYS = [
    "ideaSummary",
    "targetUser",
    "painPoint",
    "valueProp",
    "idealPeopleTypes",
    "differentiation",
    "disqualifiers",
]
REQUIRED_SLOTS = [
    "ideaSummary",
    "targetUser",
    "painPoint",
    "valueProp",
    "idealPeopleTypes",
]
SLOT_ORDER = SLOT_KEYS[:]
ARRAY_SLOTS = {"idealPeopleTypes", "disqualifiers"}

FALLBACKS = {
    "ideaSummary": {
        "question": "What are you building?",
        "choices": [
            {"id": "a", "label": "A SaaS tool for businesses", "normalizedValue": "A SaaS tool for businesses"},
            {"id": "b", "label": "A consumer app", "normalizedValue": "A consumer app"},
            {"id": "c", "label": "A marketplace connecting two groups", "normalizedValue": "A marketplace connecting two groups"},
            {"id": "d", "label": "A services business with AI/software support", "normalizedValue": "A services business with AI/software support"},
        ],
        "customPlaceholder": "Describe what you're building in a sentence or two...",
    },
    "targetUser": {
        "question": "Who is the primary person you're building this for?",
        "choices": [
            {"id": "a", "label": "Individual professionals / knowledge workers", "normalizedValue": "Individual professionals or knowledge workers"},
            {"id": "b", "label": "Small business owners", "normalizedValue": "Small business owners"},
            {"id": "c", "label": "Teams at mid-size companies", "normalizedValue": "Teams at mid-size companies"},
            {"id": "d", "label": "Enterprise teams", "normalizedValue": "Enterprise teams"},
            {"id": "e", "label": "Consumers / general public", "normalizedValue": "Consumers or general public"},
        ],
        "customPlaceholder": "Describe the primary person you're building this for...",
    },
    "painPoint": {
        "question": "What's the core problem this solves?",
        "choices": [
            {"id": "a", "label": "Too much manual work / repetitive tasks", "normalizedValue": "Too much manual or repetitive work"},
            {"id": "b", "label": "Hard to find the right information", "normalizedValue": "Difficulty finding the right information"},
            {"id": "c", "label": "Coordination or communication breakdown", "normalizedValue": "Coordination or communication breakdown"},
            {"id": "d", "label": "Existing tools are too complex or expensive", "normalizedValue": "Existing tools are too complex or expensive"},
        ],
        "customPlaceholder": "Describe the core problem in your own words...",
    },
    "valueProp": {
        "question": "What's the main value you deliver?",
        "choices": [
            {"id": "a", "label": "Save significant time", "normalizedValue": "Saves significant time"},
            {"id": "b", "label": "Reduce cost", "normalizedValue": "Reduces cost"},
            {"id": "c", "label": "Improve quality of outcomes", "normalizedValue": "Improves quality of outcomes"},
            {"id": "d", "label": "Remove painful friction", "normalizedValue": "Removes painful friction from a workflow"},
        ],
        "customPlaceholder": "Describe the specific value you deliver...",
    },
    "idealPeopleTypes": {
        "question": "Who would be ideal early users or customers?",
        "choices": [
            {"id": "a", "label": "Founders at early-stage startups", "normalizedValue": "Founders at early-stage startups"},
            {"id": "b", "label": "Operators at SMBs (10-200 employees)", "normalizedValue": "Operators at small to mid-size businesses"},
            {"id": "c", "label": "Domain experts / practitioners", "normalizedValue": "Domain experts or practitioners in the field"},
            {"id": "d", "label": "Power users of existing incumbent tools", "normalizedValue": "Power users frustrated with existing tools"},
        ],
        "customPlaceholder": "Describe your ideal early user...",
    },
    "differentiation": {
        "question": "What makes this different from existing solutions?",
        "choices": [
            {"id": "a", "label": "Much simpler / lower friction", "normalizedValue": "Much simpler and lower friction than alternatives"},
            {"id": "b", "label": "Focused on a specific niche others ignore", "normalizedValue": "Focused on a niche the incumbent tools ignore"},
            {"id": "c", "label": "AI-native workflow vs legacy tool", "normalizedValue": "AI-native approach vs legacy tools"},
            {"id": "d", "label": "Better price-to-value ratio", "normalizedValue": "Better price-to-value ratio"},
        ],
        "customPlaceholder": "Describe what makes your approach different...",
    },
    "disqualifiers": {
        "question": "Who would NOT be a good fit?",
        "choices": [
            {"id": "a", "label": "Enterprise companies with strict compliance", "normalizedValue": "Enterprise companies with strict compliance requirements"},
            {"id": "b", "label": "People who prefer fully manual processes", "normalizedValue": "People who prefer fully manual processes"},
            {"id": "c", "label": "Teams with no budget", "normalizedValue": "Teams with no budget or buying authority"},
            {"id": "d", "label": "Industries requiring deep domain customization", "normalizedValue": "Industries requiring heavy domain customization"},
        ],
        "customPlaceholder": "Describe who this is not a good fit for...",
    },
}


def empty_onboarding_state() -> dict:
    completeness = {key: "missing" for key in SLOT_KEYS}
    return {
        "ideaSummary": None,
        "targetUser": None,
        "painPoint": None,
        "valueProp": None,
        "idealPeopleTypes": [],
        "differentiation": None,
        "disqualifiers": [],
        "completeness": completeness,
    }


def choose_next_slot(state: dict) -> str | None:
    for key in SLOT_ORDER:
        if key in REQUIRED_SLOTS and state["completeness"][key] == "missing":
            return key
    for key in SLOT_ORDER:
        if key in REQUIRED_SLOTS and state["completeness"][key] == "weak":
            return key
    for key in SLOT_ORDER:
        if key not in REQUIRED_SLOTS and state["completeness"][key] == "missing":
            return key
    return None


def is_onboarding_finishable(state: dict) -> bool:
    solid_count = len([key for key in REQUIRED_SLOTS if state["completeness"][key] == "solid"])
    none_missing = all(state["completeness"][key] != "missing" for key in REQUIRED_SLOTS)
    return none_missing and solid_count >= 3


def merge_slot_patch(state: dict, slot_key: str, value, quality: str) -> dict:
    next_state = deepcopy(state)
    next_state["completeness"][slot_key] = quality
    if slot_key in ARRAY_SLOTS:
        next_state[slot_key] = value if isinstance(value, list) else [value]
    else:
        next_state[slot_key] = ", ".join(value) if isinstance(value, list) else value
    return next_state


def merge_kickoff_idea(state: dict, idea_summary: str, quality: str) -> dict:
    return merge_slot_patch(state, "ideaSummary", idea_summary, quality)


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


def get_fallback_choices(slot_key: str) -> dict:
    fallback = FALLBACKS[slot_key]
    return {
        "question": fallback["question"],
        "choices": [{**choice, "slotKey": slot_key} for choice in fallback["choices"]],
        "customPlaceholder": fallback["customPlaceholder"],
    }

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
COMPLETENESS_LEVELS = {"missing", "weak", "solid"}

FALLBACKS = {
    "ideaSummary": {
        "question": "What are you building?",
        "choices": [
            {"id": "a", "label": "A focused SaaS tool that helps a specific business team finish a painful workflow faster", "normalizedValue": "A focused SaaS tool for a specific business workflow"},
            {"id": "b", "label": "A consumer product that changes how an individual handles a repeated personal problem", "normalizedValue": "A consumer product for a repeated personal problem"},
            {"id": "c", "label": "A marketplace that connects two groups who struggle to find or trust each other today", "normalizedValue": "A marketplace connecting two groups with matching or trust friction"},
            {"id": "d", "label": "A service-led business where software or AI removes the hardest delivery bottleneck", "normalizedValue": "A service-led business with software or AI support"},
        ],
        "customPlaceholder": "Describe what you're building in a sentence or two...",
    },
    "targetUser": {
        "question": "Who is the primary person you're building this for?",
        "choices": [
            {"id": "a", "label": "Individual professionals who personally feel the workflow pain during their day-to-day work", "normalizedValue": "Individual professionals who personally feel the workflow pain"},
            {"id": "b", "label": "Small business owners who both feel the problem and decide whether a tool is worth trying", "normalizedValue": "Small business owners who feel the problem and decide on tools"},
            {"id": "c", "label": "A specific team inside a mid-size company that owns this workflow and its results", "normalizedValue": "A specific team at a mid-size company that owns the workflow"},
            {"id": "d", "label": "Enterprise teams where the user and buying decision may be split across roles", "normalizedValue": "Enterprise teams with separate users and buying decisions"},
            {"id": "e", "label": "Consumers who run into this problem repeatedly outside a work setting", "normalizedValue": "Consumers who repeatedly experience this problem"},
        ],
        "customPlaceholder": "Describe the primary person you're building this for...",
    },
    "painPoint": {
        "question": "What's the core problem this solves?",
        "choices": [
            {"id": "a", "label": "They lose time to manual or repetitive work that still needs human attention", "normalizedValue": "Manual or repetitive work consumes time and attention"},
            {"id": "b", "label": "They cannot find or trust the information needed to make the next decision", "normalizedValue": "Difficulty finding trustworthy information for decisions"},
            {"id": "c", "label": "The workflow breaks when people coordinate across handoffs, tools, or teams", "normalizedValue": "Coordination breaks across handoffs, tools, or teams"},
            {"id": "d", "label": "Current tools exist, but they are too complex, expensive, or awkward for this use case", "normalizedValue": "Existing tools are too complex, expensive, or awkward for the use case"},
        ],
        "customPlaceholder": "Describe the core problem in your own words...",
    },
    "valueProp": {
        "question": "What's the main value you deliver?",
        "choices": [
            {"id": "a", "label": "Give them meaningful time back on a workflow they repeat often", "normalizedValue": "Saves meaningful time on a repeated workflow"},
            {"id": "b", "label": "Reduce the cost of getting the same work done well", "normalizedValue": "Reduces the cost of completing the work well"},
            {"id": "c", "label": "Improve the quality, reliability, or confidence of the result", "normalizedValue": "Improves the quality and reliability of outcomes"},
            {"id": "d", "label": "Remove enough friction that people actually complete the workflow", "normalizedValue": "Removes friction that blocks workflow completion"},
        ],
        "customPlaceholder": "Describe the specific value you deliver...",
    },
    "idealPeopleTypes": {
        "question": "Who would be ideal early users or customers?",
        "choices": [
            {"id": "a", "label": "Target users who feel this problem often enough to describe their current workaround", "normalizedValue": "Target users who feel the problem and can describe their workaround"},
            {"id": "b", "label": "Experienced builders who have already navigated a similar product or startup challenge", "normalizedValue": "Experienced builders with similar product or startup experience"},
            {"id": "c", "label": "Industry experts or practitioners who understand the workflow and its failure modes deeply", "normalizedValue": "Industry experts or practitioners who understand the workflow deeply"},
            {"id": "d", "label": "Decision makers or power users who know why current tools get adopted or rejected", "normalizedValue": "Decision makers or power users who know why current tools win or fail"},
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

NETWORKING_FALLBACKS = {
    "ideaSummary": {
        "question": "What is this outreach project about?",
        "choices": [
            {"id": "a", "label": "A conference or workshop networking campaign tied to an upcoming in-person event", "normalizedValue": "A conference or workshop networking campaign tied to an upcoming in-person event"},
            {"id": "b", "label": "A warm intro campaign to meet advisors, collaborators, or potential partners", "normalizedValue": "A warm intro campaign to meet advisors, collaborators, or potential partners"},
            {"id": "c", "label": "A targeted LinkedIn outreach list for people with a shared professional context", "normalizedValue": "A targeted LinkedIn outreach list for people with a shared professional context"},
            {"id": "d", "label": "A recruiting or talent networking campaign for a specific role or community", "normalizedValue": "A recruiting or talent networking campaign for a specific role or community"},
        ],
        "customPlaceholder": "Describe the outreach project and goal...",
    },
    "targetUser": {
        "question": "Who are you trying to reach?",
        "choices": [
            {"id": "a", "label": "Invited speakers, organizers, or panelists connected to a specific event", "normalizedValue": "Invited speakers, organizers, or panelists connected to a specific event"},
            {"id": "b", "label": "Senior operators or domain experts whose work overlaps with the project context", "normalizedValue": "Senior operators or domain experts whose work overlaps with the project context"},
            {"id": "c", "label": "Potential collaborators who share the same research, product, or community interests", "normalizedValue": "Potential collaborators who share the same research, product, or community interests"},
            {"id": "d", "label": "People who can make useful introductions to the right community", "normalizedValue": "People who can make useful introductions to the right community"},
        ],
        "customPlaceholder": "Describe the recipients you want to contact...",
    },
    "painPoint": {
        "question": "What context should make the message feel timely and relevant?",
        "choices": [
            {"id": "a", "label": "We will be at the same event soon and have a natural reason to meet in person", "normalizedValue": "The sender and recipient will be at the same event soon and have a natural reason to meet in person"},
            {"id": "b", "label": "The recipient's work overlaps with a paper, talk, product, or project I am presenting", "normalizedValue": "The recipient's work overlaps with something the sender is presenting"},
            {"id": "c", "label": "There is a shared community, organization, school, investor, or mutual connection", "normalizedValue": "There is a shared community, organization, school, investor, or mutual connection"},
            {"id": "d", "label": "The recipient has specific experience that makes a short conversation useful", "normalizedValue": "The recipient has specific experience that makes a short conversation useful"},
        ],
        "customPlaceholder": "Describe the timely context or shared connection...",
    },
    "valueProp": {
        "question": "What should the outreach ask for?",
        "choices": [
            {"id": "a", "label": "A brief in-person hello during the event", "normalizedValue": "A brief in-person hello during the event"},
            {"id": "b", "label": "A short conversation to exchange ideas around the shared topic", "normalizedValue": "A short conversation to exchange ideas around the shared topic"},
            {"id": "c", "label": "Permission to follow up after the event with a more specific question", "normalizedValue": "Permission to follow up after the event with a more specific question"},
            {"id": "d", "label": "A lightweight introduction to someone else in their network", "normalizedValue": "A lightweight introduction to someone else in their network"},
        ],
        "customPlaceholder": "Describe the ask or desired next step...",
    },
    "idealPeopleTypes": {
        "question": "Which people should be prioritized first?",
        "choices": [
            {"id": "a", "label": "People with direct leadership or organizer roles in the event or community", "normalizedValue": "People with direct leadership or organizer roles in the event or community"},
            {"id": "b", "label": "Speakers whose work directly overlaps with the sender's topic", "normalizedValue": "Speakers whose work directly overlaps with the sender's topic"},
            {"id": "c", "label": "Researchers, builders, or operators who are likely to attend in person", "normalizedValue": "Researchers, builders, or operators who are likely to attend in person"},
            {"id": "d", "label": "Connectors who can introduce the sender to other relevant attendees", "normalizedValue": "Connectors who can introduce the sender to other relevant attendees"},
        ],
        "customPlaceholder": "Describe the people who matter most...",
    },
    "differentiation": {
        "question": "What credibility hook should every message know about?",
        "choices": [
            {"id": "a", "label": "I am presenting at the same event", "normalizedValue": "The sender is presenting at the same event"},
            {"id": "b", "label": "Our paper, project, or talk was selected through a competitive process", "normalizedValue": "The sender's work was selected through a competitive process"},
            {"id": "c", "label": "I have a specific overlap with the recipient's work", "normalizedValue": "The sender has a specific overlap with the recipient's work"},
            {"id": "d", "label": "A mutual connection or shared community makes the message warmer", "normalizedValue": "A mutual connection or shared community makes the message warmer"},
        ],
        "customPlaceholder": "Describe the credibility hook or personal angle...",
    },
    "disqualifiers": {
        "question": "Who should be excluded from this outreach?",
        "choices": [
            {"id": "a", "label": "People with no visible connection to the event, topic, or community", "normalizedValue": "People with no visible connection to the event, topic, or community"},
            {"id": "b", "label": "People whose profiles suggest they are unlikely to attend in person", "normalizedValue": "People whose profiles suggest they are unlikely to attend in person"},
            {"id": "c", "label": "People where the message would feel like a cold sales pitch", "normalizedValue": "People where the message would feel like a cold sales pitch"},
            {"id": "d", "label": "People who are too far outside the topic to justify a personalized note", "normalizedValue": "People who are too far outside the topic to justify a personalized note"},
        ],
        "customPlaceholder": "Describe who should not be included...",
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
        "followUpCounts": {key: 0 for key in SLOT_KEYS},
    }


def normalize_onboarding_state(state: dict | None) -> dict:
    normalized = empty_onboarding_state()
    if not isinstance(state, dict):
        return normalized
    for key in SLOT_KEYS:
        if key in state:
            normalized[key] = state[key]
    raw_completeness = state.get("completeness") or {}
    raw_followups = state.get("followUpCounts") or {}
    for key in SLOT_KEYS:
        if raw_completeness.get(key) in COMPLETENESS_LEVELS:
            normalized["completeness"][key] = raw_completeness[key]
        if isinstance(raw_followups.get(key), int):
            normalized["followUpCounts"][key] = max(0, raw_followups[key])
    return normalized


def choose_next_slot(state: dict) -> str | None:
    for key in SLOT_ORDER:
        if (
            key in REQUIRED_SLOTS
            and state["completeness"][key] == "weak"
            and state["followUpCounts"].get(key, 0) < 1
        ):
            return key
    for key in SLOT_ORDER:
        if key in REQUIRED_SLOTS and state["completeness"][key] == "missing":
            return key
    for key in SLOT_ORDER:
        if key not in REQUIRED_SLOTS and state["completeness"][key] == "missing":
            return key
    return None


def is_onboarding_finishable(state: dict) -> bool:
    solid_count = len([key for key in REQUIRED_SLOTS if state["completeness"][key] == "solid"])
    none_missing = all(state["completeness"][key] != "missing" for key in REQUIRED_SLOTS)
    weak_slots_probed = all(
        state["completeness"][key] != "weak" or state["followUpCounts"].get(key, 0) >= 1
        for key in REQUIRED_SLOTS
    )
    return none_missing and (solid_count >= 3 or weak_slots_probed)


def merge_slot_patch(state: dict, slot_key: str, value, quality: str) -> dict:
    next_state = deepcopy(state)
    if next_state["completeness"].get(slot_key) == "weak":
        next_state["followUpCounts"][slot_key] = next_state["followUpCounts"].get(slot_key, 0) + 1
    next_state["completeness"][slot_key] = quality
    if slot_key in ARRAY_SLOTS:
        next_state[slot_key] = value if isinstance(value, list) else [value]
    else:
        next_state[slot_key] = ", ".join(value) if isinstance(value, list) else value
    return next_state


def merge_kickoff_context(state: dict, extracted: dict) -> dict:
    next_state = deepcopy(state)
    for key in REQUIRED_SLOTS:
        patch = extracted.get(key) if isinstance(extracted, dict) else None
        if not isinstance(patch, dict):
            continue
        quality = patch.get("quality")
        if quality not in {"weak", "solid"}:
            continue
        value = patch.get("values") if key in ARRAY_SLOTS else patch.get("value")
        if key in ARRAY_SLOTS:
            if not isinstance(value, list) or not [item for item in value if isinstance(item, str) and item.strip()]:
                continue
        elif not isinstance(value, str) or not value.strip():
            continue
        next_state = merge_slot_patch(next_state, key, value, quality)
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


def get_fallback_choices(slot_key: str, project_type: str = "startup") -> dict:
    fallbacks = NETWORKING_FALLBACKS if project_type == "networking" else FALLBACKS
    fallback = fallbacks[slot_key]
    return {
        "question": fallback["question"],
        "choices": [{**choice, "slotKey": slot_key} for choice in fallback["choices"]],
        "customPlaceholder": fallback["customPlaceholder"],
    }

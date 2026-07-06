from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Callable

from .project_modes import OUTREACH_TYPE_IDEA_VALIDATION


OUTREACH_UPDATE_MARKER = '{"outreach_onboarding_update":'


@dataclass(frozen=True)
class OutreachOnboardingMode:
    type: str
    label: str
    kickoff_user_message: str
    required_fields: tuple[str, ...]
    array_fields: tuple[str, ...]
    build_system_prompt: Callable[[dict, dict], str]
    build_brief: Callable[[dict], dict]


def _clean_text(value) -> str:
    return " ".join(value.strip().split()) if isinstance(value, str) else ""


def _clean_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    seen: set[str] = set()
    cleaned: list[str] = []
    for item in value:
        text = _clean_text(item)
        key = text.lower()
        if text and key not in seen:
            cleaned.append(text)
            seen.add(key)
    return cleaned


def _foundation_summary(foundation: dict) -> str:
    fields = [
        ("Startup", foundation.get("startupName")),
        ("Summary", foundation.get("summary")),
        ("Target user", foundation.get("targetUser")),
        ("Pain point", foundation.get("painPoint")),
        ("Value proposition", foundation.get("valueProp")),
        ("Ideal people to talk to", ", ".join(_clean_list(foundation.get("idealPeopleTypes")))),
        ("Stage", foundation.get("startupStage")),
        ("Traction", ", ".join(_clean_list(foundation.get("traction")))),
        ("Differentiation", foundation.get("differentiation")),
    ]
    lines = [f"{label}: {value}" for label, value in fields if _clean_text(value)]
    return "\n".join(lines) or "No startup foundation is available yet."


def _state_summary(state: dict) -> str:
    labels = {
        "desiredOutcome": "Desired outcome",
        "targetPeople": "Target people",
        "assumptionsToTest": "Assumptions to test",
        "learningGoals": "Learning goals",
        "conversationBoundaries": "Conversation boundaries",
    }
    lines: list[str] = []
    for key, label in labels.items():
        value = state.get(key)
        if isinstance(value, list):
            cleaned = _clean_list(value)
            if cleaned:
                lines.append(f"{label}: {', '.join(cleaned)}")
        elif _clean_text(value):
            lines.append(f"{label}: {_clean_text(value)}")
    return "\n".join(lines) or "Nothing captured yet."


def empty_state(mode: OutreachOnboardingMode) -> dict:
    array_fields = set(mode.array_fields)
    keys = [*mode.required_fields, *[key for key in array_fields if key not in mode.required_fields]]
    return {
        **{key: ([] if key in array_fields else None) for key in keys},
        "completeness": {key: "missing" for key in keys},
    }


def normalize_state(mode: OutreachOnboardingMode, raw_state) -> dict:
    state = empty_state(mode)
    if not isinstance(raw_state, dict):
        return state
    for key in state["completeness"]:
        if key in mode.array_fields:
            state[key] = _clean_list(raw_state.get(key))
        else:
            state[key] = _clean_text(raw_state.get(key)) or None
        if state[key]:
            state["completeness"][key] = "solid"
    completeness = raw_state.get("completeness") or {}
    for key in state["completeness"]:
        if completeness.get(key) in {"missing", "weak", "solid"}:
            state["completeness"][key] = completeness[key]
    return state


def merge_update(mode: OutreachOnboardingMode, state: dict, update: dict | None) -> dict:
    if not isinstance(update, dict):
        return state
    next_state = {**state, "completeness": {**state.get("completeness", {})}}
    for key in next_state["completeness"]:
        if key not in update:
            continue
        if key in mode.array_fields:
            value = _clean_list(update.get(key))
            if not value:
                continue
            next_state[key] = value
        else:
            value = _clean_text(update.get(key))
            if not value:
                continue
            next_state[key] = value
        next_state["completeness"][key] = "solid"
    return next_state


def is_ready(mode: OutreachOnboardingMode, state: dict) -> bool:
    return all(state.get(key) for key in mode.required_fields)


def extract_outreach_update(content: str) -> tuple[dict | None, bool]:
    idx = content.rfind(OUTREACH_UPDATE_MARKER)
    if idx == -1:
        return None, False

    fragment = content[idx:]
    depth = 0
    end = -1
    for i, char in enumerate(fragment):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        return None, False

    try:
        parsed = json.loads(fragment[: end + 1])
    except json.JSONDecodeError:
        return None, False

    update = parsed.get("outreach_onboarding_update")
    return update if isinstance(update, dict) else None, parsed.get("brief_ready") is True


def _build_idea_validation_prompt(foundation: dict, state: dict) -> str:
    return "\n".join([
        "You are an experienced startup advisor running a focused Idea Validation office hours session.",
        "Your job is to help the founder set up a learning-oriented outreach project before they sell or pitch.",
        "",
        "Use the startup foundation to infer a strong default plan when the founder asks you to decide.",
        "Ask one focused question at a time unless you already have enough to produce the learning brief.",
        "Prioritize practical specificity: who to talk to, what to learn, what assumptions to test, and what not to say.",
        "",
        "Startup foundation:",
        _foundation_summary(foundation),
        "",
        "Idea Validation state captured so far:",
        _state_summary(state),
        "",
        "Fields to capture:",
        "1. desiredOutcome - the outcome this outreach should create.",
        "2. targetPeople - the roles, segments, buyers, users, or experts to contact first.",
        "3. assumptionsToTest - the riskiest assumptions these conversations should validate or falsify.",
        "4. learningGoals - what the founder should understand after the conversations.",
        "5. conversationBoundaries - what the outreach should avoid so it stays learning-oriented.",
        "",
        "Behavior:",
        "- If the founder says something like 'tell me what it should be', propose a specific plan based on the foundation.",
        "- Do not turn this into sales outreach, demos, or closing language.",
        "- Keep responses conversational, brief, and concrete.",
        "- Do not use markdown formatting, headings, bullets, or code fences.",
        "- When the plan is ready, say so naturally and briefly.",
        "",
        "At the end of every response, include this exact JSON object on its own line, not wrapped in fences:",
        '{"outreach_onboarding_update":{"desiredOutcome":"string","targetPeople":["string"],"assumptionsToTest":["string"],"learningGoals":["string"],"conversationBoundaries":["string"]},"brief_ready":false}',
        "",
        "Only include fields in outreach_onboarding_update when you have useful values for them.",
        "Set brief_ready to true only when desiredOutcome, targetPeople, and assumptionsToTest are specific enough to start outreach.",
    ])


def _build_idea_validation_brief(state: dict) -> dict:
    learning_goals = _clean_list(state.get("learningGoals")) or [
        _clean_text(state.get("desiredOutcome")) or "Clarify the most important startup unknowns",
    ]
    target_people = _clean_list(state.get("targetPeople")) or ["People who experience the problem directly"]
    assumptions = _clean_list(state.get("assumptionsToTest")) or [
        "The problem is painful enough to justify changing the current workflow",
    ]
    boundaries = _clean_list(state.get("conversationBoundaries")) or [
        "Keep outreach framed as learning, not selling.",
        "Do not ask for a demo, purchase, or sales conversation.",
    ]
    return {
        "type": OUTREACH_TYPE_IDEA_VALIDATION,
        "label": "Idea Validation",
        "desiredOutcome": _clean_text(state.get("desiredOutcome")) or None,
        "learningGoals": learning_goals,
        "targetPeople": target_people,
        "assumptionsToTest": assumptions,
        "conversationBoundaries": boundaries,
        "outreachGuidance": (
            "Ask for perspective on the problem, current workarounds, urgency, and decision context. "
            "Use the conversation to learn before pitching a solution."
        ),
        "starterAsk": (
            "I'm trying to understand how people handle this problem today. "
            "Would you be open to sharing your experience in a short conversation?"
        ),
    }


IDEA_VALIDATION_MODE = OutreachOnboardingMode(
    type=OUTREACH_TYPE_IDEA_VALIDATION,
    label="Idea Validation",
    kickoff_user_message="Help me set up an Idea Validation learning brief.",
    required_fields=("desiredOutcome", "targetPeople", "assumptionsToTest"),
    array_fields=("targetPeople", "assumptionsToTest", "learningGoals", "conversationBoundaries"),
    build_system_prompt=_build_idea_validation_prompt,
    build_brief=_build_idea_validation_brief,
)


OUTREACH_ONBOARDING_MODES = {
    IDEA_VALIDATION_MODE.type: IDEA_VALIDATION_MODE,
}


def get_outreach_onboarding_mode(outreach_type: str | None) -> OutreachOnboardingMode | None:
    return OUTREACH_ONBOARDING_MODES.get(outreach_type or "")

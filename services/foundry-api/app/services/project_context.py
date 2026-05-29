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
    if normalized_type == "networking":
        outreach_goal = foundation.get("outreachGoal")
        recipients = foundation.get("recipients")
        sender_context = foundation.get("senderContext")
        shared_context = foundation.get("sharedContext")
        desired_outcome = foundation.get("desiredOutcome")
        required_mentions = foundation.get("requiredMentions") or []
        optional_mentions = foundation.get("optionalMentions") or []
        personalization_strategy = foundation.get("personalizationStrategy")
        message_boundaries = foundation.get("messageBoundaries") or []
        channel_format = foundation.get("channelFormat")
        priority_types = foundation.get("priorityRecipientTypes") or foundation.get("idealPeopleTypes") or []
        low_fit_signals = foundation.get("lowFitSignals") or []

        context_lines = [
            outreach_goal,
            f"Recipients: {recipients}" if recipients else None,
            f"Sender context: {sender_context}" if sender_context else None,
            f"Shared context: {shared_context}" if shared_context else None,
            f"Required mentions: {', '.join(required_mentions)}" if isinstance(required_mentions, list) and required_mentions else None,
            f"Optional mentions: {', '.join(optional_mentions)}" if isinstance(optional_mentions, list) and optional_mentions else None,
            f"Desired outcome: {desired_outcome}" if desired_outcome else None,
            f"Personalization strategy: {personalization_strategy}" if personalization_strategy else None,
            f"Tone: {foundation.get('tone')}" if foundation.get("tone") else None,
            f"Channel format: {channel_format}" if channel_format else None,
            f"Message boundaries: {', '.join(message_boundaries)}" if isinstance(message_boundaries, list) and message_boundaries else None,
            f"Priority recipient types: {', '.join(priority_types)}" if isinstance(priority_types, list) and priority_types else None,
            f"Match rubric: {foundation.get('matchRubric')}" if foundation.get("matchRubric") else None,
            f"Low fit signals: {', '.join(low_fit_signals)}" if isinstance(low_fit_signals, list) and low_fit_signals else None,
        ]

        return {
            "project_type": normalized_type,
            "idea_summary": "\n".join([line for line in context_lines if line]),
            "target_customer": recipients,
            "pain_point": shared_context,
            "value_prop": desired_outcome,
            "sender_context": sender_context,
            "shared_context": shared_context,
            "required_mentions": required_mentions if isinstance(required_mentions, list) else [],
            "optional_mentions": optional_mentions if isinstance(optional_mentions, list) else [],
            "desired_outcome": desired_outcome,
            "personalization_strategy": personalization_strategy,
            "tone": foundation.get("tone"),
            "channel_format": channel_format,
            "message_boundaries": message_boundaries if isinstance(message_boundaries, list) else [],
            "ideal_people_types": priority_types if isinstance(priority_types, list) else [],
            "match_rubric": foundation.get("matchRubric"),
            "low_fit_signals": low_fit_signals if isinstance(low_fit_signals, list) else [],
            "key_assumptions": [
                value
                for value in [
                    shared_context,
                    desired_outcome,
                    sender_context,
                    personalization_strategy,
                    foundation.get("tone"),
                    channel_format,
                ]
                if value
            ],
        }

    ideal_people = foundation.get("idealPeopleTypes") or []
    labels = {
        "target": "Target user",
        "pain": "Pain point",
        "value": "Value proposition",
        "differentiation": "Differentiation",
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


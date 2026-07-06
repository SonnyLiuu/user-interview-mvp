"""AI layer: domain prompt builders (prompts) on top of provider clients (clients)."""

from .clients import stream_intake_reply
from .prompts import (
    extract_custom_slot_answer,
    extract_kickoff_idea,
    generate_call_brief,
    generate_foundation,
    generate_next_question,
    generate_outreach_message,
    get_advisor_web_context,
)

__all__ = [
    "extract_custom_slot_answer",
    "extract_kickoff_idea",
    "generate_call_brief",
    "generate_foundation",
    "generate_next_question",
    "generate_outreach_message",
    "get_advisor_web_context",
    "stream_intake_reply",
]

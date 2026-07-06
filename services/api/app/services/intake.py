from __future__ import annotations

import json
from typing import AsyncIterator

from fastapi.encoders import jsonable_encoder

from ..ai import get_advisor_web_context, stream_intake_reply
from ..core.db import get_pool
from ..core.errors import NotFoundError
from ..domain.project_modes import normalize_project_type
from ..repositories import foundations as foundation_repo
from ..repositories import intake as intake_repo
from ..repositories import projects as project_repo

INTAKE_SYSTEM_PROMPT = """You are an experienced startup advisor running a structured founder office hours session. Your goal is to build a complete picture of the founder's startup idea.

Cover these 5 areas progressively:
1. The Idea - what they're building, for whom, why now
2. The Problem - pain, frequency, current workarounds, why unsolved
3. The Customer - who feels it, who pays, user vs buyer
4. The Opportunity - who has budget, urgency, most promising niche
5. Risks and Assumptions - what must be true, biggest failure reasons

Ask 1-2 questions at a time. Probe vague answers. Don't rush through topics.

Important: Write in plain conversational text. Do NOT use markdown formatting (no **bold**, no *italic*, no ``` code fences, no bullet lists with - or * prefixes). Just natural paragraphs.

When you have enough information across all 5 areas, end your message with this exact JSON block on its own line — NOT wrapped in ``` fences:
{"intake_complete": true}

If the project already has a brief (you'll be told), act as an ongoing advisor - help the founder refine thinking, explore new angles, challenge weak assumptions. Do not re-run the intake flow."""


def get_system_prompt(has_brief: bool) -> str:
    if has_brief:
        return (
            INTAKE_SYSTEM_PROMPT
            + "\n\nThis project already has a current brief.\nStay in ongoing advisor mode.\n"
            + 'Do not output {"intake_complete": true}.\nDo not restart the structured intake flow.'
        )
    return (
        INTAKE_SYSTEM_PROMPT
        + '\n\nThis project does not have a brief yet.\nRun the structured intake flow and only output {"intake_complete": true} once you truly have enough information.'
    )


def get_foundation_advisor_prompt(foundation: dict, project_type: str = "startup") -> str:
    is_networking = normalize_project_type(project_type) == "networking"
    lines = [
        (
            "You are a strategic advisor and editor for this networking outreach foundation document."
            if is_networking
            else
            "You are a strategic advisor and editor for this founder's startup foundation document."
        ),
        (
            "Your role is to help them sharpen targeting, message context, and outreach asks - not to re-run intake."
            if is_networking
            else
            "Your role is to help them pressure-test, sharpen, and build on what they have - not to re-run intake."
        ),
        "",
        "Current foundation document:",
    ]
    if is_networking:
        labels = {
            "outreachGoal": "Outreach Goal",
            "recipients": "Recipients",
            "senderContext": "Sender Context",
            "sharedContext": "Shared Context",
            "desiredOutcome": "Desired Outcome",
            "requiredMentions": "Required Mentions",
            "optionalMentions": "Optional Mentions",
            "personalizationStrategy": "Personalization Strategy",
            "tone": "Tone",
            "channelFormat": "Channel Format",
            "messageBoundaries": "Message Boundaries",
            "nextSourcingStep": "Next Sourcing Step",
            "priorityRecipientTypes": "Priority Recipient Types",
            "matchRubric": "Match Rubric",
            "lowFitSignals": "Low Fit Signals",
        }
    else:
        labels = {
            "startupName": "Startup Name",
            "summary": "Summary",
            "targetUser": "Target User",
            "painPoint": "Core Problem",
            "valueProp": "Value Proposition",
            "idealPeopleTypes": "Ideal People to Talk To",
            "startupStage": "Startup Stage",
            "traction": "Traction",
            "differentiation": "Differentiation",
        }
    for key, label in labels.items():
        value = foundation.get(key)
        if isinstance(value, list) and value:
            lines.append(f"  {label}: {', '.join(str(item) for item in value)}")
        elif value:
            lines.append(f"  {label}: {value}")
    lines += [
        "",
        "How to behave:",
        "- Respond directly to what the founder says. Don't re-summarize the document back to them.",
        "- Ask probing questions to expose vague assumptions or weak spots in the document.",
        "- Suggest specific improvements when you spot them — be concrete, not generic.",
        "- Challenge sections that are too broad, too optimistic, or internally inconsistent.",
        "- When web context is provided, use it to answer current market, competitor, pricing, regulation, or trend questions. Cite source names and URLs from the context.",
        "- If a current factual answer would require web context and none was provided, say what you can infer and ask the founder to be more specific.",
        "- If the founder wants to update or add a section, help them get to a sharper version.",
        "- Keep responses focused. One thread at a time.",
        "",
        "Formatting:",
        "Write in plain conversational text — like you're talking to a founder in a coffee shop.",
        "Do NOT use markdown formatting: no **bold**, no *italic*, no ``` code fences, no bullet lists with - or * prefixes.",
        "Just write natural paragraphs. List items should be plain numbered sentences (1. 2. 3.) if needed.",
        "",
        "Editing the document:",
        "When you want to make a concrete change to the foundation document, end your response with this exact JSON block on its own line — NOT wrapped in ``` fences:",
        '{"foundation_patch": {"fieldName": "updated value"}}',
        (
            "Available fields for networking: outreachGoal, recipients, senderContext, sharedContext, desiredOutcome, requiredMentions (array of strings), optionalMentions (array of strings), personalizationStrategy, tone, channelFormat, messageBoundaries (array of strings), nextSourcingStep, priorityRecipientTypes (array of strings), matchRubric, lowFitSignals (array of strings)."
            if is_networking
            else
            "Available fields: startupName, summary, targetUser, painPoint, valueProp, idealPeopleTypes (array of strings), startupStage, traction (array of strings), differentiation."
        ),
        "Only include fields you are actually changing. Only emit the patch block when making a real edit, not for discussion.",
        'Do not output {"intake_complete": true}. Do not restart the intake flow.',
    ]
    return "\n".join(lines)


WEB_SEARCH_TRIGGERS = (
    "search",
    "look up",
    "google",
    "internet",
    "web",
    "latest",
    "current",
    "recent",
    "today",
    "market",
    "competitor",
    "competitors",
    "alternative",
    "alternatives",
    "pricing",
    "trend",
    "trends",
    "news",
    "regulation",
    "regulations",
    "examples",
    "companies",
    "products",
)


def should_fetch_web_context(message: str) -> bool:
    text = message.lower()
    return any(trigger in text for trigger in WEB_SEARCH_TRIGGERS)


async def get_intake_payload(user_id: str, project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        intake = await intake_repo.upsert_empty_intake(conn, project_id)
    return jsonable_encoder(dict(intake))


async def reset_conversation(user_id: str, project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        await intake_repo.save_conversation(conn, project_id, [])


async def stream_chat(
    user_id: str,
    project_id: str,
    message: str,
    recent_messages: list[dict] | None = None,
    conversation_messages: list[dict] | None = None,
) -> AsyncIterator[str]:
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        foundation_row = await foundation_repo.get_latest_foundation(conn, project_id)
        intake = await intake_repo.get_intake(conn, project_id)

    has_foundation = bool(foundation_row and foundation_row["foundation_json"])

    if has_foundation:
        raw = foundation_row["foundation_json"]
        foundation = json.loads(raw) if isinstance(raw, str) else raw
        system_prompt = get_foundation_advisor_prompt(foundation, dict(project).get("project_type"))
    else:
        system_prompt = get_system_prompt(False)

    if has_foundation:
        is_init = message == "__init__"
        history = recent_messages or []
        api_messages = [{"role": "user", "content": "Hello, let's continue working on my project."}] if is_init else [*history, {"role": "user", "content": message}]
        if not is_init and should_fetch_web_context(message):
            web_context = await get_advisor_web_context(message, foundation, history)
            if web_context:
                system_prompt += (
                    "\n\nWeb search context for this turn:\n"
                    f"{web_context}\n\n"
                    "Use this context only where it directly helps. Preserve source names and URLs when citing current facts."
                )
    else:
        raw_conversation = intake["conversation"] if intake and intake["conversation"] else []
        conversation = json.loads(raw_conversation) if isinstance(raw_conversation, str) else raw_conversation
        is_init = message == "__init__"
        updated_conversation = conversation if is_init else [*conversation, {"role": "user", "content": message}]
        api_messages = updated_conversation or [{"role": "user", "content": "Hello, I want to discuss my startup idea."}]

    full_response = ""

    async for chunk in stream_intake_reply(system_prompt, api_messages):
        full_response += chunk
        yield chunk

    if has_foundation:
        saved_history = conversation_messages or []
        final_conversation = [
            *saved_history,
            {"role": "user", "content": message},
            {"role": "assistant", "content": full_response},
        ]
    else:
        final_conversation = [*updated_conversation, {"role": "assistant", "content": full_response}]

    async with pool.acquire() as conn:
        await intake_repo.save_conversation(conn, project_id, final_conversation)

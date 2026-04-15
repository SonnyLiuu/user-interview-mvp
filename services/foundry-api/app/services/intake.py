from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from fastapi.encoders import jsonable_encoder

from ..ai import extract_intake_fields, stream_intake_reply
from ..db import get_pool
from ..errors import NotFoundError
from ..repositories import briefs as brief_repo
from ..repositories import foundations as foundation_repo
from ..repositories import intake as intake_repo
from ..repositories import projects as project_repo
from .briefs import generate_brief_for_project

INTAKE_SYSTEM_PROMPT = """You are an experienced startup advisor running a structured founder office hours session. Your goal is to build a complete picture of the founder's startup idea.

Cover these 5 areas progressively:
1. The Idea - what they're building, for whom, why now
2. The Problem - pain, frequency, current workarounds, why unsolved
3. The Customer - who feels it, who pays, user vs buyer
4. The Opportunity - who has budget, urgency, most promising niche
5. Risks and Assumptions - what must be true, biggest failure reasons

Ask 1-2 questions at a time. Probe vague answers. Don't rush through topics.

When you have enough information across all 5 areas, end your message with this exact JSON block on its own line:
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


def get_foundation_advisor_prompt(foundation: dict) -> str:
    lines = [
        "You are a strategic advisor and editor for this founder's project foundation document.",
        "Your role is to help them pressure-test, sharpen, and build on what they have — not to re-run intake.",
        "",
        "Current foundation document:",
    ]
    if foundation.get("summary"):
        lines.append(f"  Summary: {foundation['summary']}")
    if foundation.get("targetUser"):
        lines.append(f"  Target User: {foundation['targetUser']}")
    if foundation.get("painPoint"):
        lines.append(f"  Core Problem: {foundation['painPoint']}")
    if foundation.get("valueProp"):
        lines.append(f"  Value Proposition: {foundation['valueProp']}")
    if foundation.get("idealPeopleTypes"):
        lines.append(f"  Ideal People to Talk To: {', '.join(foundation['idealPeopleTypes'])}")
    if foundation.get("differentiation"):
        lines.append(f"  Differentiation: {foundation['differentiation']}")
    if foundation.get("disqualifiers"):
        lines.append(f"  Disqualifiers: {', '.join(foundation['disqualifiers'])}")
    lines += [
        "",
        "How to behave:",
        "- Respond directly to what the founder says. Don't re-summarize the document back to them.",
        "- Ask probing questions to expose vague assumptions or weak spots in the document.",
        "- Suggest specific improvements when you spot them — be concrete, not generic.",
        "- Challenge sections that are too broad, too optimistic, or internally inconsistent.",
        "- If the founder wants to update or add a section, help them get to a sharper version.",
        "- Keep responses focused. One thread at a time.",
        "",
        "Editing the document:",
        "When you want to make a concrete change to the foundation document, end your response with this exact JSON block on its own line:",
        '{"foundation_patch": {"fieldName": "updated value"}}',
        "Available fields: summary, targetUser, painPoint, valueProp, idealPeopleTypes (array of strings), differentiation, disqualifiers (array of strings).",
        "Only include fields you are actually changing. Only emit the patch block when making a real edit, not for discussion.",
        'Do not output {"intake_complete": true}. Do not restart the intake flow.',
    ]
    return "\n".join(lines)


async def get_intake_payload(user_id: str, project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        intake = await intake_repo.upsert_empty_intake(conn, project_id)
    return jsonable_encoder(dict(intake))


async def stream_chat(user_id: str, project_id: str, message: str, recent_messages: list[dict] | None = None) -> AsyncIterator[str]:
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        foundation_row = await foundation_repo.get_latest_foundation(conn, project_id)
        brief = await brief_repo.get_current_brief(conn, project_id)
        intake = await intake_repo.get_intake(conn, project_id)

    has_foundation = bool(foundation_row and foundation_row["foundation_json"])
    has_brief = brief is not None

    if has_foundation:
        raw = foundation_row["foundation_json"]
        foundation = json.loads(raw) if isinstance(raw, str) else raw
        system_prompt = get_foundation_advisor_prompt(foundation)
    else:
        system_prompt = get_system_prompt(has_brief)

    if has_foundation:
        is_init = message == "__init__"
        history = recent_messages or []
        api_messages = [] if is_init else [*history, {"role": "user", "content": message}]
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

    if not has_foundation:
        final_conversation = [*updated_conversation, {"role": "assistant", "content": full_response}]
        async with pool.acquire() as conn:
            await intake_repo.save_conversation(conn, project_id, final_conversation)

    if not has_foundation and not has_brief and '"intake_complete": true' in full_response:
        try:
            fields = await extract_intake_fields(final_conversation)
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await intake_repo.update_intake_fields(conn, project_id, fields)
                    await project_repo.update_project(conn, project_id, intake_status="generating")
            asyncio.create_task(generate_brief_for_project(project_id))
        except Exception:
            pass

from __future__ import annotations

import json
from typing import AsyncIterator

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from .config import get_settings


async def _generate_json(messages: list[dict], model: str, schema_hint: str) -> dict:
    settings = get_settings()
    provider = settings.ai_provider if settings.ai_provider in {"openai", "anthropic"} else "openai"
    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": f"{messages[0]['content']}\n\nReturn strict JSON only. Schema hint:\n{schema_hint}"}],
        )
        text_blocks = [block.text for block in response.content if getattr(block, "type", "") == "text"]
        return json.loads("".join(text_blocks) or "{}")

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": f"You are a JSON API. Respond with valid JSON only. Use this exact schema:\n{schema_hint}"},
            *[{"role": msg["role"], "content": msg["content"]} for msg in messages],
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    return json.loads(content)


async def extract_kickoff_idea(user_message: str) -> dict:
    prompt = (
        "A founder has just described their startup idea. Extract a concise summary and assess quality.\n\n"
        f'Founder message:\n"""\n{user_message}\n"""\n\n'
        "Rules:\n"
        "- ideaSummary must be 1-3 sentences, written as a neutral description (not first-person)\n"
        '- quality is "solid" if the message clearly conveys: what is being built AND who it is for\n'
        '- quality is "weak" if either of those is vague or missing'
    )
    raw = await _generate_json(
        [{"role": "user", "content": prompt}],
        "gpt-4o",
        '{"ideaSummary": "string", "quality": "weak|solid"}',
    )
    return {
        "ideaSummary": raw.get("ideaSummary") or "",
        "quality": raw.get("quality") or "weak",
    }


async def generate_next_question(target_slot: str, recent_messages: list[dict], state: dict) -> dict:
    slot_context = {
        "ideaSummary": "what the founder is building and for whom",
        "targetUser": "who the primary user is - the person who experiences the problem",
        "painPoint": "the core pain or problem the product addresses",
        "valueProp": "what specific value the product delivers to users",
        "idealPeopleTypes": "the types of people who would be ideal early users or customers",
        "differentiation": "what makes this different from existing solutions",
        "disqualifiers": "who would NOT be a good fit for this product",
    }
    state_lines: list[str] = []
    if state.get("ideaSummary"):
        state_lines.append(f"Idea: {state['ideaSummary']}")
    if state.get("targetUser"):
        state_lines.append(f"Target user: {state['targetUser']}")
    if state.get("painPoint"):
        state_lines.append(f"Pain point: {state['painPoint']}")
    if state.get("valueProp"):
        state_lines.append(f"Value prop: {state['valueProp']}")
    if state.get("idealPeopleTypes"):
        state_lines.append(f"Ideal people: {', '.join(state['idealPeopleTypes'])}")
    if state.get("differentiation"):
        state_lines.append(f"Differentiation: {state['differentiation']}")
    if state.get("disqualifiers"):
        state_lines.append(f"Disqualifiers: {', '.join(state['disqualifiers'])}")
    snippet = "\n".join([f"{'AI' if msg['role'] == 'assistant' else 'Founder'}: {msg['content']}" for msg in recent_messages[-6:]]) or "(none yet)"
    prompt = (
        "You are a senior startup advisor having a direct, low-key conversation with a founder. "
        "Your job is to ask one focused question to understand their startup better, then present concrete options.\n\n"
        f"You need to learn: {slot_context[target_slot]}\n\n"
        "What you know so far:\n"
        f"{chr(10).join(state_lines) or '(nothing yet)'}\n\n"
        f"Recent conversation:\n{snippet}\n\n"
        "Write the question as you would actually say it to a founder — direct, brief, no fluff. "
        "1-2 sentences max. No bullet points, no numbered lists, no markdown. "
        "Reference what you already know about their idea so it feels like a real conversation, not a form.\n\n"
        "Then generate 3-5 concrete answer choices tailored to this specific founder's context.\n\n"
        "Requirements:\n"
        f'- question: 1-2 natural sentences, conversational tone, no formatting\n'
        f'- Generate exactly 3-5 distinct, concrete choices relevant to this specific founder\'s context\n'
        f'- Each choice should target the "{target_slot}" slot\n'
        '- Do NOT include a "Something else" option - the UI adds that automatically\n'
        '- Labels must be concise (under 60 characters)\n'
        '- Assign a short unique id to each choice (e.g. "a", "b", "c")\n'
        '- normalizedValue should be a clean sentence suitable for storage\n'
        '- customPlaceholder should be a short prompt for the free-text field'
    )
    raw = await _generate_json(
        [{"role": "user", "content": prompt}],
        "gpt-4o",
        '{"question":"string","choices":[{"id":"string","label":"string","normalizedValue":"string"}],"customPlaceholder":"string"}',
    )
    return {
        "targetSlot": target_slot,
        "question": raw["question"],
        "choices": [{**choice, "slotKey": target_slot} for choice in raw["choices"]],
        "customPlaceholder": raw["customPlaceholder"],
    }


async def extract_custom_slot_answer(target_slot: str, custom_text: str, recent_messages: list[dict]) -> dict:
    is_array_slot = target_slot in {"idealPeopleTypes", "disqualifiers"}
    snippet = "\n".join([f"{'AI' if msg['role'] == 'assistant' else 'Founder'}: {msg['content']}" for msg in recent_messages[-4:]]) or "(none)"
    prompt = (
        "A founder typed a custom answer during onboarding. Extract a clean value for the target slot.\n\n"
        f"Target slot: {target_slot}\n"
        f"{'This slot stores an array - extract one or more distinct items.' if is_array_slot else 'This slot stores a single string.'}\n\n"
        f"Recent conversation:\n{snippet}\n\n"
        f'Founder\'s custom answer:\n"""\n{custom_text}\n"""\n\n'
        "Rules:\n"
        f'- Extract only what\'s relevant to the "{target_slot}" slot\n'
        '- quality is "solid" if specific and clearly addresses the slot; "weak" if vague\n'
        f"- {'Return values as an array of strings' if is_array_slot else 'Return value as a single string'}"
    )
    if is_array_slot:
        raw = await _generate_json(
            [{"role": "user", "content": prompt}],
            "gpt-4o",
            '{"values":["string"],"quality":"weak|solid"}',
        )
        return {"slotKey": target_slot, "value": raw.get("values") or [], "quality": raw.get("quality") or "weak"}
    raw = await _generate_json(
        [{"role": "user", "content": prompt}],
        "gpt-4o",
        '{"value":"string","quality":"weak|solid"}',
    )
    return {"slotKey": target_slot, "value": raw.get("value") or "", "quality": raw.get("quality") or "weak"}


async def generate_foundation(messages: list[dict], state: dict) -> dict:
    transcript = "\n\n".join([f"{'AI' if msg['role'] == 'assistant' else 'Founder'}: {msg['content']}" for msg in messages])
    state_snapshot = json.dumps(
        {
            "ideaSummary": state.get("ideaSummary"),
            "targetUser": state.get("targetUser"),
            "painPoint": state.get("painPoint"),
            "valueProp": state.get("valueProp"),
            "idealPeopleTypes": state.get("idealPeopleTypes"),
            "differentiation": state.get("differentiation"),
            "disqualifiers": state.get("disqualifiers"),
        },
        indent=2,
    )
    prompt = (
        "Generate a Project Foundation document for a startup based on the onboarding conversation and collected state.\n\n"
        f"Collected state:\n{state_snapshot}\n\n"
        f"Full onboarding transcript:\n{transcript}\n\n"
        "Rules:\n"
        "- Use the collected state as the primary source; use the transcript to fill gaps or improve clarity\n"
        "- summary should read as a neutral, polished description - not first-person\n"
        "- Keep all fields concise and specific\n"
        "- If differentiation or disqualifiers were not discussed, omit or set to null/empty"
    )
    raw = await _generate_json(
        [{"role": "user", "content": prompt}],
        "gpt-4o",
        '{"foundation":{"summary":"string","targetUser":"string","painPoint":"string","valueProp":"string","idealPeopleTypes":["string"],"differentiation":"string","disqualifiers":["string"]}}',
    )
    # Normalize: AI sometimes returns foundation fields at top level without the wrapper key
    if "foundation" not in raw:
        return {"foundation": raw}
    return raw


async def generate_brief(intake: dict) -> dict:
    prompt = (
        "You are an experienced startup advisor. Based on this founder's intake information, generate a structured project brief.\n\n"
        f"What they're building: {intake.get('what_are_you_building') or 'Not specified'}\n"
        f"For whom: {intake.get('for_whom') or 'Not specified'}\n"
        f"Why now: {intake.get('why_now') or 'Not specified'}\n"
        f"Pain: {intake.get('pain_description') or 'Not specified'}\n"
        f"Current solutions: {intake.get('current_solutions') or 'Not specified'}\n"
        f"Who feels the pain: {intake.get('who_feels_pain') or 'Not specified'}\n"
        f"Who pays: {intake.get('who_pays') or 'Not specified'}\n"
        f"Who has budget: {intake.get('who_has_budget') or 'Not specified'}\n"
        f"Most promising angle: {intake.get('most_promising_angle') or 'Not specified'}\n"
        f"Key assumptions: {', '.join(intake.get('key_assumptions') or []) or 'Not specified'}\n"
        f"Biggest failure reasons: {', '.join(intake.get('biggest_failure_reasons') or []) or 'Not specified'}\n"
        f"Personal connection: {intake.get('personal_connection') or 'Not specified'}\n\n"
        "Generate a sharp, honest brief. Strengths should highlight genuine signals. Weaknesses should name real risks. "
        "Assumptions must be the 3-5 things that must be true for this to work as a business. Recommended conversations should be specific persona types."
    )
    return await _generate_json(
        [{"role": "user", "content": prompt}],
        "gpt-4o",
        '{"idea_summary":"string","strengths":["string"],"weaknesses":["string"],"most_promising_avenues":["string"],"assumptions":[{"assumption":"string","status":"unvalidated","evidence":["string"]}],"recommended_conversations":[{"persona_type":"string","why":"string","what_to_learn":"string","urgency":"high|medium|low"}]}',
    )


async def extract_intake_fields(conversation: list[dict]) -> dict:
    transcript = "\n\n".join([f"{'Founder' if msg['role'] == 'user' else 'Advisor'}: {msg['content']}" for msg in conversation])
    prompt = (
        "Extract structured intake information from this founder office hours conversation.\n\n"
        f"CONVERSATION:\n{transcript}\n\n"
        "Extract all fields you can infer from the conversation. Leave fields null if not discussed."
    )
    schema_hint = json.dumps(
        {
            "what_are_you_building": "string|null",
            "for_whom": "string|null",
            "why_now": "string|null",
            "pain_description": "string|null",
            "pain_frequency": "string|null",
            "current_solutions": "string|null",
            "why_not_solved": "string|null",
            "consequence_if_unsolved": "string|null",
            "who_feels_pain": "string|null",
            "who_pays": "string|null",
            "user_buyer_same_person": "boolean|null",
            "who_influences": "string|null",
            "who_benefits_most": "string|null",
            "who_has_budget": "string|null",
            "urgency_level": "string|null",
            "most_promising_angle": "string|null",
            "narrow_wedge": "string|null",
            "key_assumptions": ["string"],
            "biggest_failure_reasons": ["string"],
            "personal_connection": "string|null",
        }
    )
    return await _generate_json([{"role": "user", "content": prompt}], "gpt-4o", schema_hint)


async def stream_intake_reply(system_prompt: str, messages: list[dict]) -> AsyncIterator[str]:
    settings = get_settings()
    if settings.ai_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )
        for block in response.content:
            if getattr(block, "type", "") == "text":
                yield block.text
        return

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    stream = await client.chat.completions.create(
        model="gpt-4o",
        stream=True,
        messages=[{"role": "system", "content": system_prompt}, *messages],
    )
    async for chunk in stream:
        text = chunk.choices[0].delta.content or ""
        if text:
            yield text

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from .config import get_settings
from .errors import AIServiceError


def _read_provider() -> str:
    settings = get_settings()
    provider = settings.ai_provider.strip().lower()
    return provider if provider in {"openai", "anthropic", "gemini"} else "openai"


def _parse_json_response(raw: str, provider: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```").strip()
        text = text.removesuffix("```").strip()

    try:
        parsed = json.loads(text or "{}")
    except json.JSONDecodeError as exc:
        raise AIServiceError("AI response was not valid JSON", provider) from exc

    if not isinstance(parsed, dict):
        raise AIServiceError("AI response JSON was not an object", provider)

    return parsed


def _is_json_response_error(exc: AIServiceError) -> bool:
    message = str(exc)
    return "valid JSON" in message or "JSON was not an object" in message


def _with_json_retry_instruction(messages: list[dict], schema_hint: str) -> list[dict]:
    if not messages:
        return messages
    retry_messages = [*messages]
    last = retry_messages[-1]
    retry_messages[-1] = {
        **last,
        "content": (
            f"{last['content']}\n\n"
            "Your previous response could not be parsed as the required JSON object. "
            "Return exactly one valid JSON object, with no markdown fences, prose, comments, or trailing text. "
            f"Schema hint:\n{schema_hint}"
        ),
    }
    return retry_messages


async def _await_provider(coro, provider: str, timeout: float, operation: str):
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except TimeoutError as exc:
        raise AIServiceError(f"{operation} timed out", provider) from exc
    except AIServiceError:
        raise
    except Exception as exc:
        raise AIServiceError(f"{operation} failed: {exc}", provider) from exc


async def _generate_json_once(messages: list[dict], schema_hint: str) -> dict:
    settings = get_settings()
    provider = _read_provider()
    timeout = settings.ai_request_timeout_seconds

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise AIServiceError("ANTHROPIC_API_KEY is not configured", provider)
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await _await_provider(
            client.messages.create(
                model=settings.anthropic_model,
                max_tokens=4096,
                messages=[{"role": "user", "content": f"{messages[0]['content']}\n\nReturn strict JSON only. Schema hint:\n{schema_hint}"}],
            ),
            provider,
            timeout,
            "Anthropic request",
        )
        text_blocks = [block.text for block in response.content if getattr(block, "type", "") == "text"]
        return _parse_json_response("".join(text_blocks), provider)

    if provider == "gemini":
        if not settings.gemini_api_key:
            raise AIServiceError("GEMINI_API_KEY is not configured", provider)
        try:
            import google.generativeai as genai
        except ImportError as exc:
            raise AIServiceError(
                "google-generativeai is not installed. Run `pip install -r requirements.txt` "
                "or set AI_PROVIDER to openai/anthropic.",
                provider,
            ) from exc
        genai.configure(api_key=settings.gemini_api_key)
        gemini_model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            generation_config={"response_mime_type": "application/json"},
        )
        prompt = f"{messages[0]['content']}\n\nReturn strict JSON only. Schema hint:\n{schema_hint}"
        response = await _await_provider(
            gemini_model.generate_content_async(
                prompt,
                request_options={"timeout": timeout},
            ),
            provider,
            timeout + 5,
            "Gemini request",
        )
        return _parse_json_response(response.text or "{}", provider)

    if not settings.openai_api_key:
        raise AIServiceError("OPENAI_API_KEY is not configured", provider)
    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=timeout)
    response = await _await_provider(
        client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": f"You are a JSON API. Respond with valid JSON only. Use this exact schema:\n{schema_hint}"},
                *[{"role": msg["role"], "content": msg["content"]} for msg in messages],
            ],
            response_format={"type": "json_object"},
        ),
        provider,
        timeout + 5,
        "OpenAI request",
    )
    content = response.choices[0].message.content or "{}"
    return _parse_json_response(content, provider)


async def _generate_json(messages: list[dict], schema_hint: str) -> dict:
    try:
        return await _generate_json_once(messages, schema_hint)
    except AIServiceError as exc:
        if not _is_json_response_error(exc):
            raise
        return await _generate_json_once(_with_json_retry_instruction(messages, schema_hint), schema_hint)


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
            '{"values":["string"],"quality":"weak|solid"}',
        )
        return {"slotKey": target_slot, "value": raw.get("values") or [], "quality": raw.get("quality") or "weak"}
    raw = await _generate_json(
        [{"role": "user", "content": prompt}],
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
        '{"foundation":{"summary":"string","targetUser":"string","painPoint":"string","valueProp":"string","idealPeopleTypes":["string"],"differentiation":"string","disqualifiers":["string"]}}',
    )
    # Normalize: AI sometimes returns foundation fields at top level without the wrapper key
    if "foundation" not in raw:
        return {"foundation": raw}
    return raw


async def generate_call_brief(person: dict, project_context: dict) -> dict:
    analysis = person.get("analysis") or {}
    key_insights = analysis.get("key_insights") or []
    ideal_people = project_context.get("ideal_people_types") or []
    disqualifiers = project_context.get("disqualifiers") or []
    key_assumptions = project_context.get("key_assumptions") or []

    prompt = (
        "You are helping a first-time founder prepare for a customer discovery call. "
        "This is not sales enablement. The goal is founder learning: sharper hypotheses, "
        "better market judgment, and clearer next steps.\n\n"
        "FOUNDATION CONTEXT:\n"
        f"{project_context.get('idea_summary') or 'Not specified'}\n\n"
        f"Target customer: {project_context.get('target_customer') or 'Not specified'}\n"
        f"Pain point: {project_context.get('pain_point') or 'Not specified'}\n"
        f"Value proposition: {project_context.get('value_prop') or 'Not specified'}\n"
        f"Ideal people to talk to: {', '.join(ideal_people) if ideal_people else 'Not specified'}\n"
        f"People to avoid: {', '.join(disqualifiers) if disqualifiers else 'Not specified'}\n"
        f"Assumptions to validate: {'; '.join(key_assumptions) if key_assumptions else 'Not specified'}\n\n"
        "PERSON THEY ARE CALLING:\n"
        f"Name: {person.get('name') or 'Unknown'}\n"
        f"Title: {person.get('title') or 'Unknown'}\n"
        f"Company: {person.get('company') or 'Unknown'}\n"
        f"Persona type: {person.get('persona_type') or 'Unknown'}\n"
        f"Background: {analysis.get('summary') or 'Not specified'}\n"
        f"Why they matter: {analysis.get('why_they_matter') or 'Not specified'}\n"
        f"Key insights: {'; '.join(key_insights) if key_insights else 'Not specified'}\n\n"
        "Generate a focused call prep brief. Be specific to this person and this foundation.\n\n"
        "Output rules:\n"
        "- objective: exactly one sharp sentence naming what the founder should learn.\n"
        "- goals: 3-5 founder-learning outcomes. Phrase each as what to validate, falsify, or learn. "
        "Avoid vague sales tasks like 'ask about budget'.\n"
        "- questions: 5-7 conversational discovery questions the founder could actually ask. "
        "Make them specific to this person's background and the founder's assumptions. Keep them brief and direct.\n"
        "- signals: 3-5 fit or weak-fit signals to use later during transcript/notes analysis. "
        "These are not checklist questions.\n"
        "- closing: one concise referral or follow-up ask.\n"
        "- Do not include numbering, markdown, labels, or filler."
    )
    return await _generate_json(
        [{"role": "user", "content": prompt}],
        '{"objective":"string","goals":["string"],"questions":["string"],"signals":["string"],"closing":"string"}',
    )


async def generate_outreach_message(person: dict, project_context: dict) -> dict:
    analysis = person.get("analysis") or {}
    key_insights = analysis.get("key_insights") or []
    ideal_people = project_context.get("ideal_people_types") or []
    disqualifiers = project_context.get("disqualifiers") or []
    key_assumptions = project_context.get("key_assumptions") or []

    prompt = (
        f"""I want you to generate a short outreach message. I will provide my project/startup idea and detailed background, and the background of the person I want to setup a call with. The recipient's background will provide context on what I wish to learn from conversation with that person. Choose one topic that I would want to learn about and introduce their familiarity with that topic, followed by my wish to learn about how they handled it in a 20 minute call. The topic should center on a real past experience the recipient likely had, especially one that could validate or falsify my project assumptions. Make this a natural 4-6 sentence paragraph. Avoid adding any information about my project/startup, my goal is not to pitch, rather to validate all aspects of my project/startup idea one person at a time.

        MY PROJECT CONTEXT:\n
        Idea: {project_context.get('idea_summary') or 'Not specified'}\n
        Target customer: {project_context.get('target_customer') or 'Not specified'}\n
        Pain point: {project_context.get('pain_point') or 'Not specified'}\n
        Ideal people to talk to: {', '.join(ideal_people) if ideal_people else 'Not specified'}\n
        Assumptions to validate: {'; '.join(key_assumptions) if key_assumptions else 'Not specified'}\n\n

        RECIPIENT CONTEXT:\n
        Name: {person.get('name') or 'Unknown'}\n
        Title: {person.get('title') or 'Unknown'}\n
        Company: {person.get('company') or 'Unknown'}\n
        Persona type: {person.get('persona_type') or 'Unknown'}\n
        Background: {analysis.get('summary') or 'Not specified'}\n
        Why they matter: {analysis.get('why_they_matter') or 'Not specified'}\n
        Key insights: {'; '.join(key_insights) if key_insights else 'Not specified'}\n\n

        Return only valid JSON with this schema:
        {{"subject":"string","body":"string"}}
        """
    )
    return await _generate_json(
        [{"role": "user", "content": prompt}],
        '{"subject":"string","body":"string"}',
    )


def _foundation_search_summary(foundation: dict) -> str:
    parts = [
        f"Summary: {foundation.get('summary')}" if foundation.get("summary") else None,
        f"Target user: {foundation.get('targetUser')}" if foundation.get("targetUser") else None,
        f"Pain point: {foundation.get('painPoint')}" if foundation.get("painPoint") else None,
        f"Value prop: {foundation.get('valueProp')}" if foundation.get("valueProp") else None,
        (
            f"Ideal people: {', '.join(foundation.get('idealPeopleTypes') or [])}"
            if foundation.get("idealPeopleTypes")
            else None
        ),
        f"Differentiation: {foundation.get('differentiation')}" if foundation.get("differentiation") else None,
    ]
    return "\n".join(part for part in parts if part)


async def get_advisor_web_context(user_message: str, foundation: dict, recent_messages: list[dict] | None = None) -> str:
    settings = get_settings()
    provider = _read_provider()
    if provider != "openai" or not settings.openai_api_key:
        return ""

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=settings.ai_request_timeout_seconds)
    recent = "\n".join(
        f"{'Advisor' if msg.get('role') == 'assistant' else 'Founder'}: {msg.get('content', '')}"
        for msg in (recent_messages or [])[-4:]
    )
    prompt = (
        "Search the web for current, factual context that would help a startup advisor answer the founder. "
        "Focus on market examples, competitors, current trends, pricing, regulations, recent company/product changes, "
        "or customer behavior relevant to the request. If the web is not needed, say so briefly.\n\n"
        "Project foundation:\n"
        f"{_foundation_search_summary(foundation) or 'Not specified'}\n\n"
        f"Recent conversation:\n{recent or '(none)'}\n\n"
        f"Founder request:\n{user_message}\n\n"
        "Return a concise research note with 3-6 bullets. Include source names and URLs inline for any factual claims."
    )

    try:
        response = await _await_provider(
            client.responses.create(
                model=settings.openai_web_search_model or settings.openai_model,
                tools=[{"type": "web_search_preview"}],
                tool_choice="auto",
                input=prompt,
            ),
            provider,
            settings.ai_request_timeout_seconds + 15,
            "OpenAI web search request",
        )
    except AIServiceError:
        return ""

    return (getattr(response, "output_text", "") or "").strip()


async def stream_intake_reply(system_prompt: str, messages: list[dict]) -> AsyncIterator[str]:
    settings = get_settings()
    provider = _read_provider()
    timeout = settings.ai_request_timeout_seconds

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise AIServiceError("ANTHROPIC_API_KEY is not configured", provider)
        client = AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=timeout)
        async with client.messages.stream(
            model=settings.anthropic_model,
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text
        return

    if provider == "gemini":
        if not settings.gemini_api_key:
            raise AIServiceError("GEMINI_API_KEY is not configured", provider)
        try:
            import google.generativeai as genai
        except ImportError as exc:
            raise AIServiceError(
                "google-generativeai is not installed. Run `pip install -r requirements.txt` "
                "or set AI_PROVIDER to openai/anthropic.",
                provider,
            ) from exc
        genai.configure(api_key=settings.gemini_api_key)
        gemini_model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            system_instruction=system_prompt,
        )
        history = [
            {"role": "model" if m["role"] == "assistant" else "user", "parts": [m["content"]]}
            for m in messages[:-1]
        ]
        last_message = messages[-1]["content"] if messages else "Hello"
        chat = gemini_model.start_chat(history=history)
        stream = await _await_provider(
            chat.send_message_async(last_message, stream=True, request_options={"timeout": timeout}),
            provider,
            timeout + 5,
            "Gemini stream request",
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
        return

    if not settings.openai_api_key:
        raise AIServiceError("OPENAI_API_KEY is not configured", provider)
    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=timeout)
    stream = await client.chat.completions.create(
        model=settings.openai_model,
        stream=True,
        messages=[{"role": "system", "content": system_prompt}, *messages],
    )
    async for chunk in stream:
        text = chunk.choices[0].delta.content or ""
        if text:
            yield text

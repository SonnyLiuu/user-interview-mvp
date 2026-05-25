from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

import httpx
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from .config import get_settings
from .errors import AIServiceError
from .project_modes import get_slot_context, normalize_project_type, project_actor


def _read_provider() -> str:
    settings = get_settings()
    provider = settings.ai_provider.strip().lower()
    return provider if provider in {"openai", "anthropic", "gemini"} else "openai"


def _gemini_rest_thinking_config(model: str) -> dict | None:
    level = (get_settings().gemini_thinking_level or "").strip().lower()
    if not level or level == "off":
        return None
    if "gemini-3" in model:
        return {"thinkingLevel": "high" if level == "high" else "low"}
    if "gemini-2.5" in model:
        budgets = {"low": 4096, "high": -1}
        return {"thinkingBudget": budgets.get(level, -1)}
    return None


def _parse_json_response(raw: str, provider: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```").strip()
        text = text.removesuffix("```").strip()

    try:
        parsed = json.loads(text or "{}")
    except json.JSONDecodeError as exc:
        raise AIServiceError("AI response was not valid JSON", provider) from exc

    if isinstance(parsed, str):
        try:
            parsed = json.loads(parsed)
        except json.JSONDecodeError as exc:
            raise AIServiceError("AI response JSON string did not contain a valid object", provider) from exc

    if isinstance(parsed, list) and len(parsed) == 1 and isinstance(parsed[0], dict):
        parsed = parsed[0]

    if not isinstance(parsed, dict):
        raise AIServiceError("AI response JSON was not an object", provider)

    return parsed


def _is_json_response_error(exc: AIServiceError) -> bool:
    message = str(exc)
    return "valid JSON" in message or "valid object" in message or "JSON was not an object" in message


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


def _clean_prompt_text(value) -> str:
    if isinstance(value, str):
        return " ".join(value.strip().split())
    if value is None:
        return ""
    try:
        return " ".join(json.dumps(value, ensure_ascii=False).strip().split())
    except TypeError:
        return " ".join(str(value).strip().split())


def _clean_prompt_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        text = _clean_prompt_text(item)
        if text:
            cleaned.append(text)
    return cleaned


def _join_prompt_list(value, fallback: str = "Not specified") -> str:
    cleaned = _clean_prompt_list(value)
    return "; ".join(cleaned) if cleaned else fallback


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
        model = _gemini_model_path(settings.gemini_model)
        url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent"
        prompt = f"{messages[0]['content']}\n\nReturn strict JSON only. Schema hint:\n{schema_hint}"
        body: dict = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"},
        }
        thinking = _gemini_rest_thinking_config(model)
        if thinking:
            body["generationConfig"]["thinkingConfig"] = thinking
        async with httpx.AsyncClient(timeout=timeout + 5) as client:
            response = await _await_provider(
                client.post(url, params={"key": settings.gemini_api_key}, json=body),
                provider,
                timeout + 5,
                "Gemini request",
            )
        if response.status_code >= 400:
            raise AIServiceError(f"Gemini request failed with HTTP {response.status_code}", provider)
        try:
            payload = response.json()
        except ValueError as exc:
            raise AIServiceError("Gemini request did not return valid JSON", provider) from exc
        return _parse_json_response(_gemini_response_text(payload) or "{}", provider)

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


async def extract_kickoff_idea(user_message: str, project_type: str = "startup") -> dict:
    normalized_type = normalize_project_type(project_type)
    if normalized_type == "networking":
        intro = (
            "A user has just described a networking outreach project. Extract every Foundation field that is actually present.\n\n"
            "Field meanings:\n"
            "- ideaSummary: the outreach campaign context and goal.\n"
            "- targetUser: the recipients or audience they want to contact.\n"
            "- painPoint: the timely reason, shared context, or relevance hook for reaching out.\n"
            "- valueProp: the core message, ask, or desired next step.\n"
            "- idealPeopleTypes: the types of people who should be contacted first.\n"
        )
    else:
        intro = "A founder has just described their startup idea. Extract every Foundation field that is actually present.\n\n"
    actor = "user" if normalized_type == "networking" else "founder"
    prompt = (
        intro
        +
        f'{actor.title()} message:\n"""\n{user_message}\n"""\n\n'
        "Rules:\n"
        "- ideaSummary should be 1-3 sentences, written as a neutral description, not first-person.\n"
        f"- Extract targetUser, painPoint, valueProp, and idealPeopleTypes only when the {actor} gives usable evidence.\n"
        '- quality is "solid" when the value is specific enough to build on without immediately asking the same question.\n'
        f'- quality is "weak" when the {actor} has the right direction but the answer still needs one clarifying probe.\n'
        '- Use quality "missing" and an empty value when the field is not actually present.\n'
        "- idealPeopleTypes should be a short list of conversation targets implied by the message."
    )
    raw = await _generate_json(
        [{"role": "user", "content": prompt}],
        '{"ideaSummary":{"value":"string","quality":"missing|weak|solid"},"targetUser":{"value":"string","quality":"missing|weak|solid"},"painPoint":{"value":"string","quality":"missing|weak|solid"},"valueProp":{"value":"string","quality":"missing|weak|solid"},"idealPeopleTypes":{"values":["string"],"quality":"missing|weak|solid"}}',
    )
    return raw if isinstance(raw, dict) else {}


async def generate_next_question(target_slot: str, recent_messages: list[dict], state: dict, project_type: str = "startup") -> dict:
    normalized_type = normalize_project_type(project_type)
    slot_context = get_slot_context(normalized_type)
    state_lines: list[str] = []
    if state.get("ideaSummary"):
        state_lines.append(f"{'Campaign' if normalized_type == 'networking' else 'Idea'}: {state['ideaSummary']}")
    if state.get("targetUser"):
        state_lines.append(f"{'Target recipients' if normalized_type == 'networking' else 'Target user'}: {state['targetUser']}")
    if state.get("painPoint"):
        state_lines.append(f"{'Outreach context' if normalized_type == 'networking' else 'Pain point'}: {state['painPoint']}")
    if state.get("valueProp"):
        state_lines.append(f"{'Core message/ask' if normalized_type == 'networking' else 'Value prop'}: {state['valueProp']}")
    if state.get("idealPeopleTypes"):
        state_lines.append(f"Ideal people: {', '.join(state['idealPeopleTypes'])}")
    if state.get("differentiation"):
        state_lines.append(f"{'Credibility hook' if normalized_type == 'networking' else 'Differentiation'}: {state['differentiation']}")
    if state.get("disqualifiers"):
        state_lines.append(f"{'Exclude' if normalized_type == 'networking' else 'Disqualifiers'}: {', '.join(state['disqualifiers'])}")
    follow_up = state.get("completeness", {}).get(target_slot) == "weak"
    user_label = "User" if normalized_type == "networking" else "Founder"
    snippet = "\n".join([f"{'AI' if msg['role'] == 'assistant' else user_label}: {msg['content']}" for msg in recent_messages[-6:]]) or "(none yet)"
    advisor_role = (
        "You are a practical outreach strategist helping someone set up a focused networking campaign. "
        "Your job is to ask one focused question to understand the outreach goal better, then offer concrete answer starters.\n\n"
        if normalized_type == "networking"
        else
        "You are a senior startup advisor having a direct, low-key conversation with a founder. "
        "Your job is to ask one focused question to understand their startup better, then offer concrete answer starters.\n\n"
    )
    prompt = (
        advisor_role
        +
        f"You need to learn: {slot_context[target_slot]}\n\n"
        f"This is {'a clarification of a weak answer' if follow_up else 'the next useful Foundation question'}.\n"
        "When a clarifying probe would sharpen the answer, ask about the real status quo, urgency, "
        "current workaround, or the riskiest assumption instead of repeating the field label.\n\n"
        "What you know so far:\n"
        f"{chr(10).join(state_lines) or '(nothing yet)'}\n\n"
        f"Recent conversation:\n{snippet}\n\n"
        f"Write the question as you would actually say it to a {user_label.lower()} — direct, brief, no fluff. "
        "1-2 sentences max. No bullet points, no numbered lists, no markdown. "
        f"Reference what you already know about their {'outreach project' if normalized_type == 'networking' else 'idea'} so it feels like a real conversation, not a form.\n\n"
        f"Then generate detailed suggestion chips that could help the {user_label.lower()} answer quickly without making "
        "the conversation feel like a generic form.\n\n"
        "Requirements:\n"
        f'- question: 1-2 natural sentences, conversational tone, no formatting\n'
        f'- Generate exactly 3-5 distinct, concrete choices relevant to this specific {user_label.lower()}\'s context\n'
        f'- Each choice should target the "{target_slot}" slot\n'
        "- Do not include a generic escape hatch; the UI always keeps free text available\n"
        '- Labels may be detailed but must stay under 110 characters\n'
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


async def extract_custom_slot_answer(
    target_slot: str,
    custom_text: str,
    recent_messages: list[dict],
    current_choices: list[dict] | None = None,
    selected_choices: list[dict] | None = None,
    project_type: str = "startup",
) -> dict:
    actor = project_actor(project_type)
    is_array_slot = target_slot in {"idealPeopleTypes", "disqualifiers"}
    snippet = "\n".join([f"{'AI' if msg['role'] == 'assistant' else actor.title()}: {msg['content']}" for msg in recent_messages[-4:]]) or "(none)"
    suggestion_context = [
        {
            "number": index + 1,
            "id": choice.get("id"),
            "label": choice.get("label"),
            "normalizedValue": choice.get("normalizedValue"),
        }
        for index, choice in enumerate(current_choices or [])
    ]
    selected_ids = {choice.get("id") for choice in selected_choices or []}
    selected_suggestions = [
        suggestion
        for suggestion in suggestion_context
        if suggestion["id"] in selected_ids
    ]
    prompt = (
        f"A {actor} typed a custom answer during onboarding. Extract a clean value for the target slot.\n\n"
        f"Target slot: {target_slot}\n"
        f"{'This slot stores an array - extract one or more distinct items.' if is_array_slot else 'This slot stores a single string.'}\n\n"
        f"Recent conversation:\n{snippet}\n\n"
        f"Current suggestions shown to the {actor}, in their visible numbered order:\n"
        f"{json.dumps(suggestion_context, indent=2)}\n\n"
        f"Suggestions the {actor} explicitly selected before sending:\n"
        f"{json.dumps(selected_suggestions, indent=2)}\n\n"
        f'{actor.title()}\'s custom answer:\n"""\n{custom_text}\n"""\n\n'
        "Rules:\n"
        f"- The {actor} may refer to suggestions by visible number, position, or a short description.\n"
        "- Use numbered suggestion context to resolve those references before extracting the value.\n"
        f"- The {actor}'s typed answer is authoritative when it combines, narrows, overrides, or contradicts suggestions.\n"
        "- Explicitly selected suggestions are supporting context unless the typed answer changes them.\n"
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


async def generate_foundation(messages: list[dict], state: dict, project_type: str = "startup") -> dict:
    normalized_type = normalize_project_type(project_type)
    user_label = "User" if normalized_type == "networking" else "Founder"
    transcript = "\n\n".join([f"{'AI' if msg['role'] == 'assistant' else user_label}: {msg['content']}" for msg in messages])
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
    if normalized_type == "networking":
        task = "Generate a Project Foundation document for a networking outreach campaign based on the onboarding conversation and collected state.\n\n"
        extra_rules = (
            "- summary should describe the outreach campaign context and goal.\n"
            "- targetUser should describe the recipients, not product users.\n"
            "- painPoint should capture the timely reason, shared context, or relevance hook for outreach.\n"
            "- valueProp should capture the core message, ask, or desired next step.\n"
            "- differentiation should capture the sender's credibility hook or personal angle.\n"
            "- biggestUnknown should name the message or targeting detail most likely to affect response quality.\n"
            "- nextResearchAction should be one concrete recipient-sourcing or personalization action.\n"
        )
    else:
        task = "Generate a Project Foundation document for a startup based on the onboarding conversation and collected state.\n\n"
        extra_rules = (
            "- biggestUnknown should name the highest-value assumption the founder still needs to test.\n"
            "- nextResearchAction should be one concrete people-research action that would test that unknown."
        )
    prompt = (
        task
        +
        f"Collected state:\n{state_snapshot}\n\n"
        f"Full onboarding transcript:\n{transcript}\n\n"
        "Rules:\n"
        "- Use the collected state as the primary source; use the transcript to fill gaps or improve clarity\n"
        "- summary should read as a neutral, polished description - not first-person\n"
        "- Keep all fields concise and specific\n"
        "- If differentiation or disqualifiers were not discussed, omit or set to null/empty\n"
        f"{extra_rules}"
    )
    raw = await _generate_json(
        [{"role": "user", "content": prompt}],
        '{"foundation":{"summary":"string","targetUser":"string","painPoint":"string","valueProp":"string","idealPeopleTypes":["string"],"differentiation":"string","disqualifiers":["string"],"biggestUnknown":"string","nextResearchAction":"string"}}',
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

    is_networking = project_context.get("project_type") == "networking"
    target_label = "Target recipients" if is_networking else "Target customer"
    pain_label = "Reason/context" if is_networking else "Pain point"
    value_label = "Core message/ask" if is_networking else "Value proposition"
    assumptions_label = "Message context" if is_networking else "Assumptions to validate"
    prompt = (
        (
            "You are helping someone prepare for a networking conversation. "
            "The goal is a focused, respectful conversation grounded in the outreach project context.\n\n"
        )
        if is_networking
        else
        (
            "You are helping a first-time founder prepare for a customer discovery call. "
            "This is not sales enablement. The goal is founder learning: sharper hypotheses, "
            "better market judgment, and clearer next steps.\n\n"
        )
    ) + (
        "FOUNDATION CONTEXT:\n"
        f"{project_context.get('idea_summary') or 'Not specified'}\n\n"
        f"{target_label}: {project_context.get('target_customer') or 'Not specified'}\n"
        f"{pain_label}: {project_context.get('pain_point') or 'Not specified'}\n"
        f"{value_label}: {project_context.get('value_prop') or 'Not specified'}\n"
        f"Ideal people to talk to: {_join_prompt_list(ideal_people)}\n"
        f"People to avoid: {_join_prompt_list(disqualifiers)}\n"
        f"{assumptions_label}: {_join_prompt_list(key_assumptions)}\n\n"
        "PERSON THEY ARE CALLING:\n"
        f"Name: {person.get('name') or 'Unknown'}\n"
        f"Title: {person.get('title') or 'Unknown'}\n"
        f"Company: {person.get('company') or 'Unknown'}\n"
        f"Persona type: {person.get('persona_type') or 'Unknown'}\n"
        f"Background: {analysis.get('summary') or 'Not specified'}\n"
        f"Why they matter: {analysis.get('why_they_matter') or 'Not specified'}\n"
        f"Key insights: {_join_prompt_list(key_insights)}\n\n"
        "Generate a focused call prep brief. Be specific to this person and this foundation.\n\n"
        "Output rules:\n"
        f"- objective: exactly one sharp sentence naming what the {'sender should accomplish or learn' if is_networking else 'founder should learn'}.\n"
        f"- goals: 3-5 {'conversation outcomes tied to the outreach goal' if is_networking else 'founder-learning outcomes'}. Phrase each as what to validate, falsify, or learn. "
        "Avoid vague sales tasks like 'ask about budget'.\n"
        f"- questions: 5-7 conversational questions the {'sender' if is_networking else 'founder'} could actually ask. "
        f"Make them specific to this person's background and the {'outreach context' if is_networking else 'founder assumptions'}. Keep them brief and direct.\n"
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

    if project_context.get("project_type") == "networking":
        prompt = (
            "Generate a short LinkedIn outreach message, less than 300 characters. "
            "Use the outreach campaign context and the recipient's background to make the note specific, warm, and concise. "
            "Mention shared context, event context, a credibility hook, or an in-person meeting intent only when provided in the project context. "
            "Do not invent facts. Do not frame this as customer discovery, startup validation, or a 20 minute call unless the project context explicitly asks for that.\n\n"
            "OUTREACH PROJECT CONTEXT:\n"
            f"Campaign: {project_context.get('idea_summary') or 'Not specified'}\n"
            f"Target recipients: {project_context.get('target_customer') or 'Not specified'}\n"
            f"Reason/context: {project_context.get('pain_point') or 'Not specified'}\n"
            f"Core message or ask: {project_context.get('value_prop') or 'Not specified'}\n"
            f"Ideal people to contact: {_join_prompt_list(ideal_people)}\n"
            f"Personal angle/credibility hook: {project_context.get('differentiation') or 'Not specified'}\n\n"
            "RECIPIENT CONTEXT:\n"
            f"Name: {person.get('name') or 'Unknown'}\n"
            f"Title: {person.get('title') or 'Unknown'}\n"
            f"Company: {person.get('company') or 'Unknown'}\n"
            f"Persona type: {person.get('persona_type') or 'Unknown'}\n"
            f"Background: {analysis.get('summary') or 'Not specified'}\n"
            f"Why they matter: {analysis.get('why_they_matter') or 'Not specified'}\n"
            f"Key insights: {_join_prompt_list(key_insights)}\n\n"
            "The body must be at most 300 characters total, including the greeting, spaces, and punctuation. "
            "Count characters, not words. Keep the subject separate from that body limit.\n\n"
            'Return only valid JSON with this schema: {"subject":"string","body":"string"}'
        )
        return await _generate_json(
            [{"role": "user", "content": prompt}],
            '{"subject":"string","body":"string"}',
        )

    prompt = (
        "I want you to generate a short outreach message, less than 300 letters. "
        "I will provide my project/startup idea and detailed background, and the background of the person "
        "I want to setup a call with. The recipient's background will provide context on what I wish to "
        "learn from conversation with that person. Choose one topic that I would want to learn about and "
        "introduce their familiarity with that topic, followed by my wish to learn about how they handled "
        "it in a 20 minute call. The topic should center on a real past experience the recipient likely had, "
        "especially one that could validate or falsify my project assumptions. Avoid adding any information "
        "about my project/startup; my goal is not to pitch, but to validate all aspects of my project/startup "
        "idea one person at a time.\n\n"
        "MY PROJECT CONTEXT:\n"
        f"Idea: {project_context.get('idea_summary') or 'Not specified'}\n"
        f"Target customer: {project_context.get('target_customer') or 'Not specified'}\n"
        f"Pain point: {project_context.get('pain_point') or 'Not specified'}\n"
        f"Ideal people to talk to: {_join_prompt_list(ideal_people)}\n"
        f"Assumptions to validate: {_join_prompt_list(key_assumptions)}\n\n"
        "RECIPIENT CONTEXT:\n"
        f"Name: {person.get('name') or 'Unknown'}\n"
        f"Title: {person.get('title') or 'Unknown'}\n"
        f"Company: {person.get('company') or 'Unknown'}\n"
        f"Persona type: {person.get('persona_type') or 'Unknown'}\n"
        f"Background: {analysis.get('summary') or 'Not specified'}\n"
        f"Why they matter: {analysis.get('why_they_matter') or 'Not specified'}\n"
        f"Key insights: {_join_prompt_list(key_insights)}\n\n"
        "The key insights area is a very valuable segment to base your outreach message on. "
        "Relate to the best one that is both interesting and applicable to my idea.\n\n"
        "The body must be at most 300 characters total, including the greeting, spaces, and punctuation. "
        "Count characters, not words. Keep the subject separate from that body limit.\n\n"
        'Return only valid JSON with this schema: {"subject":"string","body":"string"}'
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


def _gemini_model_path(model: str) -> str:
    return model if model.startswith("models/") else f"models/{model}"


def _gemini_response_text(payload: dict) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        return ""
    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    return "\n".join(part.get("text", "") for part in parts if part.get("text")).strip()


def _gemini_grounding_sources(payload: dict) -> list[str]:
    candidates = payload.get("candidates") or []
    if not candidates:
        return []

    chunks = (candidates[0].get("groundingMetadata") or {}).get("groundingChunks") or []
    sources: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        web = chunk.get("web") or {}
        uri = web.get("uri")
        if not uri or uri in seen:
            continue
        seen.add(uri)
        title = web.get("title") or "Source"
        sources.append(f"- {title}: {uri}")
    return sources


async def get_advisor_web_context(user_message: str, foundation: dict, recent_messages: list[dict] | None = None) -> str:
    settings = get_settings()
    provider = _read_provider()
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

    if provider == "gemini":
        if not settings.gemini_api_key:
            return ""
        model = _gemini_model_path(settings.gemini_web_search_model or settings.gemini_model)
        url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent"
        body: dict = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "tools": [{"google_search": {}}],
        }
        thinking = _gemini_rest_thinking_config(model)
        if thinking:
            body["generationConfig"] = {"thinkingConfig": thinking}
        try:
            async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds + 15) as client:
                response = await _await_provider(
                    client.post(url, params={"key": settings.gemini_api_key}, json=body),
                    provider,
                    settings.ai_request_timeout_seconds + 15,
                    "Gemini web search request",
                )
            if response.status_code >= 400:
                raise AIServiceError(f"Gemini web search request failed with HTTP {response.status_code}", provider)
            payload = response.json()
        except (AIServiceError, ValueError):
            return ""

        text = _gemini_response_text(payload)
        sources = _gemini_grounding_sources(payload)
        if sources:
            text = f"{text}\n\nSources:\n{chr(10).join(sources)}".strip()
        return text

    if provider == "openai":
        if not settings.openai_api_key:
            return ""
        client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=settings.ai_request_timeout_seconds)
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

    return ""


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

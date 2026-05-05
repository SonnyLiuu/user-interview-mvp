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


async def _await_provider(coro, provider: str, timeout: float, operation: str):
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except TimeoutError as exc:
        raise AIServiceError(f"{operation} timed out", provider) from exc
    except AIServiceError:
        raise
    except Exception as exc:
        raise AIServiceError(f"{operation} failed: {exc}", provider) from exc


async def _generate_json(messages: list[dict], schema_hint: str) -> dict:
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
        "Role definitions:\n"
        "- sender: the founder/user sending the outreach.\n"
        "- recipient: the person receiving the outreach.\n"
        "- Product context is private. Use it only to choose the research topic. Never reveal the product, app, tool, features, company name, or startup idea in the message.\n\n"

        "SENDER'S PROJECT CONTEXT:\n"
        f"Idea: {project_context.get('idea_summary') or 'Not specified'}\n"
        f"Target customer: {project_context.get('target_customer') or 'Not specified'}\n"
        f"Pain point: {project_context.get('pain_point') or 'Not specified'}\n"
        f"Ideal people to talk to: {', '.join(ideal_people) if ideal_people else 'Not specified'}\n"
        f"Assumptions to validate: {'; '.join(key_assumptions) if key_assumptions else 'Not specified'}\n\n"

        "RECIPIENT CONTEXT:\n"
        f"Name: {person.get('name') or 'Unknown'}\n"
        f"Title: {person.get('title') or 'Unknown'}\n"
        f"Company: {person.get('company') or 'Unknown'}\n"
        f"Persona type: {person.get('persona_type') or 'Unknown'}\n"
        f"Background: {analysis.get('summary') or 'Not specified'}\n"
        f"Why they matter: {analysis.get('why_they_matter') or 'Not specified'}\n"
        f"Key insights: {'; '.join(key_insights) if key_insights else 'Not specified'}\n\n"

        "Write a short, warm cold outreach message for customer discovery.\n"
        "Use the sender's assumptions and the recipient's background to choose one focused conversation topic. "
        "The topic should center on a real past experience the recipient likely had, especially one that could validate or falsify the sender's assumptions. "
        "Do not list the assumptions or quote the project context.\n\n"

        "Output rules:\n"
        "- subject: an email subject line\n"
        "- body: plain text message body, around 1 paragraph\n\n"

        "Body rules:\n"
        "- First paragraph: focus only on the recipient. Use 2-3 specific details from their role, company, market, customers, recent work, or background. Explain why their experience is relevant; do not just name-drop their title or company.\n"
        "- Second paragraph: clearly state what the sender is trying to learn from the recipient's past experience. Focus on what happened, how they handled it, what was difficult, what they tried, what worked or failed, and what the outcome was.\n"
        "- Third paragraph: make a soft 20-minute ask to learn from the recipient's experience.\n\n"

        "Example style:\n"
        "Use this as a pattern for specificity, structure, and tone. Do not copy the names, companies, or exact topic unless they match the recipient.\n"
        "subject: Learning from Epsilla’s early customer discovery\n"
        "body: Renchu, I noticed you’re Co-Founder & CEO of Epsilla after previously leading cloud work at TigerGraph. Your path is especially interesting because you’ve worked across deep technical infrastructure, engineering leadership, and the founder side of turning technical work into a company.\n\n"
        "I’m researching how technical founders handled the early shift from building product to understanding customers. I’d love to learn how you identified your first useful customer signals, what surprised you during market validation, and what did or didn’t work when narrowing the initial customer segment.\n\n"
        "Would you be open to a 20-minute call so I can learn from how you handled that experience?\n"
        
        "Avoid:\n"
        "- Do not mention the sender's product, company name, startup idea, app, platform, tool, features, or solution.\n"
        "- Do not say 'I'm building', 'we're building', 'we help', 'our product', or similar phrases.\n"
        "- Do not ask for feedback, validation, advice, or a reaction to an idea.\n"
        "- Do not use hypotheticals like 'would you use', 'would you pay', 'does this sound useful', or 'could you see yourself'.\n"
        "- Avoid fluff, hype, flattery, urgency, markdown, signatures, numbering, and filler phrases like 'I hope this finds you well'."
    )
    return await _generate_json(
        [{"role": "user", "content": prompt}],
        '{"subject":"string","body":"string"}',
    )


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

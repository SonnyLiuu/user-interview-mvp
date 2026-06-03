from __future__ import annotations

import json

from .ai_clients import generate_json as _generate_json
from .ai_clients import get_web_context as _get_web_context
from .ai_clients import stream_intake_reply
from .project_modes import (
    get_array_slots,
    get_mode_slots,
    get_slot_context,
    normalize_project_type,
    project_actor,
)
from .onboarding_mode_hints import (
    apply_networking_kickoff_hints,
    extract_selectivity_detail,
    networking_personalization_turn,
    networking_selectivity_turn,
    normalize_networking_foundation,
)


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


async def extract_kickoff_idea(user_message: str, project_type: str = "startup") -> dict:
    normalized_type = normalize_project_type(project_type)
    actor = "user" if normalized_type == "networking" else "founder"
    slots = get_mode_slots(normalized_type)
    array_slots = get_array_slots(normalized_type)
    field_lines = "\n".join(
        f"- {slot['key']}: {slot['context']}{' (array)' if slot.get('array') else ''}."
        for slot in slots
    )
    intro = (
        "A user has just described a networking outreach project. Extract every field that is actually present.\n\n"
        if normalized_type == "networking"
        else
        "A founder has just described their startup. Extract every startup onboarding field that is actually present.\n\n"
    )
    prompt = (
        intro
        + "Field meanings:\n"
        + field_lines
        + "\n\n"
        +
        f'{actor.title()} message:\n"""\n{user_message}\n"""\n\n'
        "Rules:\n"
        "- Extract a field only when the message gives usable evidence.\n"
        '- quality is "solid" when the value is specific enough to build on without immediately asking the same question.\n'
        f'- quality is "weak" when the {actor} has the right direction but the answer still needs one clarifying probe.\n'
        '- Use quality "missing" and an empty value when the field is not actually present.\n'
        "- For array fields, return a short list of distinct items.\n"
    )
    if normalized_type == "networking":
        prompt += (
            "- If LinkedIn outreach is mentioned, infer that connecting on LinkedIn is the goal or desired response.\n"
            "- If the user says they are presenting, giving an oral presentation, or are an oral presenter at the event, that is sufficient senderContext; do not ask for resume-style background.\n"
            "- If the user mentions meeting on Tuesday or in person, capture that in sharedContext and desiredOutcome.\n"
            "- Treat acceptance/selectivity stats, such as '6 out of 45', as an optional composition choice; do not put them in requiredMentions yet.\n"
        )
    schema_fields = []
    for slot in slots:
        if slot["key"] in array_slots:
            schema_fields.append(f'"{slot["key"]}":{{"values":["string"],"quality":"missing|weak|solid"}}')
        else:
            schema_fields.append(f'"{slot["key"]}":{{"value":"string","quality":"missing|weak|solid"}}')
    raw = await _generate_json(
        [{"role": "user", "content": prompt}],
        "{" + ",".join(schema_fields) + "}",
    )
    if not isinstance(raw, dict):
        return {}
    if normalized_type == "networking":
        return apply_networking_kickoff_hints(raw, user_message)
    return raw


async def generate_next_question(target_slot: str, recent_messages: list[dict], state: dict, project_type: str = "startup") -> dict:
    normalized_type = normalize_project_type(project_type)
    slot_context = get_slot_context(normalized_type)
    state_lines: list[str] = []
    for slot in get_mode_slots(normalized_type):
        value = state.get(slot["key"])
        if not value:
            continue
        if isinstance(value, list):
            state_lines.append(f"{slot['label']}: {', '.join(value)}")
        else:
            state_lines.append(f"{slot['label']}: {value}")
    follow_up = state.get("completeness", {}).get(target_slot) == "weak"
    user_label = "User" if normalized_type == "networking" else "Founder"
    snippet = "\n".join([f"{'AI' if msg['role'] == 'assistant' else user_label}: {msg['content']}" for msg in recent_messages[-6:]]) or "(none yet)"
    if normalized_type == "networking" and target_slot == "personalizationStrategy":
        selectivity_detail = extract_selectivity_detail(f"{chr(10).join(state_lines)}\n{snippet}")
        if selectivity_detail:
            return networking_selectivity_turn(selectivity_detail)
        return networking_personalization_turn()
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
        f"This is {'a clarification of a weak answer' if follow_up else 'the next useful onboarding question'}.\n"
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
        '- Labels may be detailed but must stay under 120 characters\n'
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
    normalized_type = normalize_project_type(project_type)
    is_array_slot = target_slot in get_array_slots(normalized_type)
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
        {slot["key"]: state.get(slot["key"]) for slot in get_mode_slots(normalized_type)},
        indent=2,
    )
    if normalized_type == "networking":
        task = "Generate a mode-specific Foundation document for a networking outreach campaign based on the onboarding conversation and collected state.\n\n"
        extra_rules = (
            "- outreachGoal should describe what the user wants this outreach to accomplish.\n"
            "- recipients should describe who is being contacted and why they are in scope.\n"
            "- senderContext should capture only sender facts the message should mention or rely on.\n"
            "- sharedContext should capture the event, community, relationship, date, or topic that makes the message relevant.\n"
            "- requiredMentions should preserve exact facts that must appear, such as oral presenter status, dates, event names, or in-person meeting intent.\n"
            "- Include selective acceptance details such as '6 out of 45' only if the user chose to include them; if they chose a lighter note, put that avoidance in messageBoundaries instead.\n"
            "- optionalMentions should list useful facts that should only be included if the user opted in or they fit naturally.\n"
            "- desiredOutcome should capture what the recipient should do next or what success looks like.\n"
            "- personalizationStrategy should say how the message should be written, including brevity, recipient-specific personalization, and optional credibility-detail preference.\n"
            "- tone should say how the message should sound.\n"
            "- channelFormat should capture the channel and format constraints, such as LinkedIn connection note under 300 characters.\n"
            "- messageBoundaries should list things to avoid, such as over-flattery, career summaries, pitches, or call requests.\n"
            "- nextSourcingStep should be one concrete recipient sourcing or personalization action.\n"
            "- priorityRecipientTypes should list the recipient types that should score highest for this specific campaign.\n"
            "- matchRubric should define what makes a person a strong match for this outreach, including topic fit, recipient role, shared context, and desired response usefulness.\n"
            "- lowFitSignals should list visible signals that should lower a person's match score.\n"
            "- The document should read like message guidance, not a startup brief.\n"
        )
        schema_hint = (
            '{"foundation":{"outreachGoal":"string","recipients":"string","senderContext":"string",'
            '"sharedContext":"string","desiredOutcome":"string","requiredMentions":["string"],'
            '"optionalMentions":["string"],"personalizationStrategy":"string","tone":"string",'
            '"channelFormat":"string","messageBoundaries":["string"],'
            '"nextSourcingStep":"string","priorityRecipientTypes":["string"],'
            '"matchRubric":"string","lowFitSignals":["string"]}}'
        )
    else:
        task = "Generate a startup Foundation document based on the onboarding conversation and collected state.\n\n"
        extra_rules = (
            "- startupName should preserve the founder's chosen startup, product, company, or working name.\n"
            "- recommendedOutreachProject must always recommend Information Discovery.\n"
            "- Use the collected state's biggestBottleneck only to write recommendedOutreachProject.reason.\n"
            "- Do not include biggestBottleneck as a Foundation field; it is only recommendation context.\n"
            "- recommendedOutreachProject.reason must explain why learning-oriented outreach is valuable now.\n"
            "- Do not recommend sales, investor, recruiting, partnership, advisor, or press outreach in V1."
        )
        schema_hint = (
            '{"foundation":{"startupName":"string","summary":"string","targetUser":"string",'
            '"painPoint":"string","valueProp":"string","idealPeopleTypes":["string"],'
            '"startupStage":"string|null","traction":["string"],'
            '"differentiation":"string|null","recommendedOutreachProject":'
            '{"type":"information_discovery","label":"Information Discovery","reason":"string"}}}'
        )
    prompt = (
        task
        +
        f"Collected state:\n{state_snapshot}\n\n"
        f"Full onboarding transcript:\n{transcript}\n\n"
        "Rules:\n"
        "- Use the collected state as the primary source; use the transcript to fill gaps or improve clarity\n"
        "- Use the exact field names requested in the schema\n"
        "- Keep all fields concise and specific\n"
        "- If optional fields were not discussed, omit or set to null/empty\n"
        f"{extra_rules}"
    )
    raw = await _generate_json(
        [{"role": "user", "content": prompt}],
        schema_hint,
    )
    # Normalize: AI sometimes returns foundation fields at top level without the wrapper key
    foundation = raw.get("foundation") if "foundation" in raw else raw
    if normalized_type == "networking" and isinstance(foundation, dict):
        foundation = normalize_networking_foundation(foundation, state, transcript)
    elif normalized_type == "startup" and isinstance(foundation, dict):
        foundation.pop("biggestBottleneck", None)
    return {"foundation": foundation}


async def generate_call_brief(person: dict, project_context: dict) -> dict:
    analysis = person.get("analysis") or {}
    key_insights = analysis.get("key_insights") or []
    ideal_people = project_context.get("ideal_people_types") or []
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
    key_assumptions = project_context.get("key_assumptions") or []

    if project_context.get("project_type") == "networking":
        prompt = (
            "Generate a short LinkedIn-native outreach message, less than 300 characters. "
            "Use the sender background, outreach goal, required mentions, desired response, tone, and composition rules first. "
            "Use recipient background only as optional personalization. Include at most one recipient-specific detail unless the project explicitly asks for deep personalization. "
            "Do not summarize the recipient's career. Do not invent facts. Do not frame this as customer discovery, startup validation, a pitch, or a 20 minute call unless explicitly requested. "
            "Do not mention selectivity stats like '6 out of 45' unless they appear in Required mentions. "
            "Do not say 'your talk' unless the recipient context clearly says they are a speaker or have a talk; for organizers, refer to the workshop or their organizing role instead.\n\n"
            "OUTREACH PROJECT CONTEXT:\n"
            f"Goal and guidance: {project_context.get('idea_summary') or 'Not specified'}\n"
            f"Target recipients: {project_context.get('target_customer') or 'Not specified'}\n"
            f"Sender context: {project_context.get('sender_context') or project_context.get('differentiation') or 'Not specified'}\n"
            f"Shared context: {project_context.get('shared_context') or project_context.get('pain_point') or 'Not specified'}\n"
            f"Required mentions: {_join_prompt_list(project_context.get('required_mentions'))}\n"
            f"Optional mentions: {_join_prompt_list(project_context.get('optional_mentions'))}\n"
            f"Desired outcome: {project_context.get('desired_outcome') or project_context.get('value_prop') or 'Not specified'}\n"
            f"Personalization strategy: {project_context.get('personalization_strategy') or 'Not specified'}\n"
            f"Tone: {project_context.get('tone') or 'Not specified'}\n"
            f"Channel format: {project_context.get('channel_format') or 'Not specified'}\n"
            f"Message boundaries: {_join_prompt_list(project_context.get('message_boundaries'))}\n"
            f"Ideal people to contact: {_join_prompt_list(ideal_people)}\n"
            f"Personal angle/credibility hook: {project_context.get('differentiation') or 'Not specified'}\n\n"
            "RECIPIENT CONTEXT:\n"
            f"Name: {person.get('name') or 'Unknown'}\n"
            f"Title: {person.get('title') or 'Unknown'}\n"
            f"Company: {person.get('company') or 'Unknown'}\n"
            f"Persona type: {person.get('persona_type') or 'Unknown'}\n"
            f"Outreach angle: {analysis.get('summary') or 'Not specified'}\n"
            f"Why they matter: {analysis.get('why_they_matter') or 'Not specified'}\n"
            f"Useful personalization: {_join_prompt_list(key_insights)}\n\n"
            "Write as a natural note from the sender. Prioritize required mentions and desired response over proving you researched the recipient. "
            "For a conference/workshop LinkedIn connection note, prefer one warm sentence about the shared event, one concise sender-context sentence, and one connection/meeting intent. "
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
    sender_context = foundation.get("senderContext")
    desired_outcome = foundation.get("desiredOutcome")
    personalization = foundation.get("personalizationStrategy")
    if foundation.get("outreachGoal") or foundation.get("recipients") or sender_context:
        parts = [
            f"Outreach goal: {foundation.get('outreachGoal')}" if foundation.get("outreachGoal") else None,
            f"Recipients: {foundation.get('recipients')}" if foundation.get("recipients") else None,
            f"Sender context: {sender_context}" if sender_context else None,
            f"Shared context: {foundation.get('sharedContext')}" if foundation.get("sharedContext") else None,
            (
                f"Required mentions: {', '.join(foundation.get('requiredMentions') or [])}"
                if foundation.get("requiredMentions")
                else None
            ),
            (
                f"Optional mentions: {', '.join(foundation.get('optionalMentions') or [])}"
                if foundation.get("optionalMentions")
                else None
            ),
            f"Desired outcome: {desired_outcome}" if desired_outcome else None,
            f"Personalization strategy: {personalization}" if personalization else None,
            f"Tone: {foundation.get('tone')}" if foundation.get("tone") else None,
            f"Channel format: {foundation.get('channelFormat')}" if foundation.get("channelFormat") else None,
        ]
        return "\n".join(part for part in parts if part)

    parts = [
        f"Startup: {foundation.get('startupName')}" if foundation.get("startupName") else None,
        f"Summary: {foundation.get('summary')}" if foundation.get("summary") else None,
        f"Target user: {foundation.get('targetUser')}" if foundation.get("targetUser") else None,
        f"Pain point: {foundation.get('painPoint')}" if foundation.get("painPoint") else None,
        f"Value prop: {foundation.get('valueProp')}" if foundation.get("valueProp") else None,
        f"Startup stage: {foundation.get('startupStage')}" if foundation.get("startupStage") else None,
        (
            f"Traction: {', '.join(foundation.get('traction') or [])}"
            if foundation.get("traction")
            else None
        ),
        (
            f"Ideal people: {', '.join(foundation.get('idealPeopleTypes') or [])}"
            if foundation.get("idealPeopleTypes")
            else None
        ),
        f"Differentiation: {foundation.get('differentiation')}" if foundation.get("differentiation") else None,
    ]
    return "\n".join(part for part in parts if part)


async def get_advisor_web_context(user_message: str, foundation: dict, recent_messages: list[dict] | None = None) -> str:
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
    return await _get_web_context(prompt)

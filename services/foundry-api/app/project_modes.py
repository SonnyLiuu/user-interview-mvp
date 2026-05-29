from __future__ import annotations

PROJECT_TYPE_STARTUP = "startup"
PROJECT_TYPE_NETWORKING = "networking"
PROJECT_TYPES = {PROJECT_TYPE_STARTUP, PROJECT_TYPE_NETWORKING}


STARTUP_SLOTS = [
    {
        "key": "ideaSummary",
        "label": "Summary",
        "context": "what the founder is building and for whom",
        "required": True,
        "array": False,
        "fallback": {
            "question": "What are you building?",
            "choices": [
                {"id": "a", "label": "A focused SaaS tool that helps a specific business team finish a painful workflow faster", "normalizedValue": "A focused SaaS tool for a specific business workflow"},
                {"id": "b", "label": "A consumer product that changes how an individual handles a repeated personal problem", "normalizedValue": "A consumer product for a repeated personal problem"},
                {"id": "c", "label": "A marketplace that connects two groups who struggle to find or trust each other today", "normalizedValue": "A marketplace connecting two groups with matching or trust friction"},
                {"id": "d", "label": "A service-led business where software or AI removes the hardest delivery bottleneck", "normalizedValue": "A service-led business with software or AI support"},
            ],
            "customPlaceholder": "Describe what you're building in a sentence or two...",
        },
    },
    {
        "key": "targetUser",
        "label": "Target User",
        "context": "who the primary user is - the person who experiences the problem",
        "required": True,
        "array": False,
        "fallback": {
            "question": "Who is the primary person you're building this for?",
            "choices": [
                {"id": "a", "label": "Individual professionals who personally feel the workflow pain during their day-to-day work", "normalizedValue": "Individual professionals who personally feel the workflow pain"},
                {"id": "b", "label": "Small business owners who both feel the problem and decide whether a tool is worth trying", "normalizedValue": "Small business owners who feel the problem and decide on tools"},
                {"id": "c", "label": "A specific team inside a mid-size company that owns this workflow and its results", "normalizedValue": "A specific team at a mid-size company that owns the workflow"},
                {"id": "d", "label": "Enterprise teams where the user and buying decision may be split across roles", "normalizedValue": "Enterprise teams with separate users and buying decisions"},
                {"id": "e", "label": "Consumers who run into this problem repeatedly outside a work setting", "normalizedValue": "Consumers who repeatedly experience this problem"},
            ],
            "customPlaceholder": "Describe the primary person you're building this for...",
        },
    },
    {
        "key": "painPoint",
        "label": "Core Problem",
        "context": "the core pain or problem the product addresses",
        "required": True,
        "array": False,
        "fallback": {
            "question": "What's the core problem this solves?",
            "choices": [
                {"id": "a", "label": "They lose time to manual or repetitive work that still needs human attention", "normalizedValue": "Manual or repetitive work consumes time and attention"},
                {"id": "b", "label": "They cannot find or trust the information needed to make the next decision", "normalizedValue": "Difficulty finding trustworthy information for decisions"},
                {"id": "c", "label": "The workflow breaks when people coordinate across handoffs, tools, or teams", "normalizedValue": "Coordination breaks across handoffs, tools, or teams"},
                {"id": "d", "label": "Current tools exist, but they are too complex, expensive, or awkward for this use case", "normalizedValue": "Existing tools are too complex, expensive, or awkward for the use case"},
            ],
            "customPlaceholder": "Describe the core problem in your own words...",
        },
    },
    {
        "key": "valueProp",
        "label": "Value Proposition",
        "context": "what specific value the product delivers to users",
        "required": True,
        "array": False,
        "fallback": {
            "question": "What's the main value you deliver?",
            "choices": [
                {"id": "a", "label": "Give them meaningful time back on a workflow they repeat often", "normalizedValue": "Saves meaningful time on a repeated workflow"},
                {"id": "b", "label": "Reduce the cost of getting the same work done well", "normalizedValue": "Reduces the cost of completing the work well"},
                {"id": "c", "label": "Improve the quality, reliability, or confidence of the result", "normalizedValue": "Improves the quality and reliability of outcomes"},
                {"id": "d", "label": "Remove enough friction that people actually complete the workflow", "normalizedValue": "Removes friction that blocks workflow completion"},
            ],
            "customPlaceholder": "Describe the specific value you deliver...",
        },
    },
    {
        "key": "idealPeopleTypes",
        "label": "Ideal People to Talk To",
        "context": "the types of people who would be ideal early users or customers",
        "required": True,
        "array": True,
        "fallback": {
            "question": "Who would be ideal early users or customers?",
            "choices": [
                {"id": "a", "label": "Target users who feel this problem often enough to describe their current workaround", "normalizedValue": "Target users who feel the problem and can describe their workaround"},
                {"id": "b", "label": "Experienced builders who have already navigated a similar product or startup challenge", "normalizedValue": "Experienced builders with similar product or startup experience"},
                {"id": "c", "label": "Industry experts or practitioners who understand the workflow and its failure modes deeply", "normalizedValue": "Industry experts or practitioners who understand the workflow deeply"},
                {"id": "d", "label": "Decision makers or power users who know why current tools get adopted or rejected", "normalizedValue": "Decision makers or power users who know why current tools win or fail"},
            ],
            "customPlaceholder": "Describe your ideal early user...",
        },
    },
    {
        "key": "differentiation",
        "label": "Differentiation",
        "context": "what makes this different from existing solutions",
        "required": False,
        "array": False,
        "fallback": {
            "question": "What makes this different from existing solutions?",
            "choices": [
                {"id": "a", "label": "Much simpler / lower friction", "normalizedValue": "Much simpler and lower friction than alternatives"},
                {"id": "b", "label": "Focused on a specific niche others ignore", "normalizedValue": "Focused on a niche the incumbent tools ignore"},
                {"id": "c", "label": "AI-native workflow vs legacy tool", "normalizedValue": "AI-native approach vs legacy tools"},
                {"id": "d", "label": "Better price-to-value ratio", "normalizedValue": "Better price-to-value ratio"},
            ],
            "customPlaceholder": "Describe what makes your approach different...",
        },
    },
]


NETWORKING_SLOTS = [
    {
        "key": "outreachGoal",
        "label": "Outreach Goal",
        "context": "what the user is trying to accomplish with this outreach campaign",
        "required": True,
        "array": False,
        "fallback": {
            "question": "What are you trying to accomplish with this outreach?",
            "choices": [
                {"id": "a", "label": "Meet relevant people at an upcoming conference or workshop", "normalizedValue": "Meet relevant people at an upcoming conference or workshop"},
                {"id": "b", "label": "Start conversations with advisors, collaborators, or potential partners", "normalizedValue": "Start conversations with advisors, collaborators, or potential partners"},
                {"id": "c", "label": "Follow up with a targeted LinkedIn list around a shared professional context", "normalizedValue": "Follow up with a targeted LinkedIn list around a shared professional context"},
                {"id": "d", "label": "Recruit or network with people from a specific role, field, or community", "normalizedValue": "Recruit or network with people from a specific role, field, or community"},
            ],
            "customPlaceholder": "Describe the outreach goal...",
        },
    },
    {
        "key": "recipients",
        "label": "Recipients",
        "context": "who the user is contacting and why those people matter",
        "required": True,
        "array": False,
        "fallback": {
            "question": "Who are you reaching out to?",
            "choices": [
                {"id": "a", "label": "Invited speakers, organizers, or panelists connected to the same event", "normalizedValue": "Invited speakers, organizers, or panelists connected to the same event"},
                {"id": "b", "label": "Researchers or experts whose work overlaps with my topic", "normalizedValue": "Researchers or experts whose work overlaps with the sender's topic"},
                {"id": "c", "label": "Potential collaborators with shared research, product, or community interests", "normalizedValue": "Potential collaborators with shared research, product, or community interests"},
                {"id": "d", "label": "Connectors who could introduce me to the right community", "normalizedValue": "Connectors who could introduce the sender to the right community"},
            ],
            "customPlaceholder": "Describe the recipients...",
        },
    },
    {
        "key": "senderContext",
        "label": "Sender Context",
        "context": "optional sender facts recipients need to know for the message to make sense; avoid resume-style background unless it affects the note",
        "required": False,
        "array": False,
        "fallback": {
            "question": "Is there any sender context the note should include beyond what we already know?",
            "choices": [
                {"id": "a", "label": "I am presenting at the same event", "normalizedValue": "The sender is presenting at the same event"},
                {"id": "b", "label": "My paper, talk, or project was selected through a competitive process", "normalizedValue": "The sender's paper, talk, or project was selected through a competitive process"},
                {"id": "c", "label": "I have a specific overlap with their work", "normalizedValue": "The sender has a specific overlap with the recipient's work"},
                {"id": "d", "label": "A mutual connection or shared community makes this warmer", "normalizedValue": "A mutual connection or shared community makes the message warmer"},
            ],
            "customPlaceholder": "Add only sender background that should appear in the message...",
        },
    },
    {
        "key": "sharedContext",
        "label": "Shared Context",
        "context": "the timely context, event, relationship, or overlap that makes the outreach relevant now",
        "required": True,
        "array": False,
        "fallback": {
            "question": "What makes the message timely or relevant?",
            "choices": [
                {"id": "a", "label": "We will be at the same event soon and can meet in person", "normalizedValue": "The sender and recipients will be at the same event soon and can meet in person"},
                {"id": "b", "label": "Their work overlaps with something I am presenting", "normalizedValue": "The recipient's work overlaps with something the sender is presenting"},
                {"id": "c", "label": "We share a community, organization, school, investor, or mutual connection", "normalizedValue": "There is a shared community, organization, school, investor, or mutual connection"},
                {"id": "d", "label": "Their recent work makes a short exchange especially relevant", "normalizedValue": "The recipient's recent work makes a short exchange especially relevant"},
            ],
            "customPlaceholder": "Describe the shared context...",
        },
    },
    {
        "key": "desiredOutcome",
        "label": "Desired Outcome",
        "context": "what the user wants recipients to do next or what success should look like",
        "required": True,
        "array": False,
        "fallback": {
            "question": "What should the message ask them to do?",
            "choices": [
                {"id": "a", "label": "Say hello or meet briefly in person during the event", "normalizedValue": "Say hello or meet briefly in person during the event"},
                {"id": "b", "label": "Connect on LinkedIn and open the door for a later follow-up", "normalizedValue": "Connect on LinkedIn and open the door for a later follow-up"},
                {"id": "c", "label": "Exchange ideas around the shared topic", "normalizedValue": "Exchange ideas around the shared topic"},
                {"id": "d", "label": "Point me toward another relevant person", "normalizedValue": "Point the sender toward another relevant person"},
            ],
            "customPlaceholder": "Describe the desired response or next step...",
        },
    },
    {
        "key": "requiredMentions",
        "label": "Required Mentions",
        "context": "specific facts, achievements, names, dates, or context every message should mention",
        "required": False,
        "array": True,
        "fallback": {
            "question": "What should every message make sure to mention?",
            "choices": [
                {"id": "a", "label": "That I am presenting at the same event", "normalizedValue": "Mention that the sender is presenting at the same event"},
                {"id": "b", "label": "That the talk or paper was selectively accepted", "normalizedValue": "Mention that the talk or paper was selectively accepted"},
                {"id": "c", "label": "The exact date or moment when we could meet", "normalizedValue": "Mention the exact date or moment when sender and recipient could meet"},
                {"id": "d", "label": "A specific shared topic or research overlap", "normalizedValue": "Mention a specific shared topic or research overlap"},
            ],
            "customPlaceholder": "List any required mentions...",
        },
    },
    {
        "key": "optionalMentions",
        "label": "Optional Mentions",
        "context": "facts that may be useful but should only be included if the user opts in or if they fit naturally",
        "required": False,
        "array": True,
        "fallback": {
            "question": "Are there any optional facts we should decide whether to include?",
            "choices": [
                {"id": "a", "label": "Selective acceptance or prestige detail", "normalizedValue": "Selective acceptance or prestige detail"},
                {"id": "b", "label": "Paper or talk title only when it fits", "normalizedValue": "Paper or talk title only when it fits"},
                {"id": "c", "label": "Specific shared topic or research overlap", "normalizedValue": "Specific shared topic or research overlap"},
                {"id": "d", "label": "No optional facts; keep the note lean", "normalizedValue": "No optional facts; keep the note lean"},
            ],
            "customPlaceholder": "List optional facts that should only be used when appropriate...",
        },
    },
    {
        "key": "personalizationStrategy",
        "label": "Personalization Strategy",
        "context": "how the user wants the message written, including personalization depth, brevity, and whether optional credibility details should be included",
        "required": True,
        "array": False,
        "fallback": {
            "question": "Do you want these messages personalized, and if so how much?",
            "choices": [
                {"id": "a", "label": "No recipient personalization: use only the shared context and ask", "normalizedValue": "No recipient personalization: use only the shared context and ask"},
                {"id": "b", "label": "Light personalization: add one obvious recipient hook when available", "normalizedValue": "Light personalization: add one obvious recipient hook when available"},
                {"id": "c", "label": "Role-based personalization: adapt for speakers, organizers, or other recipient types", "normalizedValue": "Role-based personalization: adapt for speakers, organizers, or other recipient types"},
                {"id": "d", "label": "High personalization: include a specific detail from their work when available", "normalizedValue": "High personalization: include a specific detail from the recipient's work when available"},
            ],
            "customPlaceholder": "Describe whether to personalize each message and how much...",
        },
    },
    {
        "key": "tone",
        "label": "Tone",
        "context": "how the user wants the outreach messages to sound",
        "required": True,
        "array": False,
        "fallback": {
            "question": "What tone do you want for these outreach messages?",
            "choices": [
                {"id": "a", "label": "Warm, brief, and peer-like", "normalizedValue": "Warm, brief, and peer-like"},
                {"id": "b", "label": "Respectful and concise, without over-flattery", "normalizedValue": "Respectful and concise, without over-flattery"},
                {"id": "c", "label": "Curious and collaborative", "normalizedValue": "Curious and collaborative"},
                {"id": "d", "label": "Direct and practical", "normalizedValue": "Direct and practical"},
            ],
            "customPlaceholder": "Describe the preferred tone...",
        },
    },
    {
        "key": "messageBoundaries",
        "label": "Message Boundaries",
        "context": "what the message should avoid saying or doing",
        "required": False,
        "array": True,
        "fallback": {
            "question": "What would make the message feel wrong or too much?",
            "choices": [
                {"id": "a", "label": "Do not summarize the recipient's whole career", "normalizedValue": "Do not summarize the recipient's whole career"},
                {"id": "b", "label": "Do not ask for a call unless I explicitly asked for that", "normalizedValue": "Do not ask for a call unless explicitly requested"},
                {"id": "c", "label": "Do not sound like a pitch or sales message", "normalizedValue": "Do not sound like a pitch or sales message"},
                {"id": "d", "label": "Do not overstate familiarity with their work", "normalizedValue": "Do not overstate familiarity with the recipient's work"},
            ],
            "customPlaceholder": "List anything to avoid...",
        },
    },
    {
        "key": "channelFormat",
        "label": "Channel Format",
        "context": "the outreach channel and formatting constraints, such as LinkedIn connection note, email, DM, subject line, or character limit",
        "required": True,
        "array": False,
        "fallback": {
            "question": "What channel or format should these messages use?",
            "choices": [
                {"id": "a", "label": "LinkedIn connection note under 300 characters", "normalizedValue": "LinkedIn connection note under 300 characters"},
                {"id": "b", "label": "LinkedIn DM after connecting", "normalizedValue": "LinkedIn DM after connecting"},
                {"id": "c", "label": "Short email with a subject line", "normalizedValue": "Short email with a subject line"},
                {"id": "d", "label": "Flexible short note for whichever channel is available", "normalizedValue": "Flexible short note for whichever channel is available"},
            ],
            "customPlaceholder": "Describe the channel, format, and any length constraints...",
        },
    },
]


MODE_CONFIGS = {
    PROJECT_TYPE_STARTUP: {
        "label": "Startup discovery",
        "description": "Customer discovery and founder learning.",
        "kickoff": "What are you building? Tell me about your idea - what it does, who it's for, and what problem it solves.",
        "slots": STARTUP_SLOTS,
    },
    PROJECT_TYPE_NETWORKING: {
        "label": "Networking outreach",
        "description": "Compose targeted outreach based on sender goals, recipient background, and message style.",
        "kickoff": "What is this outreach for, and what is your goal?",
        "slots": NETWORKING_SLOTS,
    },
}


def normalize_project_type(value: str | None) -> str:
    project_type = (value or PROJECT_TYPE_STARTUP).strip().lower()
    return project_type if project_type in PROJECT_TYPES else PROJECT_TYPE_STARTUP


def is_valid_project_type(value: str | None) -> bool:
    return (value or PROJECT_TYPE_STARTUP).strip().lower() in PROJECT_TYPES


def project_actor(project_type: str) -> str:
    return "user" if normalize_project_type(project_type) == PROJECT_TYPE_NETWORKING else "founder"


def project_kind_label(project_type: str) -> str:
    return "networking outreach project" if normalize_project_type(project_type) == PROJECT_TYPE_NETWORKING else "startup idea"


def get_kickoff_question(project_type: str) -> str:
    return MODE_CONFIGS[normalize_project_type(project_type)]["kickoff"]


def get_slot_context(project_type: str) -> dict[str, str]:
    return {slot["key"]: slot["context"] for slot in get_mode_slots(project_type)}


def get_mode_config(project_type: str) -> dict:
    return MODE_CONFIGS[normalize_project_type(project_type)]


def get_mode_slots(project_type: str) -> list[dict]:
    return list(get_mode_config(project_type)["slots"])


def get_slot_keys(project_type: str) -> list[str]:
    return [slot["key"] for slot in get_mode_slots(project_type)]


def get_required_slots(project_type: str) -> list[str]:
    return [slot["key"] for slot in get_mode_slots(project_type) if slot.get("required")]


def get_array_slots(project_type: str) -> set[str]:
    return {slot["key"] for slot in get_mode_slots(project_type) if slot.get("array")}


def get_slot(project_type: str, slot_key: str) -> dict | None:
    return next((slot for slot in get_mode_slots(project_type) if slot["key"] == slot_key), None)


def get_fallback_turn(project_type: str, slot_key: str) -> dict:
    slot = get_slot(project_type, slot_key)
    if not slot:
        raise KeyError(slot_key)
    fallback = slot["fallback"]
    return {
        "question": fallback["question"],
        "choices": [{**choice, "slotKey": slot_key} for choice in fallback["choices"]],
        "customPlaceholder": fallback["customPlaceholder"],
    }

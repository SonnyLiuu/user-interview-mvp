# User Interview API (FastAPI)

Python backend for onboarding, call prep, outreach, and live-call sessions.

## Layout

```text
app/
├── main.py          # app factory, router registration, exception handlers
├── core/            # cross-cutting infrastructure
│   ├── auth.py      #   token signing/verification, FastAPI auth dependencies
│   ├── config.py    #   pydantic-settings Settings (.env.local)
│   ├── db.py        #   asyncpg pool lifecycle
│   ├── errors.py    #   domain exceptions + error-code constants
│   └── utils.py     #   small shared helpers (slugify)
├── domain/          # pure domain logic — no I/O, no FastAPI
│   ├── project_modes.py            # project/outreach type configs and slot definitions
│   ├── onboarding_engine.py        # onboarding state machine (pure functions)
│   ├── onboarding_mode_hints.py    # networking-mode heuristics
│   ├── outreach_onboarding_modes.py# outreach onboarding chat modes
│   └── project_context.py          # foundation → project-context mapping
├── ai/              # AI stack: services call prompts, prompts call clients
│   ├── prompts.py   #   task-specific prompt builders (foundation, call brief, outreach…)
│   └── clients/     #   provider dispatch (openai / anthropic / gemini)
├── routers/         # thin HTTP/WS/SSE glue — no SQL, no business logic
├── schemas/         # pydantic request/response models
├── services/        # use-cases; orchestrate repositories, domain, and ai
│   ├── live_sessions.py            # live-call session hub (state, ingestion, SSE)
│   ├── realtime_bridge.py          # OpenAI/Azure realtime checklist bridge
│   └── source_transcription_bridge.py # mic/loopback audio → text
└── repositories/    # SQL access per table/domain
```

Dependency direction: `routers → services → repositories/domain/ai → core`.

## Run

```sh
cd services/api
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m app.main
```

Settings load from the repo-root `.env.local` and `services/api/.env.local`
(see `.env.example`).

## Tests

```sh
.venv/bin/python -m unittest discover -s tests
```

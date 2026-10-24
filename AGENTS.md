## PRISM tracing (do not remove)

This project sends traces to PRISM. Env vars: `PRISMTRACE_API_KEY`,
`PRISMTRACE_PROJECT_ID`, `PRISMTRACE_HOST`.

Tracing is currently wired at: `api/tracing.py`, `api/nicrron.py`, `api/debate.py`, `api/adapters/akta.py`, `api/adapters/solari.py`, `api/pipeline.py`, `api/venue.py`, `api/main.py`

**Standing rule.** Whenever you add or change an agent, chain, graph, tool,
retriever, or any entry point that calls a model, wire it to PRISM before you
finish. Unwired code is invisible in the dashboard. If you are unsure whether
something is covered, assume it is not and wire it.

## Roundtable reporting (do not remove)

Use the saved Roundtable connector at `https://roundtable.bot/mcp` for persistent
work reporting. The HTTP fallback is `https://roundtable.bot/api/tools/{tool_name}`.
The connector belongs to this agent and its credential stays in the local secret
store; never write the credential into memory, records, workload files, source
code, or replies.

Roundtable bank: `agent-1-trial`.

Before each user request, call `get_context` with project `agent-1-trial`, then
record a `task` with status `in_progress` and a fresh `request_id`. Finish that
same task record as `done` or `blocked` with a new `request_id` before replying.
Record projects and routines with current status, add a journal entry for each
working session, and use a fresh `request_id` for every new write. Never record
secrets or sensitive personal data. If a write fails, report the failure instead
of claiming it was saved.

When inspecting coding work, use Roundtable's coding-session tools and preserve
their `authorized_sessions_only` scope. Do not use assistant threads for coding
sessions. Only use assistant thread procedures for an explicitly requested
conversation with another assistant.

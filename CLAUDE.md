# Synter Loop — local build context

Read [`AGENTS.md`](AGENTS.md) before changing code. It is the project contract; this file only points coding tools to it.

## Local development
- Work on the local `feat/synter-loop-local-build` branch. Do not commit, push, open a PR, deploy Workers, or install/restart the production Hermes gateway from this session.
- Use pinned Hermes v0.23.0 in `.hermes-src`, `.venv-hermes`, and isolated `HERMES_HOME=$PWD/.hermes-dev`.
- Tests must be offline and use synthetic fixtures. Never read or print `.env`; secrets use Hermes `agent.secret_scope`.
- Ad spend, GTM publish, campaign launch, and non-dry-run write paths remain disabled unless the user explicitly approves the exact action.
- Follow measurement-first: event schema → captured fixture → replayable test → bounded change → comparison → human release decision.

See [`PLANNING/README.md`](PLANNING/README.md) for phase gates and status.

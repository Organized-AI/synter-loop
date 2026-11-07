# Phase 1 - Scaffold + event schema

## Goal
A loadable, validated, empty-but-honest plugin whose every emitted event validates against the schema.

## Deliverables
- `plugin.yaml`: `synter-loop`, version "0.1.0", `requires_hermes: ">=0.23.0"`, `requires_env` SYNTER_API_KEY (secret), the full `config_schema` from PROMPT.md, `provides_*` equal to what `register(ctx)` registers (a test enforces it)
- `schema/events.v1.json` extended with per-event payloads for agent_session_start, agent_turn_start, agent_model_call, agent_tool_call, agent_subagent, agent_gate_decision, agent_approval, agent_turn_complete, agent_outcome; local JSONL capture into plugin storage from this phase on
- Dev Hermes: `.hermes-src` at v0.23.0, `.venv-hermes`, `HERMES_HOME=$PWD/.hermes-dev`
- CI: install Hermes v0.23.0, `hermes plugins validate . --install-deps`, pytest, `uv --exclude-newer` quarantine; zero runtime deps preferred, any dep gets a floor and an upper bound

## Gate checks
- `hermes plugins validate . --install-deps` and `hermes plugins doctor . --ci` pass on the dev install
- pytest: manifest equals registration; every emitted event validates; capture off writes nothing
- The capture Worker accepts the Python-emitted fixtures unchanged

## Rules that bite
Public plugin API only (rule 9); secrets only via `agent.secret_scope` (rule 11); no `.pyc` or binaries (rule 17).

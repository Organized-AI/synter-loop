---
name: verify-build
description: Validate that the repo installs, typechecks, tests and builds from a clean state. Use before a phase gate, after dependency changes, and after build-config changes.
---

# Build verification

## Steps
1. Clean install: `rm -rf node_modules && npm ci` (Workers). From Phase 1 also: the pinned Hermes dev install and `uv sync --locked`.
2. Typecheck: `npm run typecheck`.
3. Tests: `npm test`; from Phase 1 also `pytest -q`.
4. Bundle: `npm run build` (`wrangler deploy --dry-run` for both Workers).
5. From Phase 1: `HERMES_HOME="$PWD/.hermes-dev" .venv-hermes/bin/hermes plugins validate . --install-deps`.

## Output
```
BUILD: VERIFIED / BROKEN
- install: OK / FAIL
- typecheck: OK / FAIL
- tests: <passed>/<total>
- bundle: OK / FAIL
- hermes validate: OK / FAIL / n/a
```

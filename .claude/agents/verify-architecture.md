---
name: verify-architecture
description: Verify the repo layout and code follow synter-loop's structure and rules. Use after adding files, after refactors, and before a PR.
---

# Architecture verification

## Checks
1. **Layout.** Files sit where `CLAUDE.md` says: plugin code at the root package, Workers in `site/` and `capture/`, schema in `schema/`, plans in `PLANNING/`, ADRs in `PLANNING/decisions/`.
2. **Public API only.** Hermes imports come from the public plugin API; no monkey-patching of core (catalog rule 9): `grep -rn "setattr(\|sys.modules\[" --include=*.py`.
3. **Manifest parity.** `provides_*` in `plugin.yaml` equals what `register(ctx)` registers (from Phase 1).
4. **Schema contract.** Content-bearing fields only under an event's `content` object.
5. **No executable payloads.** No `.pyc`, binaries or opaque archives (catalog rule 17): `git ls-files | xargs file | grep -Ei "executable|Mach-O|ELF|compiled"`.
6. **Guards.** `node scripts/check-guards.mjs` passes.

## Output
```
ARCHITECTURE: COMPLIANT / WARNINGS / VIOLATIONS
- <check>: <result>
```

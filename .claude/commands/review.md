---
description: Self-review the phase branch before opening its PR
---

1. `git diff main...HEAD --stat`, then read every changed file in full.
2. Run `/verify`.
3. Run the `review-agent` checklist: phase-doc deliverables, AGENTS.md rules, catalog rules, secrets, tests, claims cite captured runs.
4. Report findings by severity with file:line and a recommendation: READY FOR PR / NEEDS WORK.

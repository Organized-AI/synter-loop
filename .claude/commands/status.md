---
description: Project status - branch, current phase, last gate, open PRs
---

Report where synter-loop stands. Run:

```bash
git status --short --branch
git log --oneline -5
gh pr list --repo Organized-AI/synter-loop --state open
ls PLANNING/PHASE-*-COMPLETE.md 2>/dev/null
```

Then read `AGENT-HANDOFF/HANDOFF.md` and report: branch, current phase, last completed gate, open PRs and their CI state, and what the next step is. Do not start the next phase; that waits for Jordan.

---
description: Close the current phase gate - checks, completion doc, commit, push, PR, report, stop
argument-hint: "<phase-number>"
---

Close the gate for Phase $ARGUMENTS:

1. Run the gate checks listed in `PLANNING/phase-NN-*.md` and `just verify`. Record the output.
2. Write `PLANNING/PHASE-$ARGUMENTS-COMPLETE.md`: what passed, what didn't, evidence (URLs, run_ids, CI links), follow-ups.
3. Update `AGENT-HANDOFF/HANDOFF.md`.
4. Commit on the phase branch (`/commit`), push, and open a PR into `main` using `.github/PULL_REQUEST_TEMPLATE.md`.
5. Report what passed and what didn't. Stop and wait for Jordan.

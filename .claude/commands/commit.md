---
description: Verified commit on the current phase branch
---

1. Run `/verify`. Stop if anything fails.
2. Show `git status --short` and `git diff --stat`. Make sure no `.env`, key or token is staged.
3. Write a conventional commit message: `<type>(<scope>): <description>` (feat, fix, docs, refactor, test, chore, ci).
4. Commit as the configured author (Jordan Hill <jordan@bluehighlightedtext.com>). No Co-Authored-By, Claude-Session, "Generated with" or any other AI attribution line.
5. Never commit to `main` directly; never push with `--force`.

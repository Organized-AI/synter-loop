# synter-loop recipes (Organized Codebase). `just` lists them.
default:
    @just --list

# Every check a commit needs: guards, typecheck, tests, bundle.
verify:
    npm run verify

# Repo guards only (AGENTS.md rules 1, 4, 10; catalog rule 17).
guards:
    npm run guards

# Branch, phase and open PRs.
status:
    git status --short --branch
    git log --oneline -5
    gh pr list --repo Organized-AI/synter-loop --state open
    ls PLANNING/PHASE-*-COMPLETE.md 2>/dev/null || true

# Live smoke test against the deployed Workers (loads .env only for this command).
smoke:
    set -a; . ./.env; set +a; SITE_URL=https://synter-loop.jordan-691.workers.dev node scripts/smoke-capture.mjs

# Deploy both Workers (capture first: the site binds to it).
deploy:
    npm run d1:migrate
    npm run deploy:capture
    npm run deploy:site

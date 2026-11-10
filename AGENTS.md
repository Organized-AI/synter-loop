# synter-loop

A native Hermes Agent plugin for Nous Research's Hermes Agent Plugin Hackathon (entries close Wednesday, November 11, 2026, 5PM EST). It runs a closed loop on ad spend through Synter's hosted MCP:

- **Spend Guard** decides: a `pre_tool_call` gate on every Synter write (caps, dry run, tracking gate, Jev score, Hermes approval).
- **Tag Witness** verifies tracking: a browser backend plus a CDP listener that records dataLayer pushes and fired tags.
- **Truth Layer** verifies numbers: reconciled conversions before a turn, number checks after it.
- **Agent ROAS** grades each approved change; grades go to jev-gateway so Jev learns.
- **Agent runtime capture** records every prompt, tool call and token; **Agent P&L** measures the agent like an ad account.

The full build spec is `PROMPT.md`. Read it before any work.

## Machines

- This repository is checked out on the project workstation. Local paths are machine-specific; do not hard-code them in published docs.
- Live Hermes runs on a separate production host. Its address is configured locally and must never be committed. Never restart, update, reconfigure or install there unless the user approves that exact action in the chat.
- jev-gateway source: a separate local checkout. Read it when required; don't edit it from this repo.
- Organized Codebase template: a separate local checkout. Read its README and BASIC_PROCESS.md before running any script from it.


## Rules

1. Commits and PRs use the maintainer identity configured locally on the contributing machine. Never add Co-Authored-By, Claude-Session, "Generated with" or any AI attribution lines.
2. GitOps like Organized-AI/podcast-agent: `main` protected, one branch per phase, a PR at each phase gate, CI green before merge. Remote: `github.com/Organized-AI/synter-loop`.
3. Never make a live write: no ad-account change, budget change, GTM publish or campaign launch. Dry runs and recorded fixtures only, unless the project owner approves that exact action in the chat.
4. Secrets come from the environment or Hermes's `agent.secret_scope`. Never commit `.env`, never print a key, never put one in a URL.
5. Hermes code imports only from the public plugin API list. Follow catalog rules 3, 5, 6, 9, 10, 11, 12, 13, 14 and 17 (see PROMPT.md).
6. Measurement first: `schema/events.v1.json` exists and is tested before features ship. Every claim in docs or output cites a captured run.
7. hermes-superagent (AirKyzzZ/hermes-superagent) is another team's entry. Test against it as an external install; never vendor, copy or fork it.
8. Plans and docs give phase order and gates, never time estimates.
9. Stop at every phase gate: run the checks, commit, open the PR, report what passed, and wait for the project owner.
10. Pi's Synter connection (`.pi/mcp.json`) is read-only on purpose: hidden server, read tools allow-listed. Never widen it. Writes go only through the plugin's Spend Guard, in a Hermes session the project owner is watching.

# Phase 3 - Spend Guard (pre_tool_call)

## Goal
Every Synter write passes a gate that fails closed and never auto-approves.

## Deliverables
- Classifier from Synter tool metadata (effect, scope, externalMutation, credits, destructive), cached in plugin storage; also matches Synter tools reached through a user-configured Synter MCP server
- read -> pass; non-spend write -> approval; spend-raising write -> caps -> dry-run preview -> cached tracking health -> approval directive (platform, campaign, before -> after, daily delta)
- Unattended (`cron.execution_identity`) or `propose_only` -> block and record a proposal with an id; `/ads freeze` -> block every write this session
- Fail closed on any Synter error or timeout, well inside the 30-second hook limit; never change `hook_callback_timeout`, never modify arguments

## Gate checks
Test matrix rows: read passes; under cap -> approval; over cap -> block; broken tracking -> block with fix; cron -> block; freeze -> block; Synter timeout -> block; propose_only -> proposal.

## Rules that bite
Rule 12 (approvals respected), rule 3 (no live writes in tests).

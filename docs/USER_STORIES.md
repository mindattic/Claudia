---
codex: 1
project: Claudia
code: CLA
layer: stories
status: living
updated: 2026-10-03
---
<!-- workflow-db: this repo's stories and tickets live in the MindAttic.Workflow database -->

# Claudia — User Stories

This repo's stories and tickets (CLA-US-…, CLA-T…) live in the MindAttic.Workflow database
(`MindAttic.Workflow/data/workflow.db`), not in this file. Use the `workflow` CLI:

- Read: `workflow story list --repo Claudia`, `workflow ticket list --repo Claudia`, `workflow ticket show <ID>`
- Change: `workflow ticket new` / `close`, `workflow story status <ID> done|partial|planned`, `workflow ticket link <A> requires <B>`
- This file as it was, rebuilt from the database: `workflow db export --repo Claudia`

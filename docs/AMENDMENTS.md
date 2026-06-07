---
codex: 1
project: Claudia
code: CLA
layer: amendments
status: living
updated: 2026-06-07
---

# Claudia — Amendments (append-only; amendment wins over the bible)

> Append-only change log. Never rewrite an amendment — supersede it with a new one. Beyond ~25,
> fold into `docs/BIBLE.md` and start a new epoch (note the git tag).

## CLA-A1 — Adopt the Codex documentation standard (supersedes —)

**What changed.** Installed the MindAttic Codex canon for this repo: added `docs/BIBLE.md` (L0),
`docs/USER_STORIES.md` (L2), this `docs/AMENDMENTS.md` (L1), `docs/rfc/0001-config-axis-contract.md`,
the L5 data registry `docs/data/parts.index.json` + `docs/data/_schema/part.schema.json`,
`tools/codex.ps1` (doctor + digest), and the `.claude/hooks/inject-digest.ps1` SessionStart hook
wired into `.claude/settings.json`.

**Why.** Give Claudia a single machine-checkable source of truth and a SessionStart digest so
agents inherit the project's laws and state.

**Migration.** None destructive. No prior canon docs existed (`README.md` and `config/*.json`
remain in place and unmodified). `config/parts.json` is the **canonical** L5 store and was NOT
moved — MindAttic.Deploy reads it at that path; `docs/data/parts.index.json` mirrors its stable
ids (`part.<slug>`) and points the schema at it. The org-wide
[`MindAttic.HouseRules.md`](../../MindAttic.HouseRules.md) is inherited by reference from
BIBLE [§5](BIBLE.md#CLA-§5), not copied.

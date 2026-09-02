# docs/seasoned

This directory holds instructions for AI agents (Claude Code and similar) working on the Seasoned parallel work, which lives on the `seasoned` branch.

## Why it exists

The root `AGENTS.md`, `CLAUDE.md`, and `README.md` belong to the team working on `main`, and we do not want to edit them. Claude Code reads the root `CLAUDE.md` (which imports `AGENTS.md`) automatically, so a separate place was needed for instructions that only apply to this branch. `docs/seasoned/AGENTS.md` plays that role: same purpose as the root `AGENTS.md`, scoped to Seasoned.

Claude Code does not discover this file on its own. Each person working on Seasoned points their own user-level `CLAUDE.md` at it, so nothing in the shared root files has to change.

## Files

- `AGENTS.md`: the instructions themselves (files to leave alone, scope, conventions). Agents read this at the start of every session.
- `README.md`: this file. Explains the setup for humans.

## Setup for your machine

The Seasoned work applies exclusively to this project, so these instructions should only be loaded when you open this project. Use a config dir dedicated to it (`CLAUDE_CONFIG_DIR`, or a per-project config in a tool like ccsw) and add the following to the `CLAUDE.md` inside that dir. If you must use your global `~/.claude/CLAUDE.md` instead, change the read instruction to "read `docs/seasoned/AGENTS.md` in the project root (if present)" so it stays inert in other projects.

```markdown
## When you are working on Bettrbyus

Never edit AGENTS.md, CLAUDE.md, or README.md in the project root; those belong to the team working on `main`.

At the start of every session, before doing any work, read `docs/seasoned/AGENTS.md` and follow it. It plays the same role as the root AGENTS.md for the `seasoned` branch.
```

After editing, restart the session or run `/memory` so Claude Code reloads the file.

## Conventions for files in this directory

- Do not hard-wrap Markdown. Write one paragraph per line.
- Keep instructions in `AGENTS.md`; keep explanations for humans here.

# docs/seasoned

This directory holds instructions for AI agents (Claude Code and similar) working on the Seasoned parallel work, which lives on the `seasoned` branch.

## Why it exists

The root `AGENTS.md`, `CLAUDE.md`, and `README.md` belong to the team working on `main`, and we do not want to edit them. Claude Code reads the root `CLAUDE.md` (which imports `AGENTS.md`) automatically, so a separate place was needed for instructions that only apply to this branch. `docs/seasoned/AGENTS.md` plays that role: same purpose as the root `AGENTS.md`, scoped to Seasoned.

Claude Code does not discover this file on its own. Each person working on Seasoned points their own user-level `CLAUDE.md` at it, so nothing in the shared root files has to change. Step 11 of `INSTALL.md` shows how.

## Files

- `AGENTS.md`: the instructions themselves (files to leave alone, scope, conventions). Agents read this at the start of every session.
- `README.md`: this file. Explains the setup for humans.
- `INSTALL.md`: how to install the project and its dependencies on a new machine, from scratch, including the Claude Code setup for Seasoned (step 11).
- `DAILY.md`: the day-to-day routine: start a lane and the app, the default admin login, Studio on demand, shutting down.
- `LANES.md`: how the lane workflow works (Claude Code worktrees, each with its own Supabase stack and port). The tool itself is `scripts/lane.sh`; the rules agents follow are in `AGENTS.md`.

## Conventions for files in this directory

- Do not hard-wrap Markdown. Write one paragraph per line.
- Keep instructions in `AGENTS.md`; keep explanations for humans here.

# Seasoned agent instructions (`seasoned` branch)

## Do not touch

- `AGENTS.md`, `CLAUDE.md`, `README.md` (owned by the team on `main`)

## Conventions

- Do not hard-wrap Markdown. Write one paragraph per line.

## Workflow: lanes

Every task runs in its own lane: a Claude Code worktree with its own branch, local Supabase stack, Next port, and `.env.local`, so many instances of the project run in parallel without sharing state. Claude Code creates and removes the worktrees; `scripts/lane.sh` adds the stack, the port and the env file. `docs/seasoned/LANES.md` explains how it fits together.

- The main checkout stays on `seasoned` at all times, kept current with `git pull`. Never commit, build, run servers, or test there. New worktrees are cut from the main checkout's HEAD (`worktree.baseRef` is `head`), so an outdated main checkout means an outdated lane.
- Start every task by creating a worktree with the EnterWorktree tool, whether or not the request mentions a worktree. Name it yourself from the request: two to four lowercase words joined by dashes that say what the task is, such as `fix-login-redirect` for "fix the redirect after login" or `wip-counts-export` for "let production export the WIP counts". Never accept a generated name, and use the user's name when they give one. The worktree lands in `.claude/worktrees/<name>` on branch `worktree-<name>`, with `.env.local` copied in by `.worktreeinclude`. If the session already started inside a worktree (`claude --worktree`), skip this and go straight to `up`.
- Then run `scripts/lane.sh up` inside the worktree. It allocates the lane's port, writes `.env.local`, points the lane's `supabase/config.toml` at its own ports, installs dependencies, starts the lane's own Supabase stack with every migration applied (and `supabase/seed.sql` if the main checkout has one), creates the local admin user (`admin@local.test` / `bettrbyus-local`), and starts the dev server in the background on the lane's port, so the URL it prints is live. Re-running it is safe; it leaves a running server alone. `up --no-dev` skips the server for build-only work.
- `up` needs Docker Desktop running. If it is not, ask the user to start it and wait; never install or start Docker yourself (see `INSTALL.md`, step 8).
- As soon as `up` has finished, tell the user how to reach the lane before doing anything else: the app URL on the lane's port (`up` prints it, `http://localhost:300<i>`), and the login, `admin@local.test` / `bettrbyus-local`. Repeat both in the final message of the task.
- When the task changes something a person can see, give the URL of the exact page where the change shows, on the lane's port, and name what to look for there, for example `http://localhost:3001/production/schedule`, the new column in the line table. Give one URL per affected page. Leave the dev server that `up` started running so the link works when the user clicks it; its output is in the log file `up` names, next to the worktree, and that is where compile errors show up.
- Do all work inside the worktree with the project's usual commands. Anything that must listen on the lane's port goes through `scripts/lane.sh run`, for example `run npm run build` then `run npm start`, because Next ignores `PORT` in `.env.local`. To restart the dev server, `scripts/lane.sh down` then `up`. Supabase commands (`supabase status`, `supabase db reset`, `supabase migration new <name>`) run from inside the worktree and address the lane's own stack.
- Lanes start without Supabase Studio. If you need to inspect the database by hand, `scripts/lane.sh studio` turns it on (the stack restarts, data kept) and prints its URL; prefer `psql` on the lane's database URL or `supabase migration list` for quick checks. `docs/seasoned/DAILY.md` has the day-to-day commands and the admin login.
- When the work is done: commit, push, open a pull request against `seasoned` with `gh pr create --base seasoned`, run `scripts/lane.sh down`, and leave the worktree with ExitWorktree using `keep`. Never use `remove` while the pull request is open: it deletes the branch that backs it. Merging is always the human's decision. A green CI run never implies permission to merge.
- Kill lane processes only with `scripts/lane.sh down` (this lane) or `scripts/lane.sh sweep` (every lane). Both find exact PIDs by each lane's port and stop the Supabase stacks while keeping their data. Never use `pkill -f` or any other pattern kill. Run sweep at the end of every session.
- After the PR is merged or abandoned: `scripts/lane.sh teardown <name>` from the main checkout. It deletes the lane's Supabase containers and data and removes the worktree if Claude Code has not already, but never deletes the branch; that is the human's or GitHub's job.
- `scripts/lane.sh --help` has the full details; `scripts/lane.sh list` shows the live lanes and any Supabase data left behind by removed worktrees.

# Seasoned agent instructions (`seasoned` branch)

## Do not touch

- `AGENTS.md`, `CLAUDE.md`, `README.md` (owned by the team on `main`)

## Conventions

- Do not hard-wrap Markdown. Write one paragraph per line.

## Workflow

Every session starts in the main checkout, on branch `seasoned`, kept current with `git pull`. A request is one of two kinds, and the human decides where it runs. `docs/seasoned/LANES.md` explains lanes; `docs/seasoned/DAILY.md` has the day-to-day commands and the admin login.

### 1. The human asks for a worktree with a brief

- Create the worktree with the EnterWorktree tool. Name it from the brief: two to four lowercase words joined by dashes that say what the task is, such as `fix-login-redirect` for "fix the redirect after login". Never accept a generated name, and use the human's name when they give one. If the session already started inside a worktree (`claude --worktree`), skip this step.
- Then run `scripts/lane.sh up` inside the worktree. It renames the branch Claude Code created, `worktree-<name>`, to plain `<name>`, and turns the worktree into a lane: its own port, `.env.local`, a generated Supabase config outside the worktree, dependencies, Supabase stack with every migration applied, the local admin user (`admin@local.test` / `bettrbyus-local`), and the dev server in the background on the lane's port. Re-running it is safe. `up --no-dev` skips the server for build-only work.
- `up` needs Docker Desktop running. If it is not, ask the human to start it and wait; never install or start Docker yourself (see `INSTALL.md`, step 8).
- As soon as `up` has finished, tell the human the app URL on the lane's port (`up` prints it, `http://localhost:300<i>`) and the login, before doing anything else. Repeat both in the final message of every round.
- Do all work inside the worktree with the project's usual commands. Anything that must listen on the lane's port goes through `scripts/lane.sh run`, for example `run npm run build` then `run npm start`, because Next ignores `PORT` in `.env.local`. To restart the dev server, `scripts/lane.sh down` then `up`. Supabase CLI commands go through `scripts/lane.sh run supabase <args>`, which addresses the lane's own stack; a bare `supabase` inside a worktree addresses the main checkout's stack instead. When the task needs a change to `supabase/config.toml`, edit and commit it like any other file; the next `up` restarts the lane's stack with it. `scripts/lane.sh studio` turns Studio on when you need to look at the database by hand; prefer `psql` on the lane's database URL or `run supabase migration list` for quick checks.

### 2. The human asks for a change to the agent in the main checkout

This is a change to the files that drive the agent: `docs/seasoned/*`, `scripts/lane.sh`, `.claude/`. Ask the human whether they want a worktree for it.

- Yes: create the worktree and continue with section 1.
- No: work in the main checkout. Do not commit or run anything there until asked. When the human asks for the server, bring it up in the main checkout: `supabase start` (the default ports, which is what the main checkout's `.env.local` points at), then `npm run dev` in the background with its output in a log file, so the app answers on `http://localhost:3000`. Create the local admin user the same way `scripts/lane.sh` does if it does not exist yet. Tell the human the URL and the login.

### 3. Rounds of work

- A task takes several rounds. After each round, commit, give the URL of the exact page where the change shows and name what to look for there, for example `http://localhost:3001/production/schedule`, the new column in the line table, one URL per affected page. Then stop and wait. Leave the dev server running so the link works; its output is in the log file `up` names, next to the worktree, and that is where compile errors show up.
- Do not push and do not open a pull request on your own, however finished the work looks.
- Kill processes only with `scripts/lane.sh down` (this lane) or `scripts/lane.sh sweep` (every lane). Both find exact PIDs by each lane's port and stop the Supabase stacks while keeping their data. Never use `pkill -f` or any other pattern kill.

### 4. The human stops interacting

When the human says they are done for now, ask, if they have not said so already, whether the result is what they expected.

- The result is achieved and the human asks for the pull request: push and open it against `seasoned` with `gh pr create --base seasoned`, then report the link. From a lane, the branch is `<name>`. From the main checkout, create a branch from `seasoned` for the commits, push it, open the pull request, and switch the main checkout back to `seasoned`. Merging is always the human's decision. A green CI run never implies permission to merge.
- The result is not achieved and the human stops anyway: do not open a pull request. The work stays committed on the lane's branch.

Then, when the work is in a lane, ask whether the human will keep working on it in the future.

- Yes: run `scripts/lane.sh down` inside the worktree, which stops the dev server and the Supabase stack but keeps the data and the branch, then go back to the main checkout with ExitWorktree using `keep`. The next `scripts/lane.sh up` in that worktree brings the lane back as it was.
- No: go back to the main checkout with ExitWorktree using `keep`, then run `scripts/lane.sh teardown <name>` from there. It kills the lane's processes, deletes its Supabase containers and data, and removes the worktree, but never deletes the branch, so an open pull request keeps its commits. Never use ExitWorktree `remove` on a lane with commits of its own: it deletes the branch that backs the pull request.

When the work is in the main checkout there is nothing to clean up; the session ends there.

`scripts/lane.sh --help` has the full details; `scripts/lane.sh list` shows the live lanes and any Supabase data left behind by removed worktrees.

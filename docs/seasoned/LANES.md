# Lanes: Claude Code worktrees with their own Supabase stack

This document explains the lane workflow for humans. The rules agents follow are in `AGENTS.md` (Workflow section), the day-to-day commands are in `DAILY.md`, and the tool is `scripts/lane.sh`. The workflow is an adaptation of the "tiny lane workflow" template to this project: worktrees are created and removed by Claude Code's native worktree support rather than by the script, and because Bettrbyus talks to Supabase (PostgREST, Auth) rather than to a plain Postgres database, each lane gets a whole local Supabase stack.

## What a lane is

A lane is one unit of work: a Claude Code worktree at `.claude/worktrees/<name>` on branch `worktree-<name>`, plus what `scripts/lane.sh up` adds to it: its own `node_modules`, its own local Supabase stack running in Docker under project id `Bettrbyus-lane-<name>`, its own Next port, and its own `.env.local`. Nothing is shared between lanes or with the main checkout, so several agents (or a person and an agent) can build, run and test at the same time without stepping on each other.

The result of a lane ships as a pull request against `seasoned`, and only a human merges it.

## The Claude Code features in use

- **EnterWorktree** (agents) and `claude --worktree <name>` (people) create the worktree at `.claude/worktrees/<name>` on branch `worktree-<name>` and switch the session into it. The docs are at https://code.claude.com/docs/en/worktrees.
- **`worktree.baseRef`** decides where the branch starts. The default, `fresh`, is `origin/main`, which is wrong for this branch; the setting has no way to name another ref, so each person sets it to `head` in their own Claude Code `settings.json` (snippet in `README.md`). Lanes are then cut from the main checkout's HEAD, which the workflow keeps on an up-to-date `seasoned`. `up` fetches and checks that the worktree contains the latest `origin/seasoned`: a lane without commits of its own is reset onto it (uncommitted changes are kept), a lane with its own commits is rebased onto it, and a rebase that conflicts is aborted with a warning so the worktree stays as it was.
- **`.worktreeinclude`** in the project root lists gitignored files Claude Code copies into every new worktree. It holds `.env.local` and `supabase/seed.sql`, so a fresh worktree already has its environment and, if the main checkout has one, the company data dump. `up` also copies both itself in case the worktree was made another way.
- **ExitWorktree** leaves the worktree. `keep` preserves the directory and branch, which is what a lane with an open pull request needs. `remove` deletes both directory and branch and refuses if there are uncommitted changes; it is for work that was abandoned or already merged. On session exit Claude Code asks the same question.
- **`.claude/worktrees/`** is in `.gitignore`, as the docs recommend, so worktrees never show up as untracked files.
- Subagents launched with `isolation: "worktree"` get a worktree of their own under the same directory. Such a worktree only becomes a lane if `scripts/lane.sh up` is run inside it, so plan on that if a subagent must run the app.

What the script does not do any more: create or remove worktrees. It works on the worktree it is run from (`up`, `run`, `studio`, `down`), or by name from anywhere (`teardown`, `list`, `sweep`).

## Commands

Inside a worktree:

```bash
scripts/lane.sh up [--no-dev]      # make this worktree a lane: port, env, own Supabase stack, admin user, dev server
scripts/lane.sh run <cmd...>       # run something else on the lane's port (npm run build, npm start)
scripts/lane.sh studio [on|off]    # turn Studio on or off for the lane (off by default)
scripts/lane.sh down               # stop the dev server and the stack, keep data (before leaving)
```

From anywhere:

```bash
scripts/lane.sh list               # every lane, ports, stack and Studio state, plus orphaned Supabase data
scripts/lane.sh sweep              # "down" for every lane; end of session
scripts/lane.sh teardown <name>    # delete the lane's Supabase data (and worktree, if still there); branch kept
scripts/lane.sh --help
```

Every lane has the same local admin login as the main checkout: `admin@local.test` / `bettrbyus-local`.

The script lives in the repository, so a worktree only contains it once it is committed on the branch the worktree was cut from. Until then, run it through the main checkout's path, for example `/path/to/Bettrbyus/scripts/lane.sh up`; the script finds the main checkout and the current worktree on its own either way.

## Ports

Lane `i` (1, 2, 3, ...) serves Next on `3000 + i` and gets the Supabase port block `54330 + 10 * i`, laid out exactly like the main checkout's `5432x` block so the last digit means the same thing everywhere.

| Service | Main checkout | Lane 1 | Lane 2 |
| --- | --- | --- | --- |
| Next dev server | 3000 | 3001 | 3002 |
| Supabase API (`NEXT_PUBLIC_SUPABASE_URL`) | 54321 | 54341 | 54351 |
| Postgres | 54322 | 54342 | 54352 |
| Studio (when turned on) | 54323 | 54343 | 54353 |
| Mailpit (caught emails) | 54324 | 54344 | 54354 |

The lane index is chosen by `up`: the first index whose Next port and whole Supabase block are neither held by another lane nor already listening on the machine. It is recorded as `PORT` in the lane's `.env.local`, and that file is the registry.

## What `up` writes into the worktree

- `.env.local` (copied by `.worktreeinclude`, or by `up` from the main checkout) gets a managed block appended that overrides `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_APP_URL` and `PORT` for the lane. Later lines win in Next's env loading, so nothing above the block needs editing. Re-running `up` rewrites only the block.
- `supabase/config.toml` is rewritten with the lane's project id and ports. Log analytics and the edge runtime are disabled because the app uses neither, and Studio (with its Postgres Meta service) is disabled because it only serves manual browsing and is the largest part of the stack; `scripts/lane.sh studio` turns Studio on for the lane and restarts its stack with the data kept, and the choice survives later runs of `up`. The file is then marked `skip-worktree` in git, so the rewrite never shows up in `git status` or lands in a commit. If a task genuinely has to change `config.toml`, run `git update-index --no-skip-worktree supabase/config.toml` in the worktree first, and keep the lane-specific hunks out of the commit.

Next ignores `PORT` in `.env` files because it binds the server before loading them, which is why `up` starts the dev server itself with `PORT` in the environment, and why anything else that must listen on the lane's port goes through `scripts/lane.sh run`.

## Behavior worth knowing

- `up` ends by starting `npm run dev` detached, with output in `.claude/worktrees/<name>.dev.log` (next to the worktree, so it never appears in `git status`), waits for the port to answer, and requests the login page once so the first click is fast. If the port already listens it leaves the server alone. `--no-dev` skips this.
- `up` is idempotent: re-running reuses the port and the Supabase data, restarts the stack if it was stopped, applies any migrations added since (`supabase migration up`), and never re-seeds. To reseed, run `supabase db reset` inside the worktree, then `up` again to recreate the admin user.
- The first `supabase start` in a lane replays every file in `supabase/migrations/` and then `supabase/seed.sql` if present, exactly as in `INSTALL.md` step 8. Docker images are shared between stacks.
- A lane stack is five containers (Postgres, Kong, PostgREST, Auth, Mailpit), about 200 MiB of memory right after start and a few hundred under use. Turning Studio on adds the Studio and Postgres Meta containers, roughly another 430 MiB. Keep only the lanes you are actively using started; `down` and `sweep` stop the rest without losing data.
- `down` and `sweep` kill only the exact PIDs found listening on lane ports and run `supabase stop` (data kept). They can never touch unrelated processes, and they do not touch the main checkout's stack on `5432x`.
- Removing a worktree (ExitWorktree `remove`, or the prompt at session exit) does not remove the lane's Supabase containers or data. `list` shows such leftovers as orphans, and `teardown <name>` removes them by project id even though the directory is gone.
- `teardown` refuses a worktree with uncommitted changes unless `--force`, runs `supabase stop --no-backup` for the lane's project id, removes the worktree if it still exists, and never deletes the branch. Delete merged branches by hand or let GitHub's "delete branch on merge" do it.
- `up` and `teardown` need Docker Desktop running. The script stops with a message if it is not, and agents are told to ask the user rather than start Docker themselves.

## Requirements

- Claude Code with `worktree.baseRef` set to `head` (see `README.md`).
- git with the `origin` remote; Node and npm (lanes run `npm ci`); the Supabase CLI and Docker Desktop, all as installed in `INSTALL.md`.
- `lsof`, present on macOS and most Linux distributions.
- `gh` for opening pull requests (any other way of opening a PR also works).

## Verification

Verified on 2026-09-03 on macOS with Supabase CLI 2.116.0 and Claude Code's EnterWorktree: creating worktree `lane-test` produced `.claude/worktrees/lane-test` on branch `worktree-lane-test` based on the main checkout's HEAD (not `origin/main`), with `.env.local` already copied in by `.worktreeinclude`. `scripts/lane.sh up` inside it allocated port 3001, started stack `Bettrbyus-lane-lane-test` on ports 54340 to 54349 with all 34 migrations applied and five containers (no Studio, no Postgres Meta), and created the admin user, leaving `git status` clean. `run npm run dev` served on 3001 and redirected `/` to `/login`, a password sign-in against the lane's Auth on 54341 succeeded, and `down` freed the port and stopped the stack with data kept. After the worktree was removed the way ExitWorktree does it, `list` reported the lane's Supabase data as an orphan and `teardown lane-test` removed it, leaving no containers or volumes behind.

# Daily routine

The day-to-day commands for working on Bettrbyus through lanes: open a lane, start the app, sign in, look at the database in Studio when you need to, and shut things down at the end. `LANES.md` explains how lanes work; `INSTALL.md` covers the one-time machine setup.

## 1. Before you start

- Docker Desktop must be running (`open -a Docker`, wait for the whale icon to settle). Agents must not start it themselves; they will ask you.
- The main checkout must be on `seasoned` and current: `git switch seasoned && git pull`. New lanes are cut from whatever the main checkout has checked out. If you forget, `scripts/lane.sh up` resets a new lane onto the latest `origin/seasoned` for you.

## 2. Open a lane

A lane is a Claude Code worktree. Create one with a short lowercase name for the task:

```bash
claude --worktree fix-login-redirect     # a person starting a session straight in a new lane
```

Inside a running session, just state the task, for example "fix the redirect after login". Claude creates the worktree itself with a name taken from the request, here `fix-login-redirect`, and you can also name it yourself ("create a worktree named login-redirect and ..."). Either way the worktree lands in `.claude/worktrees/<name>` on branch `worktree-<name>`, with `.env.local` already copied in, and Claude runs `scripts/lane.sh up` before it starts on the task. Once the lane is up it tells you the app URL and the login from section 4, and when the task changes the UI it ends with the URL of the page where the change can be seen, on the lane's port.

Then, inside the worktree:

```bash
scripts/lane.sh up      # port, own Supabase stack, dependencies, admin user, dev server; safe to re-run
scripts/lane.sh list    # what is running, on which ports (works from anywhere)
```

A new lane takes a few minutes the first time, most of it `npm ci` and the Supabase stack replaying every migration. Re-running `up` in an existing lane is quick; it restarts the stack if it was stopped, applies new migrations, keeps the data, and leaves a running dev server alone.

## 3. The application

`up` ends by starting the dev server in the background on the lane's port and waits until it answers, so the URL it prints is live: lane 1 is http://localhost:3001, lane 2 is http://localhost:3002, and so on. The server's output goes to a log file next to the worktree (`.claude/worktrees/<name>.dev.log`); `up` prints the path, and that is where compile errors appear.

```bash
scripts/lane.sh up --no-dev              # set the lane up without a dev server
scripts/lane.sh down && scripts/lane.sh up   # restart the dev server
scripts/lane.sh run npm run build        # anything else that must use the lane's port
scripts/lane.sh run npm start
```

Use `run` rather than a plain `npm run build` or `npm start` for those, because Next decides its port before it reads `.env.local`.

## 4. Sign in

Every lane has the same local admin account, created by `up`. These credentials only exist in the local stack; they are not connected to any hosted project.

| Field | Value |
| --- | --- |
| Email | `admin@local.test` |
| Password | `bettrbyus-local` |
| Role | admin (`user_type = admin` on the `profiles` row) |

Invite other users from Settings, Users inside the app. The invite email is not sent anywhere; it lands in the lane's Mailpit at `http://127.0.0.1:543x4`, where `x` is `4` for lane 1, `5` for lane 2, and so on (`up` prints the exact URL). Open the email there and follow the link to set the new user's password.

## 5. Studio (database browser)

Lanes start without Supabase Studio and its Postgres Meta service, because together they are the two largest containers in the stack and they only serve manual browsing. Turn them on for a lane when you want to look at tables, run SQL, or manage users by hand:

```bash
scripts/lane.sh studio         # on; restarts the lane's stack, data is kept
scripts/lane.sh studio off     # back off when you are done
```

The restart takes a few seconds, and the command prints the URL, `http://127.0.0.1:543x3` with the same `x` as above. Studio needs no login locally. The choice sticks: a later `up` in the same lane keeps Studio on until you turn it off.

Inside Studio the useful places are:

- **Table Editor**: browse and edit rows in `public` tables such as `items`, `movings`, `profiles`, and the purchasing and production tables.
- **SQL Editor**: run ad hoc queries. `select * from supabase_migrations.schema_migrations order by version;` shows which migrations the lane has applied.
- **Authentication, Users**: see who exists, create a user by hand, or reset a password. A user created here gets a `profiles` row from the trigger; set `user_type` to `admin` on that row if the account should be an admin.
- **Database, Policies**: the row-level security policies the migrations install.

Without Studio, the database is still reachable from the terminal: `up` prints a `postgresql://postgres:postgres@127.0.0.1:543x2/postgres` URL that works with `psql`, and `supabase migration list` inside the worktree shows the migration state.

## 6. Other Supabase commands

Run these inside the worktree, where they address the lane's own stack:

```bash
supabase status                  # URLs and keys of this lane's stack
supabase migration new <name>    # new migration file with a fresh timestamp
supabase migration up            # apply migration files the lane has not run yet
supabase db reset                # wipe the lane's database and replay every migration (and seed.sql)
```

`supabase db reset` deletes the lane's users too; run `scripts/lane.sh up` afterwards to recreate the admin account.

## 7. Finish a task

Commit, push, and open the pull request against `seasoned` (`gh pr create --base seasoned`). Then, still inside the worktree:

```bash
scripts/lane.sh down     # stop the dev server and the stack, data kept
```

Leave the worktree with ExitWorktree `keep` (or answer "keep" when Claude Code asks at session exit). The worktree and its branch stay until the pull request is decided. Do not choose `remove` while the PR is open: it deletes the branch behind it.

## 8. End of the day

```bash
scripts/lane.sh sweep    # from anywhere: "down" for every lane
```

This kills every lane's dev server and stops every lane's Supabase stack, keeping the data. The next `up` brings a lane back in seconds. Once a lane's pull request has been merged or abandoned, remove the lane for good from the main checkout with `scripts/lane.sh teardown <name>`; that deletes its Supabase data and its worktree but keeps the branch. If a worktree was already removed by Claude Code, `list` shows its leftover data as an orphan and the same `teardown` cleans it up.

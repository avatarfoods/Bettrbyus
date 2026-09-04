# Installing Bettrbyus from scratch

This guide takes a clean macOS machine to a running local copy of Bettrbyus, including the software the project depends on. It was written and verified on macOS (Apple Silicon) on 2026-09-02. Linux users can follow the same steps with their distribution's package manager in place of Homebrew.

## What you are installing

Bettrbyus is a Next.js 16 app (React 19, TypeScript, Tailwind CSS 4) that uses Supabase for its database and authentication. For development, Supabase runs locally in Docker (step 8). Some purchasing features also talk to an Odoo instance over JSON-RPC, but those are optional.

| Software | Version used | Required | Why |
| --- | --- | --- | --- |
| Xcode Command Line Tools | any recent | yes | Provides `git` and the compilers Homebrew needs |
| Homebrew | 6.x | yes | Installs everything below |
| Git | 2.50 | yes | Clone the repository |
| fnm | latest | yes | Node version manager (any manager works; fnm is what this machine uses) |
| Node.js | 22.22.0 | yes | Next 16 requires Node 20.9 or newer |
| npm | 10.9 | yes | Ships with Node; the repo has a `package-lock.json`, so use npm, not pnpm or yarn |
| Supabase CLI | 2.116.0 | yes | Runs the local Supabase stack (step 8) |
| Docker Desktop | any | yes | Hosts the local Supabase containers (step 8) |
| Claude Code | 2.1.260 | for Seasoned | Runs the agent workflow; step 11 points it at the Seasoned instructions |

## 1. Xcode Command Line Tools

Open Terminal and run the following. Accept the dialog and wait for it to finish.

```bash
xcode-select --install
```

## 2. Homebrew

Install Homebrew with the official script, then follow the "Next steps" it prints to add Homebrew to your shell. On Apple Silicon that is the `eval "$(/opt/homebrew/bin/brew shellenv)"` line in `~/.zprofile` or `~/.zshrc`.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Open a new terminal and confirm it works:

```bash
brew --version
```

## 3. Git

The Command Line Tools already include Git. If you prefer a newer version, install it with Homebrew.

```bash
brew install git
git --version
```

Set your identity once so commits carry your name and email:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 4. Node.js via fnm

Install fnm and hook it into zsh so it activates automatically in every shell.

```bash
brew install fnm
echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc
source ~/.zshrc
```

Install Node 22 and make it the default. The project has no `.nvmrc`, so the only hard constraint is Next's minimum of Node 20.9; Node 22 LTS is what this guide was verified with.

```bash
fnm install 22
fnm default 22
node -v   # v22.x.x
npm -v    # 10.x
```

## 5. Clone the repository

The repository lives at `github.com/avatarfoods/Bettrbyus`. Cloning over SSH needs an SSH key registered on your GitHub account; if you do not have one, use the HTTPS URL instead and sign in with a personal access token when prompted.

```bash
cd ~/Sites   # or wherever you keep projects
git clone git@github.com:avatarfoods/Bettrbyus.git
# or: git clone https://github.com/avatarfoods/Bettrbyus.git
cd Bettrbyus
```

If you are working on the Seasoned effort, switch to its branch and read `docs/seasoned/AGENTS.md` and `docs/seasoned/README.md` for the branch conventions. Step 11 sets up Claude Code for it.

```bash
git checkout seasoned
```

## 6. Install project dependencies

Use `npm ci` rather than `npm install` so you get exactly the versions in `package-lock.json`.

```bash
npm ci
```

Expect a note about `npm audit` findings; those come from transitive dependencies and do not block the install.

## 7. Configure environment variables

The app reads its configuration from `.env.local` in the project root. That file is gitignored and must be created by hand. The template below is ready for the local Supabase stack (step 8); the two keys in it are the fixed development keys every `supabase start` issues, so they work on any machine without editing.

```bash
cat > .env.local <<'EOT'
# --- Supabase (required) ---
# Local stack from `supabase start`. Confirm with `supabase status`.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# --- App URL (optional) ---
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- Odoo (optional; only purchasing sync needs it) ---
# ODOO_URL=https://yourcompany.odoo.com
# ODOO_DB=
# ODOO_USERNAME=
# ODOO_API_KEY=
EOT
```

Where each value comes from:

- `NEXT_PUBLIC_SUPABASE_URL`: `http://127.0.0.1:54321`, the API of the local stack.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the local stack always issues the anon key shown in the template; `supabase status` prints it.
- `SUPABASE_SERVICE_ROLE_KEY`: same rule as the anon key. It is server-only and bypasses row-level security, so never expose it in client code or commit it. It is used for user management (`lib/supabase/admin.ts`) and by the scripts in `scripts/`.
- `NEXT_PUBLIC_APP_URL`: the public origin used in invite and set-password emails. Leave it at localhost for local work. If unset, the app falls back to the request origin, then `http://localhost:3000`.
- `ODOO_*`: only needed for the purchasing features that read from Odoo. Without them those actions report "Odoo is not configured" and everything else works. `ODOO_URL` is the instance root without the `/odoo` suffix.

Next loads `.env.local` automatically for `next dev`, `next build` and `next start`. Restart the dev server after changing it.

## 8. Run Supabase locally

The app expects a database that holds the base tables (`profiles`, `items`, `movings`) plus everything created by the migrations in `supabase/migrations/`. The team's project was built by hand, so its base tables were never in a migration; `supabase/migrations/20260601000000_baseline.sql` reconstructs them from the application code, which means an empty local database is brought up from the repository alone. This was verified on 2026-09-02: all 34 migrations replay cleanly on a fresh stack.

This runs Postgres, Auth, PostgREST and Studio in Docker on your machine, so nothing you do can touch production data. It needs Docker Desktop running and the Supabase CLI.

If you are running this guide from Claude (Claude Code or a similar agent), do not let the agent install or start Docker Desktop. Ask the user to run the two Docker commands below themselves in a terminal, then continue once they confirm Docker is running. The cask install asks for an administrator password and Docker Desktop shows first-run dialogs that only a person can accept.

```bash
brew install --cask docker         # skip if Docker Desktop is already installed
open -a Docker                     # wait until the whale icon settles
brew install supabase/tap/supabase
supabase --version
```

The CLI config (`supabase/config.toml`) is committed, so there is nothing to initialize. If it is ever missing, `supabase init` recreates it with defaults.

The schema comes entirely from `supabase/migrations/`, starting with the baseline. Real data is optional, and the stack never loads it on its own: `[db.seed]` is disabled in `supabase/config.toml`, so a fresh database is empty by design and a `supabase/seed.sql` file is ignored even when present. To work with the team's materials and recipes instead of empty tables, ask a teammate with access to the hosted project for a data-only dump, save it as `supabase/seed.sql`, and load it by hand once the stack is running (step below). Someone with access produces it with `supabase link --project-ref <ref>` followed by `supabase db dump --data-only -f seed.sql`. Do not commit that file; it contains company data.

Migration filenames follow the CLI's rule: `<14-digit timestamp>_<name>.sql`, and the timestamp must be unique because the CLI's history table keys on it. The files used to share 8-digit date prefixes, which is why they were renamed to `YYYYMMDDNN0000_name.sql`, where `NN` numbers the files of one day in the order they must run. When you add a migration, give it a timestamp later than every existing one; `supabase migration new <name>` does that for you.

Start the stack. The first run downloads the Docker images (a few GB, several minutes). Every file in `supabase/migrations/` is applied in order; nothing else is loaded. Run it once and let it finish; two `supabase start` commands racing each other leave Docker with a half-created network and a `network supabase_network_Bettrbyus not found` error.

```bash
supabase start
supabase status
```

`supabase status` prints the local URLs and keys. They match the `.env.local` template from step 7, so no edit is needed: API on `http://127.0.0.1:54321`, Studio on `http://127.0.0.1:54323`, Postgres on `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, and Mailpit (catches every email the app sends, such as invites) on `http://127.0.0.1:54324`.

Day-to-day commands:

```bash
supabase stop            # stop the containers, keep the data
supabase start           # bring them back
supabase db reset        # wipe and replay all migrations (no seed; reload a dump by hand afterwards)
supabase stop --no-backup   # stop and discard the data
```

To load a data dump (optional, see above), run it through `psql` against the local database. `brew install libpq` provides `psql` if you do not have Postgres installed. `supabase db reset` wipes the data again, so reload after every reset.

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed.sql
```

One setting in `supabase/config.toml` to keep in mind when you write queries: `[api] max_rows = 1000` caps every PostgREST response at 1000 rows, silently. The query succeeds, the array is a thousand long, and the rest of the table is simply missing. The hosted project has the same cap, and purchasing materials already exceed it, so any query over a table that can outgrow a thousand rows must go through `lib/supabase/all-rows.ts`, which pages until the rows run out, or paginate on its own.

Create the first admin user. The command below talks to the local auth service with the service role key from `.env.local`; the trigger installed by the profiles migration creates the `profiles` row and copies `user_type` from the metadata, so the account is an admin straight away. Studio (Authentication, Users, Add user) does the same thing by hand, in which case set `user_type` to `admin` on the profile row afterwards. Any email and password work; these are local only.

```bash
export $(grep SUPABASE_SERVICE_ROLE_KEY .env.local)
curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local.test","password":"bettrbyus-local","email_confirm":true,"user_metadata":{"full_name":"Local Admin","user_type":"admin"}}'
```

## 9. Run the app

```bash
npm run dev
```

Open http://localhost:3000. Unauthenticated visits redirect to `/login`. Sign in with the admin user from step 8. Admins can invite others from Settings, Users inside the app; on the local stack the invite email lands in Mailpit at http://127.0.0.1:54324.

To reach the dev server from another device on your network (a tablet on the production floor, for example), Next only accepts cross-origin dev requests from hosts listed in `allowedDevOrigins` in `next.config.ts`. Add that device's or this machine's LAN IP there.

## 10. Verify the installation

These are the checks that were run on this machine after installation; all of them pass on a clean checkout.

```bash
npx tsc --noEmit   # type check
npm run lint       # ESLint (warnings only, no errors)
npm run build      # production build
npm run start      # serve the production build on :3000
```

## 11. Set up Claude Code for Seasoned

The Seasoned work is done with Claude Code, following instructions that apply only to this project (`docs/seasoned/AGENTS.md`) and a workflow in which every task runs in a Claude Code worktree with its own Supabase stack (`docs/seasoned/LANES.md`). Claude Code does not discover those instructions on its own, so this step points it at them. Skip it if you only work on `main`.

Install Claude Code with the native installer (Homebrew's `brew install --cask claude-code` also works), then confirm it runs:

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude --version
```

The Seasoned instructions must load only when you open this project, so give Claude Code a config directory dedicated to it rather than editing your global `~/.claude`. Either export `CLAUDE_CONFIG_DIR` in the shell you use for this project, or use a per-project config tool such as ccsw, which does the same thing per directory. The rest of this step writes two files into that directory.

```bash
export CLAUDE_CONFIG_DIR=~/.config/claude-bettrbyus   # put this in the shell profile you use for this project
mkdir -p "$CLAUDE_CONFIG_DIR"
```

First, `CLAUDE.md`. Claude Code reads this file at the start of every session in any project, and the instruction below tells it to read the Seasoned instructions and to leave the root files alone. If you must use your global `~/.claude/CLAUDE.md` instead, change the read instruction to "read `docs/seasoned/AGENTS.md` in the project root (if present)" so it stays inert in other projects.

```bash
cat >> "$CLAUDE_CONFIG_DIR/CLAUDE.md" <<'EOT'
## When you are working on Bettrbyus

Never edit AGENTS.md, CLAUDE.md, or README.md in the project root; those belong to the team working on `main`.

At the start of every session, before doing any work, read `docs/seasoned/AGENTS.md` and follow it. It plays the same role as the root AGENTS.md for the `seasoned` branch.
EOT
```

Second, `settings.json`. Lanes are Claude Code worktrees, and Claude Code cuts them from `origin/main` unless told otherwise. The `worktree.baseRef` setting has no way to name another branch, so set it to `head`: worktrees are then cut from whatever the main checkout has checked out, which the workflow keeps on an up-to-date `seasoned` (step 5). If the file already exists, add the `worktree` key to it instead of overwriting.

```bash
cat > "$CLAUDE_CONFIG_DIR/settings.json" <<'EOT'
{
  "worktree": { "baseRef": "head" }
}
EOT
```

Start Claude Code in the project and check that it picked the instructions up: `/memory` lists the loaded `CLAUDE.md` files, and the config directory's file should be among them. After editing either file, restart the session or run `/memory` so it reloads.

```bash
cd ~/Sites/Bettrbyus
claude
```

From here on, follow `docs/seasoned/DAILY.md`: it starts with `claude --worktree <name>` and `scripts/lane.sh up`, which give each task its own Supabase stack and port instead of the single stack from step 8. The stack from step 8 stays useful as the main checkout's own database and as the place where Studio runs by default.

## Troubleshooting

- "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY": `.env.local` is missing or has empty values. Recreate it from step 7 and restart the dev server.
- "fetch failed" or connection refused on every page: the local stack is not running. Start Docker Desktop, then `supabase start`.
- Pages say a table is missing, or errors mention `PGRST205` / `42P01`: the database is behind the migrations. `supabase db reset` replays them all.
- `supabase start` fails with `network supabase_network_Bettrbyus not found` or a container name conflict: two starts overlapped. Run `supabase stop --no-backup`, check `docker ps -a` for leftover `supabase_*` containers and remove them, then start once.
- `supabase start` rejects a migration filename or reports a duplicate version: the file does not follow `<14-digit timestamp>_<name>.sql` with a unique timestamp. See step 8.
- "Odoo is not configured": expected unless you set the four `ODOO_*` variables. Only purchasing sync needs them.
- Port 3000 already in use: run `npm run dev -- --port 3001` or stop the other process.
- `node: command not found` in a new terminal: fnm is not hooked into your shell. Re-run the `echo ... >> ~/.zshrc` line in step 4 and open a new terminal.
- Large master file uploads fail: the limits are set to 25 MB in `next.config.ts`; anything bigger needs that raised.

## State of this machine (2026-09-02)

Already present before this installation: Xcode Command Line Tools, Homebrew 6.0.21, Git 2.50.1, fnm with Node 22.22.0 and npm 10.9.4, Docker Desktop.

Done during this installation: `npm ci`, Supabase CLI 2.116.0 via Homebrew, `.env.local` with the local-stack settings from step 7, `supabase init`, the migration rename described in step 8, and `supabase start` followed by `supabase db reset`, which replayed all 34 migrations without error. A local admin user `admin@local.test` with password `bettrbyus-local` was created. The type check, lint, production build, a dev-server smoke test and a password sign-in against the local auth service all passed. There is no seed data yet, so every table is empty.

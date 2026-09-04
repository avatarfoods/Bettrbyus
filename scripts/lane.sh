#!/usr/bin/env bash
set -euo pipefail

# ---- project configuration ---------------------------------------------------
BASE_BRANCH="seasoned"        # lanes are cut from this branch; pull requests target it
ENV_FILE=".env.local"         # copied into each worktree by .worktreeinclude, then overridden here
APP_PORT_BASE=3001            # lane 1 serves Next on 3001, lane 2 on 3002, ...
SUPABASE_PORT_BASE=54330      # lane i uses ports SUPABASE_PORT_BASE+10*i .. +9 (main checkout keeps 5432x)
# --no-audit: npm's advisory request can hang for minutes and a lane does not need the report.
INSTALL_CMD="npm ci --no-audit --no-fund"
ADMIN_EMAIL="admin@local.test"      # local admin created in every lane (same as docs/seasoned/INSTALL.md)
ADMIN_PASSWORD="bettrbyus-local"
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The main checkout, even when this script runs from its copy inside a worktree.
MAIN_CHECKOUT="$(dirname "$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir)")"
PROJECT_NAME="$(basename "$MAIN_CHECKOUT")"
LANES_ROOT="$MAIN_CHECKOUT/.claude/worktrees"   # where Claude Code creates worktrees
MANAGED_BEGIN="# >>> lane managed block (written by lane.sh, do not edit) >>>"
MANAGED_END="# <<< lane managed block <<<"

usage() {
  cat <<EOF
lane.sh — isolated Supabase stacks for Claude Code worktrees of ${PROJECT_NAME}

A lane is a Claude Code worktree (EnterWorktree, or "claude --worktree <name>")
that lives at ${LANES_ROOT}/<name>
on branch <name>, plus what this script adds to it: its own local
Supabase stack in Docker, its own Next port, and its own ${ENV_FILE}. Many lanes
run in parallel without sharing state.

Inside a worktree (no name needed, the current worktree is the lane):
  scripts/lane.sh up [--no-dev]          Make the worktree a working lane: catch up with
                                         origin/${BASE_BRANCH} (reset if the lane has no commits
                                         of its own, rebase otherwise), allocate a
                                         port, write ${ENV_FILE}, point supabase/config.toml
                                         at the lane's own ports, install dependencies,
                                         start the lane's Supabase stack (migrations and
                                         supabase/seed.sql applied on first start), create
                                         the local admin user, and start the dev server in
                                         the background on the lane's port (log next to the
                                         worktree). Idempotent: re-running reuses everything,
                                         never re-seeds, and leaves a running server alone.
                                         Refuses to run while a rebase or merge is in
                                         progress, and stops if the catch-up rebase leaves
                                         conflict markers. --no-dev skips the dev server.
                                         The worktree's supabase/config.toml is never
                                         touched: the lane's stack runs from a copy in
                                         ${LANES_ROOT}/<name>.supabase/ that up and studio
                                         rebuild from it, so edit and commit it as usual.
  scripts/lane.sh run <cmd...>           Run a command with PORT and SUPABASE_WORKDIR set,
                                         e.g. "run npm run build" then "run npm start", or
                                         "run supabase db reset". Next ignores PORT in .env
                                         files, and a bare supabase command in a worktree
                                         talks to the main checkout's stack, so anything
                                         that must address the lane goes through this.
  scripts/lane.sh studio [on|off]        Turn Studio (and Postgres Meta) on or off for the
                                         lane and restart its stack, data kept. Lanes start
                                         without Studio to save memory.
  scripts/lane.sh down                   Kill the lane's dev server and stop its stack,
                                         data kept. Run before leaving the worktree.

From anywhere:
  scripts/lane.sh list                   Every lane with its ports and stack state, plus
                                         Supabase data left behind by removed worktrees.
  scripts/lane.sh sweep                  "down" for every lane. Run at the end of a session.
  scripts/lane.sh teardown <name>        Remove a lane for good: kill its processes, delete
                                         its Supabase containers and data, and remove the
                                         worktree if it still exists (refuses uncommitted
                                         changes unless --force). Works after ExitWorktree
                                         has already removed the directory. NEVER deletes
                                         the branch — it may back an open PR.

Admin login in every lane: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
Needs: git, node/npm, supabase CLI, Docker Desktop running, lsof, gh (for PRs).
EOF
}

die() { echo "lane.sh: $1" >&2; exit 1; }

# Warnings are printed where they happen and repeated by up after the ready banner, so they never drown in npm output.
WARNINGS=()
warn() { echo "lane.sh: WARNING: $1" >&2; WARNINGS+=("$1"); }
print_warnings() {
  [ ${#WARNINGS[@]} -gt 0 ] || return 0
  echo
  echo "lane $1: WARNINGS from this run:"
  local w; for w in "${WARNINGS[@]}"; do echo "  - $w"; done
}

require_name() {
  [[ "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || die "lane name may contain letters, digits, dots, underscores, dashes and slashes"
}

require_docker() {
  docker info >/dev/null 2>&1 || die "Docker is not running. Ask the user to start Docker Desktop (open -a Docker), then rerun."
}

lane_dir() { echo "$LANES_ROOT/$1"; }
is_worktree() { [ -f "$(lane_dir "$1")/.git" ]; }
# The lane's generated Supabase workdir, next to the worktree like the dev log (so gitignored and outside git).
lane_gen_dir() { echo "$(dirname "$(lane_dir "$1")")/$(basename "$1").supabase"; }
# Run the Supabase CLI against the lane's generated workdir.
sb() { local name="$1"; shift; (cd "$(lane_dir "$name")" && supabase --workdir "$(lane_gen_dir "$name")" "$@"); }
project_id() { echo "${PROJECT_NAME}-lane-$(echo "$1" | tr '/' '-')"; }

# Name of the lane the current directory belongs to, or nothing when not inside a lane worktree.
current_lane() {
  local top
  top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  case "$top" in
    "$LANES_ROOT"/*) echo "${top#"$LANES_ROOT"/}" ;;
  esac
}

require_current_lane() {
  local name
  name="$(current_lane)"
  [ -n "$name" ] || die "not inside a lane worktree. Create one with EnterWorktree (or 'claude --worktree <name>') and run this from there."
  echo "$name"
}

lane_port() {
  local env_path
  env_path="$(lane_dir "$1")/$ENV_FILE"
  [ -f "$env_path" ] && grep -E '^PORT=' "$env_path" | head -1 | cut -d= -f2 || true
}

# Lane index i (1, 2, ...) is derived from the Next port; every other port follows from it.
lane_index() { echo $(( $1 - APP_PORT_BASE + 1 )); }
supabase_base() { echo $(( SUPABASE_PORT_BASE + 10 * $(lane_index "$1") )); }
api_port() { echo $(( $(supabase_base "$1") + 1 )); }
db_port() { echo $(( $(supabase_base "$1") + 2 )); }
studio_port() { echo $(( $(supabase_base "$1") + 3 )); }
mail_port() { echo $(( $(supabase_base "$1") + 4 )); }

port_listening() { lsof -i "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1; }

# Every worktree directory under LANES_ROOT (relative names, one per line).
all_lanes() {
  [ -d "$LANES_ROOT" ] || return 0
  git -C "$MAIN_CHECKOUT" worktree list --porcelain | sed -n 's/^worktree //p' | while read -r wt; do
    case "$wt" in "$LANES_ROOT"/*) echo "${wt#"$LANES_ROOT"/}" ;; esac
  done
}

allocate_port() {
  local used=" " lane port base p free
  while read -r lane; do
    [ -n "$lane" ] || continue
    port="$(lane_port "$lane")"
    [ -n "$port" ] && used="$used$port "
  done < <(all_lanes)
  port=$APP_PORT_BASE
  while :; do
    free=true
    [[ "$used" == *" $port "* ]] && free=false
    if $free && port_listening "$port"; then free=false; fi
    if $free; then
      base="$(supabase_base "$port")"
      for p in $(seq "$base" $((base + 9))); do
        if port_listening "$p"; then free=false; break; fi
      done
    fi
    $free && break
    port=$((port + 1))
  done
  echo "$port"
}

write_managed_block() {
  local env_path="$1" port="$2" tmp
  tmp="$(mktemp)"
  if [ -f "$env_path" ]; then
    sed "/^$(printf '%s' "$MANAGED_BEGIN" | sed 's/[[\.*^$/]/\\&/g')/,/^$(printf '%s' "$MANAGED_END" | sed 's/[[\.*^$/]/\\&/g')/d" "$env_path" >"$tmp"
  fi
  {
    echo "$MANAGED_BEGIN"
    echo "# Later lines win in Next's env loading, so these override the values copied from the main checkout."
    echo "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$(api_port "$port")"
    echo "NEXT_PUBLIC_APP_URL=http://localhost:$port"
    echo "PORT=$port"
    echo "$MANAGED_END"
  } >>"$tmp"
  mv "$tmp" "$env_path"
}

# "on" if the lane's generated config has Studio enabled, "off" otherwise (also for a lane never set up).
studio_state() {
  local cfg
  cfg="$(lane_gen_dir "$1")/supabase/config.toml"
  if [ -f "$cfg" ] && sed -n '/^\[studio\]/,/^\[/p' "$cfg" | grep -q '^enabled = true'; then
    echo on
  else
    echo off
  fi
}

# Derive the lane's config.toml ($2) from a config.toml ($1): own project id and ports, container toggles.
lane_config_from() {
  local src="$1" dst="$2" name="$3" port="$4" studio="$5" base x args=()
  base="$(supabase_base "$port")"
  args+=(-e "s/^project_id = .*/project_id = \"$(project_id "$name")\"/")
  for x in 0 1 2 3 4 5 6 7 8 9; do
    args+=(-e "s/([^0-9])5432${x}([^0-9]|$)/\1$((base + x))\2/g")
  done
  args+=(-e "s/:3000([^0-9]|$)/:${port}\1/g")
  # Lanes do not need log analytics or the edge runtime; skipping them saves several containers per lane.
  args+=(-e '/^\[analytics\]/,/^\[/ s/^enabled = true/enabled = false/')
  args+=(-e '/^\[edge_runtime\]/,/^\[/ s/^enabled = true/enabled = false/')
  # Studio and Postgres Meta are the two largest containers and only serve manual browsing;
  # lanes start without them. "scripts/lane.sh studio" turns them on.
  if [ "$studio" = on ]; then
    args+=(-e '/^\[studio\]/,/^\[/ s/^enabled = false/enabled = true/')
  else
    args+=(-e '/^\[studio\]/,/^\[/ s/^enabled = true/enabled = false/')
  fi
  sed -E "${args[@]}" "$src" >"$dst"
}

# Build the lane's Supabase workdir outside the worktree: every entry of the worktree's supabase/ directory linked
# in, plus a config.toml derived from the worktree's current one. The tracked config.toml is never touched, so an
# edit to it is an ordinary git change and reaches the lane on the next up or studio. Sets LANE_GEN_CHANGED=true
# when the generated config differs from the previous run's, which means a running stack must be restarted.
LANE_GEN_CHANGED=false
write_lane_gen() {
  local dir="$1" name="$2" port="$3" studio="$4" gen entry tmp
  gen="$(lane_gen_dir "$name")"
  [ -f "$dir/supabase/config.toml" ] || die "no supabase/config.toml in $dir"
  mkdir -p "$gen/supabase"
  find "$gen/supabase" -maxdepth 1 -type l -delete
  for entry in "$dir"/supabase/* "$dir"/supabase/.[!.]*; do
    [ -e "$entry" ] || continue
    case "$(basename "$entry")" in config.toml|.temp|.branches) continue ;; esac
    ln -s "$entry" "$gen/supabase/$(basename "$entry")"
  done
  # The CLI reads dotenv files from its workdir, so env(...) references in config.toml resolve as in the main checkout.
  ln -sfn "$dir/$ENV_FILE" "$gen/$ENV_FILE"
  tmp="$(mktemp)"
  lane_config_from "$dir/supabase/config.toml" "$tmp" "$name" "$port" "$studio"
  if [ -f "$gen/supabase/config.toml" ] && cmp -s "$tmp" "$gen/supabase/config.toml"; then
    rm -f "$tmp"
    LANE_GEN_CHANGED=false
  else
    mv "$tmp" "$gen/supabase/config.toml"
    LANE_GEN_CHANGED=true
  fi
}

# Lanes set up before the generated workdir existed carry a rewritten config.toml hidden from git with
# skip-worktree. Make the file ordinary again: restore the committed one when it holds nothing but the old rewrite,
# otherwise leave it, now visible in git status. LEGACY_STUDIO gets the Studio state the old file had.
LEGACY_STUDIO=""
release_legacy_config() {
  local dir="$1" name="$2" port="$3" studio=off head tmp
  git -C "$dir" ls-files -v supabase/config.toml | grep -q '^S' || return 0
  git -C "$dir" update-index --no-skip-worktree supabase/config.toml
  sed -n '/^\[studio\]/,/^\[/p' "$dir/supabase/config.toml" | grep -q '^enabled = true' && studio=on
  LEGACY_STUDIO="$studio"
  head="$(mktemp)"; tmp="$(mktemp)"
  git -C "$dir" show HEAD:supabase/config.toml >"$head"
  lane_config_from "$head" "$tmp" "$name" "$port" "$studio"
  if cmp -s "$tmp" "$dir/supabase/config.toml"; then
    git -C "$dir" checkout -- supabase/config.toml
    echo "lane $name: supabase/config.toml is no longer rewritten inside the worktree; the committed file is back and the lane's copy lives in $(lane_gen_dir "$name")"
  else
    warn "supabase/config.toml was hidden from git with skip-worktree and differs from the committed file beyond the lane rewrite. It shows in git status now; take the lane's project id and ports out of it before committing."
  fi
  rm -f "$head" "$tmp"
}

stack_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "supabase_db_$(project_id "$1")"
}

stack_has_data() {
  docker volume ls -q 2>/dev/null | grep -qx "supabase_db_$(project_id "$1")"
}

env_value() { grep -E "^$2=" "$1" | tail -1 | cut -d= -f2-; }

create_admin_user() {
  local dir="$1" port="$2" key url out
  key="$(env_value "$dir/$ENV_FILE" SUPABASE_SERVICE_ROLE_KEY)"
  [ -n "$key" ] || { echo "lane: no SUPABASE_SERVICE_ROLE_KEY in $ENV_FILE, admin user not created"; return 0; }
  url="http://127.0.0.1:$(api_port "$port")"
  out="$(curl -s -X POST "$url/auth/v1/admin/users" \
    -H "apikey: $key" -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Local Admin\",\"user_type\":\"admin\"}}")"
  if grep -q '"id"' <<<"$out"; then
    echo "lane: admin user $ADMIN_EMAIL created"
  elif grep -qi 'already' <<<"$out"; then
    echo "lane: admin user $ADMIN_EMAIL already exists"
  else
    echo "lane: could not create admin user: $out" >&2
    return 0
  fi
  # The signup trigger deliberately ignores caller-supplied user_type (issue #10),
  # so a fresh profile lands as 'user'. Promote it explicitly through the service
  # role, which the guard trigger allows - the same thing lib/users/actions.ts does.
  curl -s -o /dev/null -X PATCH "$url/rest/v1/profiles?email=eq.$ADMIN_EMAIL" \
    -H "apikey: $key" -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d '{"user_type":"admin"}' \
    && echo "lane: admin user $ADMIN_EMAIL promoted to admin"
}

# The dev server log lives next to the worktree, inside .claude/worktrees/, so it never shows up in git status.
lane_log() { echo "$(dirname "$(lane_dir "$1")")/$(basename "$1").dev.log"; }

start_dev_server() {
  local name="$1" dir="$2" port="$3" log
  log="$(lane_log "$name")"
  if port_listening "$port"; then
    echo "lane $name: dev server already running on port $port"
    return 0
  fi
  echo "lane $name: starting dev server on port $port (log: $log)"
  # exec so no shell lingers holding this script's stdout (that would hang callers piping the output);
  # all three fds point away from the terminal so the server survives the session that started it.
  ( cd "$dir" && exec env PORT="$port" nohup npm run dev >"$log" 2>&1 </dev/null ) &
  for _ in $(seq 1 60); do
    port_listening "$port" && break
    sleep 1
  done
  if ! port_listening "$port"; then
    echo "lane $name: dev server did not start within 60s; last log lines:" >&2
    tail -20 "$log" >&2 || true
    return 1
  fi
  # First request compiles the app, so the URL answers quickly when the user opens it.
  curl -s -o /dev/null --max-time 120 "http://localhost:$port/login" || true
}

kill_lane_processes() {
  local name="$1" port pids
  port="$(lane_port "$name")"
  [ -n "$port" ] || return 0
  pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "lane $name: killing PIDs $pids (port $port)"
    kill $pids 2>/dev/null || true
  fi
}

stop_stack() {
  local name="$1"
  if stack_running "$name"; then
    echo "lane $name: stopping supabase stack (data kept)"
    (cd "$MAIN_CHECKOUT" && supabase stop --project-id "$(project_id "$name")") || true
  fi
}

# Claude Code names the branch worktree-<name>; a lane's branch is just <name>, so the pull request carries the task's name.
rename_branch() {
  local name="$1" dir="$2" current
  current="$(git -C "$dir" branch --show-current)"
  [ "$current" = "worktree-$name" ] || return 0
  if git -C "$dir" show-ref --verify --quiet "refs/heads/$name"; then
    warn "branch $name already exists; staying on $current"
    return 0
  fi
  git -C "$dir" branch -m "$name" && echo "lane $name: branch renamed from $current to $name"
}

# Refuse to touch a worktree while git has an operation of its own in progress. Syncing on top of it would either
# fail and then "rebase --abort" the person's half-done rebase, throwing away their conflict resolutions, or run the
# stack on a tree full of conflict markers.
require_no_git_operation() {
  local name="$1" dir="$2" gitdir op=""
  gitdir="$(git -C "$dir" rev-parse --path-format=absolute --git-dir)"
  if [ -d "$gitdir/rebase-merge" ] || [ -d "$gitdir/rebase-apply" ]; then op=rebase
  elif [ -f "$gitdir/MERGE_HEAD" ]; then op=merge
  elif [ -f "$gitdir/CHERRY_PICK_HEAD" ]; then op=cherry-pick
  elif [ -f "$gitdir/REVERT_HEAD" ]; then op=revert
  fi
  [ -z "$op" ] || die "lane $name has a $op in progress; nothing was touched. Finish it (git $op --continue) or undo it (git $op --abort), then rerun up."
}

# Make sure the lane contains the latest origin/$BASE_BRANCH. A lane without commits of its own is moved onto it
# (uncommitted changes are kept); a lane with its own commits is rebased, and left untouched when the rebase conflicts.
sync_with_base() {
  local name="$1" dir="$2" base="origin/$BASE_BRANCH" upstream stash_before stash_after conflicted
  if ! git -C "$dir" fetch origin --quiet; then
    warn "git fetch failed; cannot check whether this worktree is based on the latest $base"
    return 0
  fi
  # Once the branch is pushed, commits can land on its remote copy from elsewhere (a reviewer's push, a GitHub
  # suggestion). Rewriting the local branch would then set up a rejected push and a force push that drops them.
  upstream="$(git -C "$dir" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
  if [ -n "$upstream" ] && [ "$(git -C "$dir" rev-list --count "HEAD..$upstream")" -gt 0 ]; then
    warn "$upstream has commits this worktree does not have (a reviewer's push or a GitHub suggestion?). The branch was left alone; run 'git pull --rebase' to bring them in, then rerun up so it can catch up with $base."
    return 0
  fi
  if git -C "$dir" merge-base --is-ancestor "$base" HEAD 2>/dev/null; then return 0; fi
  if git -C "$dir" merge-base --is-ancestor HEAD "$base" 2>/dev/null; then
    echo "lane $name: worktree was cut from an outdated $BASE_BRANCH; resetting to $base"
    git -C "$dir" reset --keep "$base" || die "could not reset to $base because uncommitted changes are in the way. Commit or stash them, then rerun up."
    return 0
  fi
  echo "lane $name: worktree has its own commits on an outdated $BASE_BRANCH; rebasing onto $base"
  stash_before="$(git -C "$dir" rev-parse -q --verify refs/stash || true)"
  if ! git -C "$dir" rebase --autostash --quiet "$base"; then
    git -C "$dir" rebase --abort 2>/dev/null || true
    warn "rebase onto $base conflicted and was aborted; the worktree is unchanged. Rebase by hand before opening the pull request."
    return 0
  fi
  # A rebase that goes through but cannot reapply the autostash still exits 0: git keeps the edits as a new stash
  # entry and leaves the conflicting files with markers. Stop here rather than run the stack on that tree.
  conflicted="$(git -C "$dir" diff --name-only --diff-filter=U)"
  stash_after="$(git -C "$dir" rev-parse -q --verify refs/stash || true)"
  if [ -n "$conflicted" ] || [ "$stash_after" != "$stash_before" ]; then
    die "lane $name was rebased onto $base, but the uncommitted changes did not reapply cleanly; up stopped here.
  Your changes are safe in stash@{0} (autostash); these files have conflict markers:
$(printf '    %s\n' $conflicted)
  Fix the markers and 'git add' each file, then 'git stash drop', then rerun up."
  fi
  [ -z "$upstream" ] || warn "branch $(git -C "$dir" branch --show-current) was rebased and no longer matches $upstream; push it with 'git push --force-with-lease' (never a plain --force)."
}

up() {
  local name dir port studio fresh=false dev=true
  [ "${1:-}" != "--no-dev" ] || dev=false
  name="$(require_current_lane)"
  require_docker
  dir="$(lane_dir "$name")"
  require_no_git_operation "$name" "$dir"
  rename_branch "$name" "$dir"

  port="$(lane_port "$name")"
  studio="$(studio_state "$name")"
  [ -z "$port" ] || release_legacy_config "$dir" "$name" "$port"
  [ -z "$LEGACY_STUDIO" ] || studio="$LEGACY_STUDIO"

  # Worktrees are cut from the main checkout's HEAD (worktree.baseRef = head); if that was stale, catch up with origin.
  sync_with_base "$name" "$dir"

  [ -n "$port" ] || port="$(allocate_port)"

  if [ ! -f "$dir/$ENV_FILE" ]; then
    [ -f "$MAIN_CHECKOUT/$ENV_FILE" ] || die "no $ENV_FILE in $MAIN_CHECKOUT to copy (see docs/seasoned/INSTALL.md step 7)"
    cp "$MAIN_CHECKOUT/$ENV_FILE" "$dir/$ENV_FILE"
  fi
  write_managed_block "$dir/$ENV_FILE" "$port"

  # Company data is optional and never committed; reuse the main checkout's copy if .worktreeinclude did not.
  if [ -f "$MAIN_CHECKOUT/supabase/seed.sql" ] && [ ! -f "$dir/supabase/seed.sql" ]; then
    cp "$MAIN_CHECKOUT/supabase/seed.sql" "$dir/supabase/seed.sql"
  fi
  write_lane_gen "$dir" "$name" "$port" "$studio"

  (cd "$dir" && $INSTALL_CMD)

  stack_has_data "$name" || fresh=true
  if stack_running "$name"; then
    if $LANE_GEN_CHANGED; then
      echo "lane $name: supabase configuration changed; restarting the stack (data kept)"
      sb "$name" stop
      sb "$name" start
    else
      echo "lane $name: supabase stack already running"
    fi
  else
    sb "$name" start
  fi
  if ! $fresh; then
    echo "lane $name: database already existed, seed skipped; applying pending migrations"
    sb "$name" migration up
  fi
  create_admin_user "$dir" "$port"
  if $dev; then start_dev_server "$name" "$dir" "$port"; fi

  echo
  echo "lane $name ready"
  echo "  worktree:  $dir"
  echo "  branch:    $(git -C "$dir" branch --show-current)"
  echo "  database:  $(project_id "$name")$($fresh && echo ' (created + migrated + seeded)' || echo ' (reused)')"
  if port_listening "$port"; then
    echo "  app:       http://localhost:$port   (dev server running; log: $(lane_log "$name"))"
  else
    echo "  app:       http://localhost:$port   (dev server not running; start with: scripts/lane.sh up)"
  fi
  echo "  supabase:  api http://127.0.0.1:$(api_port "$port")  mail http://127.0.0.1:$(mail_port "$port")  db postgresql://postgres:postgres@127.0.0.1:$(db_port "$port")/postgres"
  if [ "$(studio_state "$name")" = on ]; then
    echo "  studio:    http://127.0.0.1:$(studio_port "$port")"
  else
    echo "  studio:    off (scripts/lane.sh studio turns it on at http://127.0.0.1:$(studio_port "$port"))"
  fi
  echo "  cli:       scripts/lane.sh run supabase <args>   (a bare supabase here addresses the main checkout's stack; workdir: $(lane_gen_dir "$name"))"
  echo "  login:     $ADMIN_EMAIL / $ADMIN_PASSWORD"
  print_warnings "$name"
}

run() {
  local name dir port
  name="$(require_current_lane)"
  [ $# -gt 0 ] || die "usage: lane.sh run <cmd...>"
  dir="$(lane_dir "$name")"
  port="$(lane_port "$name")"
  [ -n "$port" ] || die "lane $name has no PORT in $ENV_FILE; run 'scripts/lane.sh up' first"
  cd "$dir"
  PORT="$port" SUPABASE_WORKDIR="$(lane_gen_dir "$name")" exec "$@"
}

studio() {
  local name state="${1:-on}" dir port
  name="$(require_current_lane)"
  require_docker
  [ "$state" = on ] || [ "$state" = off ] || die "usage: lane.sh studio [on|off]"
  dir="$(lane_dir "$name")"
  port="$(lane_port "$name")"
  [ -n "$port" ] || die "lane $name has no PORT in $ENV_FILE; run 'scripts/lane.sh up' first"
  write_lane_gen "$dir" "$name" "$port" "$state"
  # supabase start does nothing when the stack is already up, so restart it; data is kept.
  if stack_running "$name"; then
    sb "$name" stop
  fi
  sb "$name" start
  if [ "$state" = on ]; then
    echo "lane $name: studio on at http://127.0.0.1:$(studio_port "$port")"
  else
    echo "lane $name: studio off"
  fi
}

down() {
  local name
  name="$(require_current_lane)"
  kill_lane_processes "$name"
  docker info >/dev/null 2>&1 && stop_stack "$name"
  echo "lane $name: down (worktree and data kept)"
}

teardown() {
  require_name "$1"
  local name="$1" force="${2:-}" dir pid lane nested=""
  dir="$(lane_dir "$name")"
  pid="$(project_id "$name")"

  if is_worktree "$name"; then
    if [ "$force" != "--force" ] && [ -n "$(git -C "$dir" status --porcelain)" ]; then
      die "lane $name has uncommitted changes — commit them or pass --force"
    fi
  elif [ -d "$dir" ]; then
    # Not a worktree itself, yet a directory: either a leftover after the worktree was removed (a dev server still
    # writing .next/, for example), or the parent of lanes with slashes in their names, such as feature/login under
    # feature. Only the first may be deleted; the uncommitted-changes check above never ran for what is below.
    while read -r lane; do
      case "$lane" in "$name"/*) nested="$nested $lane" ;; esac
    done < <(all_lanes)
    [ -z "$nested" ] || die "$name is not a lane but a directory holding the lanes$nested. Tear each of them down by name."
    if find "$dir" -name .git -print -quit | grep -q .; then
      die "$dir is not a registered worktree but contains a git checkout; leaving it alone. Remove it by hand if it is stale."
    fi
  fi
  kill_lane_processes "$name"
  if docker info >/dev/null 2>&1; then
    if stack_running "$name" || stack_has_data "$name"; then
      (cd "$MAIN_CHECKOUT" && supabase stop --no-backup --project-id "$pid") \
        || echo "lane $name: supabase stop failed, check 'docker ps -a' and 'docker volume ls' for leftovers named *_$pid"
    else
      echo "lane $name: no supabase containers or data to remove"
    fi
  else
    echo "lane $name: Docker is not running, supabase containers and volumes for $pid were left behind"
  fi
  rm -f "$(lane_log "$name")"
  rm -rf "$(lane_gen_dir "$name")"
  if is_worktree "$name"; then
    git -C "$MAIN_CHECKOUT" worktree remove --force "$dir"
    echo "lane $name removed (branch kept — delete it manually once its PR is closed)"
  elif [ -d "$dir" ]; then
    # Left behind after the worktree itself was removed (a dev server still writing .next/, for example).
    rm -rf "$dir"
    echo "lane $name: worktree already gone, stale directory and data removed"
  else
    echo "lane $name: worktree already gone, data removed"
  fi
}

sweep() {
  local lane found=false
  while read -r lane; do
    [ -n "$lane" ] || continue
    found=true
    kill_lane_processes "$lane"
    docker info >/dev/null 2>&1 && stop_stack "$lane"
  done < <(all_lanes)
  $found || echo "no lanes to sweep"
}

list() {
  local lane port state found=false vol name
  while read -r lane; do
    [ -n "$lane" ] || continue
    found=true
    port="$(lane_port "$lane")"
    if [ -z "$port" ]; then state="not set up (run scripts/lane.sh up inside it)"
    elif stack_running "$lane"; then state=running
    else state=stopped; fi
    echo "$lane  branch=$(git -C "$(lane_dir "$lane")" branch --show-current)  app=${port:--}  supabase-api=$([ -n "$port" ] && api_port "$port" || echo -)  stack=$state  studio=$(studio_state "$lane")  $(lane_dir "$lane")"
  done < <(all_lanes)
  $found || echo "no lanes"
  # Supabase data whose worktree no longer exists (ExitWorktree removed it, or the lane was never torn down).
  if docker info >/dev/null 2>&1; then
    for vol in $(docker volume ls -q 2>/dev/null | grep "^supabase_db_${PROJECT_NAME}-lane-" || true); do
      name="${vol#supabase_db_"${PROJECT_NAME}"-lane-}"
      is_worktree "$name" || echo "orphan  $name  (supabase data without a worktree; scripts/lane.sh teardown $name removes it)"
    done
  fi
}

case "${1:-}" in
  up) shift; up "${1:-}" ;;
  run) shift; run "$@" ;;
  studio) shift; studio "${1:-on}" ;;
  down) down ;;
  teardown) shift; teardown "${1:?usage: lane.sh teardown <name> [--force]}" "${2:-}" ;;
  sweep) sweep ;;
  list) list ;;
  -h|--help|help|"") usage ;;
  *) die "unknown command: $1 (run lane.sh --help)" ;;
esac

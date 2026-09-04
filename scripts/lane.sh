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
                                         start the lane's Supabase stack (migrations applied
                                         on first start; seeding is disabled), create
                                         the local admin user, and start the dev server in
                                         the background on the lane's port (log next to the
                                         worktree). Idempotent: re-running reuses everything
                                         and leaves a running server alone.
                                         --no-dev skips the dev server.
  scripts/lane.sh run <cmd...>           Run a command with PORT set, e.g. "run npm run build"
                                         then "run npm start". Next ignores PORT in .env
                                         files, so anything that must land on the lane's
                                         port goes through this.
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

require_name() {
  [[ "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || die "lane name may contain letters, digits, dots, underscores, dashes and slashes"
}

require_docker() {
  docker info >/dev/null 2>&1 || die "Docker is not running. Ask the user to start Docker Desktop (open -a Docker), then rerun."
}

lane_dir() { echo "$LANES_ROOT/$1"; }
is_worktree() { [ -f "$(lane_dir "$1")/.git" ]; }
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

# "on" if the lane's current config has Studio enabled, "off" otherwise (also for a fresh lane).
studio_state() {
  local cfg="$1/supabase/config.toml"
  if [ -f "$cfg" ] && git -C "$1" ls-files -v supabase/config.toml | grep -q '^S' \
     && sed -n '/^\[studio\]/,/^\[/p' "$cfg" | grep -q '^enabled = true'; then
    echo on
  else
    echo off
  fi
}

# Rewrite the lane's supabase/config.toml so its stack has its own project id and ports.
# The file is marked skip-worktree so the rewrite never lands in a commit.
write_lane_supabase_config() {
  local dir="$1" name="$2" port="$3" studio="$4" base x cfg tmp args=()
  cfg="$dir/supabase/config.toml"
  [ -f "$cfg" ] || die "no supabase/config.toml in $dir"
  base="$(supabase_base "$port")"
  git -C "$dir" update-index --no-skip-worktree supabase/config.toml 2>/dev/null || true
  git -C "$dir" checkout -- supabase/config.toml
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
  tmp="$(mktemp)"
  sed -E "${args[@]}" "$cfg" >"$tmp" && mv "$tmp" "$cfg"
  git -C "$dir" update-index --skip-worktree supabase/config.toml
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
  fi
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
  local name="$1" dir
  dir="$(lane_dir "$name")"
  if stack_running "$name"; then
    echo "lane $name: stopping supabase stack (data kept)"
    (cd "$dir" && supabase stop) || true
  fi
}

# Claude Code names the branch worktree-<name>; a lane's branch is just <name>, so the pull request carries the task's name.
rename_branch() {
  local name="$1" dir="$2" current
  current="$(git -C "$dir" branch --show-current)"
  [ "$current" = "worktree-$name" ] || return 0
  if git -C "$dir" show-ref --verify --quiet "refs/heads/$name"; then
    echo "lane $name: WARNING: branch $name already exists; staying on $current" >&2
    return 0
  fi
  git -C "$dir" branch -m "$name" && echo "lane $name: branch renamed from $current to $name"
}

# Make sure the lane contains the latest origin/$BASE_BRANCH. A lane without commits of its own is moved onto it
# (uncommitted changes are kept); a lane with its own commits is rebased, and left untouched when the rebase conflicts.
sync_with_base() {
  local name="$1" dir="$2" base="origin/$BASE_BRANCH"
  if ! git -C "$dir" fetch origin --quiet; then
    echo "lane $name: WARNING: git fetch failed; cannot check whether this worktree is based on the latest $base" >&2
    return 0
  fi
  if git -C "$dir" merge-base --is-ancestor "$base" HEAD 2>/dev/null; then return 0; fi
  if git -C "$dir" merge-base --is-ancestor HEAD "$base" 2>/dev/null; then
    echo "lane $name: worktree was cut from an outdated $BASE_BRANCH; resetting to $base"
    git -C "$dir" reset --keep "$base" || die "could not reset to $base because uncommitted changes are in the way. Commit or stash them, then rerun up."
    return 0
  fi
  echo "lane $name: worktree has its own commits on an outdated $BASE_BRANCH; rebasing onto $base"
  if ! git -C "$dir" rebase --autostash --quiet "$base"; then
    git -C "$dir" rebase --abort 2>/dev/null || true
    echo "lane $name: WARNING: rebase onto $base conflicted and was aborted; the worktree is unchanged. Rebase by hand before opening the pull request." >&2
  fi
}

up() {
  local name dir port fresh=false dev=true
  [ "${1:-}" != "--no-dev" ] || dev=false
  name="$(require_current_lane)"
  require_docker
  dir="$(lane_dir "$name")"
  rename_branch "$name" "$dir"

  # Worktrees are cut from the main checkout's HEAD (worktree.baseRef = head); if that was stale, catch up with origin.
  sync_with_base "$name" "$dir"

  port="$(lane_port "$name")"
  [ -n "$port" ] || port="$(allocate_port)"

  if [ ! -f "$dir/$ENV_FILE" ]; then
    [ -f "$MAIN_CHECKOUT/$ENV_FILE" ] || die "no $ENV_FILE in $MAIN_CHECKOUT to copy (see docs/seasoned/INSTALL.md step 7)"
    cp "$MAIN_CHECKOUT/$ENV_FILE" "$dir/$ENV_FILE"
  fi
  write_managed_block "$dir/$ENV_FILE" "$port"
  write_lane_supabase_config "$dir" "$name" "$port" "$(studio_state "$dir")"

  # Company data is optional, never committed and never loaded automatically ([db.seed] is off);
  # reuse the main checkout's copy if .worktreeinclude did not, so it is there to load by hand.
  if [ -f "$MAIN_CHECKOUT/supabase/seed.sql" ] && [ ! -f "$dir/supabase/seed.sql" ]; then
    cp "$MAIN_CHECKOUT/supabase/seed.sql" "$dir/supabase/seed.sql"
  fi

  (cd "$dir" && $INSTALL_CMD)

  stack_has_data "$name" || fresh=true
  if stack_running "$name"; then
    echo "lane $name: supabase stack already running"
  else
    (cd "$dir" && supabase start)
  fi
  if ! $fresh; then
    echo "lane $name: database already existed; applying pending migrations"
    (cd "$dir" && supabase migration up)
  fi
  create_admin_user "$dir" "$port"
  if $dev; then start_dev_server "$name" "$dir" "$port"; fi

  echo
  echo "lane $name ready"
  echo "  worktree:  $dir"
  echo "  branch:    $(git -C "$dir" branch --show-current)"
  echo "  database:  $(project_id "$name")$($fresh && echo ' (created + migrated, no seed)' || echo ' (reused)')"
  if port_listening "$port"; then
    echo "  app:       http://localhost:$port   (dev server running; log: $(lane_log "$name"))"
  else
    echo "  app:       http://localhost:$port   (dev server not running; start with: scripts/lane.sh up)"
  fi
  echo "  supabase:  api http://127.0.0.1:$(api_port "$port")  mail http://127.0.0.1:$(mail_port "$port")  db postgresql://postgres:postgres@127.0.0.1:$(db_port "$port")/postgres"
  if [ "$(studio_state "$dir")" = on ]; then
    echo "  studio:    http://127.0.0.1:$(studio_port "$port")"
  else
    echo "  studio:    off (scripts/lane.sh studio turns it on at http://127.0.0.1:$(studio_port "$port"))"
  fi
  echo "  login:     $ADMIN_EMAIL / $ADMIN_PASSWORD"
}

run() {
  local name dir port
  name="$(require_current_lane)"
  [ $# -gt 0 ] || die "usage: lane.sh run <cmd...>"
  dir="$(lane_dir "$name")"
  port="$(lane_port "$name")"
  [ -n "$port" ] || die "lane $name has no PORT in $ENV_FILE; run 'scripts/lane.sh up' first"
  cd "$dir"
  PORT="$port" exec "$@"
}

studio() {
  local name state="${1:-on}" dir port
  name="$(require_current_lane)"
  require_docker
  [ "$state" = on ] || [ "$state" = off ] || die "usage: lane.sh studio [on|off]"
  dir="$(lane_dir "$name")"
  port="$(lane_port "$name")"
  [ -n "$port" ] || die "lane $name has no PORT in $ENV_FILE; run 'scripts/lane.sh up' first"
  write_lane_supabase_config "$dir" "$name" "$port" "$state"
  # supabase start does nothing when the stack is already up, so restart it; data is kept.
  if stack_running "$name"; then
    (cd "$dir" && supabase stop)
  fi
  (cd "$dir" && supabase start)
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
  local name="$1" force="${2:-}" dir pid
  dir="$(lane_dir "$name")"
  pid="$(project_id "$name")"

  if is_worktree "$name"; then
    if [ "$force" != "--force" ] && [ -n "$(git -C "$dir" status --porcelain)" ]; then
      die "lane $name has uncommitted changes — commit them or pass --force"
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
    echo "$lane  branch=$(git -C "$(lane_dir "$lane")" branch --show-current)  app=${port:--}  supabase-api=$([ -n "$port" ] && api_port "$port" || echo -)  stack=$state  studio=$(studio_state "$(lane_dir "$lane")")  $(lane_dir "$lane")"
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

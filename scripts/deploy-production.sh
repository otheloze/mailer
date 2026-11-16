#!/usr/bin/env bash
# =============================================================================
# deploy-production.sh
# cPanel / Phusion Passenger production deployer for MYMAILMARKET (Next.js 15)
# =============================================================================
#
# NOTE: the build step below cannot complete on this hosting plan. The account's
# ~1 GB LVE memory cap kills `next build` with `spawn ... EAGAIN`, so the working
# release path is scripts/build-artifact.sh (build in a Linux container) plus
# scripts/deploy-artifact.ps1 (upload .next, swap, restart, health check). The
# rest of this script - preflight, repo sync, env install, npm ci, parking and
# rollback - is still the reference for what a release has to do, and it works
# again as written if the cap is ever raised.
#
# On this host the registered application root is /home/jlazxdoi/api, not the
# ~/mymailmarket-app default below, so pass --app-root when running it.
# =============================================================================
#
#   1) Upload the production env file once. LF endings, KEY=value, no quotes:
#        scp -P 1624 .env.production jlazxdoi@102.212.246.122:~/mymailmarket.env
#
#   2) Run the deployer by streaming it (nothing needs to be committed):
#        ssh -p 1624 jlazxdoi@102.212.246.122 \
#            'bash -s -- --env-file ~/mymailmarket.env' < scripts/deploy-production.sh
#
#   Or, once the repo exists on the server, run it in place:
#        bash ~/mymailmarket-app/scripts/deploy-production.sh --env-file ~/mymailmarket.env
#
# What it does, in order (each step is idempotent and re-runnable):
#   preflight -> lock -> activate cPanel nodeenv -> sync repo -> install env
#             -> npm ci -> verify sharp -> build (with rollback) -> verify
#             Passenger registration -> restart -> health check -> summary
#
# Exit codes:
#   0  deploy verified live
#   1  preflight refused to run (missing tool, wrong Node, no env file, ...)
#   2  deploy failed (git, npm ci, build, or health check) - previous build kept
#   3  manual cPanel action required: Node.js application not registered yet
#
# Flags (all optional):
#   --app-root PATH     Application root              (default ~/mymailmarket-app)
#   --env-file PATH     Source env file to install    (default ~/mymailmarket.env)
#   --keep-env          Reuse the .env.production already on the server
#   --repo URL          Git remote  (default https://github.com/otheloze/mailer.git)
#   --branch NAME       Branch     (default main)
#   --domain HOST       Production domain            (default mymailmarket.com)
#   --node-major N      Required Node major          (default 20)
#   --force-reset       Discard tracked server edits before deploy (destructive)
#   --register          Attempt Node.js app creation over cPanel UAPI (best effort;
#                       needs CPANEL_USER + CPANEL_TOKEN, see try_uapi_register)
#   --check             Preflight only, no changes
#   --dry-run           Print what would happen, change nothing
#   --help              Show this text
#
# =============================================================================

set -Eeuo pipefail

SCRIPT_VERSION="1.0.0"

# ----------------------------------------------------------------------------
# Defaults (override with flags)
# ----------------------------------------------------------------------------
APP_NAME="mymailmarket"
APP_ROOT="${HOME}/mymailmarket-app"
ENV_FILE="${HOME}/mymailmarket.env"
REPO_URL="https://github.com/otheloze/mailer.git"
BRANCH="main"
DOMAIN="mymailmarket.com"
NODE_MAJOR="20"
LOG_DIR="${HOME}/logs"
LOG_FILE=""
DRY_RUN=0
CHECK_ONLY=0
KEEP_ENV=0
FORCE_RESET=0
DO_REGISTER=0

CPANEL_HOST="${CPANEL_HOST:-102.212.246.122}"
CPANEL_PORT="${CPANEL_PORT:-2083}"
CPANEL_USER="${CPANEL_USER:-}"
CPANEL_TOKEN="${CPANEL_TOKEN:-}"
CPANEL_UAPI_MODULE="${CPANEL_UAPI_MODULE:-NodeJS}"
CPANEL_UAPI_FUNCTION="${CPANEL_UAPI_FUNCTION:-create_application}"

STEALTH_MODEL_TAG="mymailmarket-production-deploy"

# Runtime state
STEP_N=0
STEP_TOTAL=11
LOCK_DIR=""
PREV_BUILD=""
WORK_TMP=""

# ----------------------------------------------------------------------------
# Output helpers
# ----------------------------------------------------------------------------
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[36m'
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""
fi

_log() {
  [[ -n "$LOG_FILE" ]] || return 0
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >>"$LOG_FILE" 2>/dev/null || true
}

info() { _log "INFO  $*"; printf '%s\n' "$*"; }
dim()  { _log "INFO  $*"; printf '%s%s%s\n' "$C_DIM" "$*" "$C_RESET"; }
ok()   { _log "OK    $*"; printf '%s %s\n' "${C_GREEN}OK${C_RESET}" "$*"; }
warn() { _log "WARN  $*"; printf '%s %s\n' "${C_YELLOW}WARN${C_RESET}" "$*" >&2; }
fail() { _log "ERROR $*"; printf '%s %s\n' "${C_RED}ERR${C_RESET}" "$*" >&2; }

die() {
  local msg="$1" code="${2:-2}"
  fail "$msg"
  [[ -n "$LOG_FILE" ]] && fail "Full log: $LOG_FILE"
  exit "$code"
}

step() {
  STEP_N=$((STEP_N + 1))
  printf '\n%s[%d/%d] %s%s\n' "$C_BOLD$C_BLUE" "$STEP_N" "$STEP_TOTAL" "$*" "$C_RESET"
  _log "STEP  $STEP_N/$STEP_TOTAL $*"
}

on_error() {
  local code=$? line="$1" cmd="$2"
  fail "Unexpected failure (exit $code) at line $line while running: $cmd"
  [[ -n "$LOG_FILE" ]] && fail "Full log: $LOG_FILE"
}
trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

# Run a command, honouring --dry-run. Only use for side-effecting commands.
run() {
  if (( DRY_RUN )); then
    dim "  DRY-RUN: $*"
    return 0
  fi
  _log "EXEC  $*"
  "$@"
}

# Run a command silently into the log, surfacing output only on failure.
run_quiet() {
  if (( DRY_RUN )); then
    dim "  DRY-RUN: $*"
    return 0
  fi
  _log "EXEC  $*"
  local out
  if ! out="$("$@" 2>&1)"; then
    _log "$out"
    warn "Command failed: $*"
    printf '%s\n' "$out" >&2
    return 1
  fi
  _log "$out"
  return 0
}

# ----------------------------------------------------------------------------
# Argument parsing
# ----------------------------------------------------------------------------
usage() {
  local self="${BASH_SOURCE[0]:-}"
  if [[ -n "$self" && -r "$self" ]]; then
    sed -n '2,58p' "$self" | sed 's/^# \{0,1\}//'
  else
    printf 'Usage: bash deploy-production.sh [options]\n'
    printf 'See the header comment block for every flag.\n'
  fi
}

while (( $# )); do
  case "$1" in
    --app-root)    APP_ROOT="${2:?--app-root needs a path}"; shift 2 ;;
    --env-file)    ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --keep-env)    KEEP_ENV=1; shift ;;
    --repo)        REPO_URL="${2:?--repo needs a URL}"; shift 2 ;;
    --branch)      BRANCH="${2:?--branch needs a name}"; shift 2 ;;
    --domain)      DOMAIN="${2:?--domain needs a host}"; shift 2 ;;
    --node-major)  NODE_MAJOR="${2:?--node-major needs a number}"; shift 2 ;;
    --log-dir)     LOG_DIR="${2:?--log-dir needs a path}"; shift 2 ;;
    --force-reset) FORCE_RESET=1; shift ;;
    --register)    DO_REGISTER=1; shift ;;
    --check)       CHECK_ONLY=1; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --help|-h)     usage; exit 0 ;;
    *)             die "Unknown argument: $1 (try --help)" 1 ;;
  esac
done

APP_NAME="$(basename "$APP_ROOT")"

# ----------------------------------------------------------------------------
# Logging bootstrap + lock
# ----------------------------------------------------------------------------
init_logging() {
  # Created even in dry-run: a missing directory turns every log redirect into
  # noise on stderr, and a dry-run log is worth keeping anyway.
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  LOG_FILE="${LOG_DIR}/deploy-$(date -u '+%Y%m%dT%H%M%SZ').log"
  if ! : >"$LOG_FILE" 2>/dev/null; then
    LOG_FILE=""
    printf 'WARN: cannot write a log file under %s; continuing without one\n' "$LOG_DIR" >&2
    return 0
  fi
  _log "deploy-production.sh v${SCRIPT_VERSION} (${STEALTH_MODEL_TAG})"
  _log "app_root=$APP_ROOT branch=$BRANCH domain=$DOMAIN node_major=$NODE_MAJOR dry_run=$DRY_RUN"
}

acquire_lock() {
  LOCK_DIR="${HOME}/.${APP_NAME}.deploy.lock"
  if (( DRY_RUN )); then return 0; fi
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" >"$LOCK_DIR/pid"
    return 0
  fi
  local other=""
  [[ -f "$LOCK_DIR/pid" ]] && other="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$other" ]] && ! kill -0 "$other" 2>/dev/null; then
    warn "Removing stale deploy lock (pid $other is gone)"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR" && printf '%s\n' "$$" >"$LOCK_DIR/pid"
    return 0
  fi
  die "Another deploy is running (pid ${other:-unknown}, lock $LOCK_DIR). Remove it only if you are sure it is stale." 2
}

release_lock() {
  [[ -n "$LOCK_DIR" && -d "$LOCK_DIR" ]] && rm -rf "$LOCK_DIR" 2>/dev/null || true
}
cleanup() {
  release_lock
  if [[ -n "$WORK_TMP" && -d "$WORK_TMP" ]]; then rm -rf "$WORK_TMP"; fi
}
trap cleanup EXIT

# ----------------------------------------------------------------------------
# Step 1 - preflight
# ----------------------------------------------------------------------------
preflight() {
  step "Preflight checks"

  local os; os="$(uname -s 2>/dev/null || echo unknown)"
  if [[ "$os" != "Linux" ]]; then
    warn "This is '${os}', not Linux. Builds are platform-specific; artefacts will not be portable."
  else
    ok "Target OS: Linux ($(uname -m))"
  fi

  local missing=()
  for cmd in git curl tar; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if (( ${#missing[@]} )); then
    die "Missing required command(s): ${missing[*]}" 1
  fi
  ok "Required commands present: git, curl, tar"

  # cPanel exposes node/npm only inside the app's nodeenv, so their absence on
  # the default PATH is normal for a fresh app; step 2 supplies them.
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    local found_env
    # cPanel ships activate/node/npm as symlinks into its LVE manager, so no -type predicate.
    found_env="$(find "${HOME}/nodevenv" -maxdepth 6 -name activate -path "*/${NODE_MAJOR}/bin/*" -print -quit 2>/dev/null || true)"
    if [[ -n "$found_env" ]]; then
      warn "node/npm are not on the default PATH; they come from the cPanel nodeenv in step 2."
      dim "  found: $found_env"
    else
      die "node and npm are not on PATH and no Node ${NODE_MAJOR}.x nodeenv exists under ~/nodevenv.
  Create the Node.js application in cPanel first (Setup Node.js App)." 1
    fi
  else
    local major; major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if (( major < NODE_MAJOR )); then
      warn "System Node is $(node -v), older than ${NODE_MAJOR}.x; the cPanel nodeenv takes precedence after step 2."
    else
      ok "Node: $(node -v)  npm: $(npm -v)"
    fi
  fi

  # Disk: keep headroom for node_modules plus two .next trees
  local free_kb; free_kb="$(df -Pk "${HOME}" 2>/dev/null | awk 'NR==2 {print $4}')"
  if [[ -n "$free_kb" ]] && (( free_kb < 2000000 )); then
    die "Only $((free_kb / 1024)) MB free on the filesystem holding $HOME; need at least ~2 GB." 1
  else
    ok "Free space: $(( ${free_kb:-0} / 1024 )) MB"
  fi

  if [[ -r /proc/meminfo ]]; then
    local mem_kb; mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
    if (( mem_kb < 1500000 )); then
      warn "Only $((mem_kb / 1024)) MB RAM. A Next.js production build may be OOM-killed on shared hosting."
    else
      ok "Memory: $((mem_kb / 1024)) MB"
    fi
  fi

  if [[ "$(id -u)" == "0" ]]; then
    warn "Running as root. cPanel apps must run as the account user; file ownership will end up wrong."
  fi

  if ! touch "${HOME}/.deploy-write-test.$$" 2>/dev/null; then
    die "Cannot write to $HOME." 1
  fi
  rm -f "${HOME}/.deploy-write-test.$$"
  ok "Home is writable: $HOME"

  if (( ! KEEP_ENV )) && [[ ! -f "$ENV_FILE" ]]; then
    die "Env file not found: $ENV_FILE
  Upload it first:  scp -P 1624 <local .env.production> $(whoami)@${CPANEL_HOST}:${ENV_FILE}
  Or reuse the server copy with --keep-env." 1
  fi

  ok "Preflight passed"
}

# ----------------------------------------------------------------------------
# Step 2 - activate the cPanel Node.js virtualenv
# ----------------------------------------------------------------------------
activate_nodeenv() {
  step "Activate cPanel Node runtime"

  local activate=""
  if [[ -f "${HOME}/nodevenv/${APP_NAME}/${NODE_MAJOR}/bin/activate" ]]; then
    activate="${HOME}/nodevenv/${APP_NAME}/${NODE_MAJOR}/bin/activate"
  elif [[ -d "${HOME}/nodevenv" ]]; then
    # Layout is ~/nodevenv/<app path>/<major>/bin/activate, i.e. several levels deep,
    # and it is a symlink into cPanel's LVE manager (so no -type predicate).
    activate="$(find "${HOME}/nodevenv" -maxdepth 6 -name activate -path "*/${NODE_MAJOR}/bin/*" 2>/dev/null | sort -V | tail -1 || true)"
  fi

  if [[ -n "$activate" ]]; then
    info "cPanel nodeenv: $activate"
    if (( DRY_RUN )); then
      dim "  DRY-RUN: . $activate"
    else
      # Must be sourced in *this* shell or npm ci/build would use system Node.
      set +u
      # shellcheck disable=SC1090
      if ! . "$activate" >/dev/null 2>&1; then
        set -u
        die "Found $activate but could not activate it." 1
      fi
      set -u
    fi
    ok "Node in use: $(node -v)"
    return 0
  fi

  warn "No cPanel nodeenv found under ~/nodevenv/${APP_NAME}/${NODE_MAJOR}."
  warn "The Node.js application has probably not been created yet in cPanel (Setup Node.js App)."
  warn "Using system Node $(node -v) for now; re-run after registering the app."
}

# ----------------------------------------------------------------------------
# Step 3 - sync the repository
# ----------------------------------------------------------------------------
sync_repo() {
  step "Sync repository"

  if [[ -d "$APP_ROOT/.git" ]]; then
    info "Existing checkout found at $APP_ROOT"
    run_quiet git -C "$APP_ROOT" remote set-url origin "$REPO_URL" || true
    run git -C "$APP_ROOT" fetch --prune origin

    if (( ! DRY_RUN )); then
      local dirty
      dirty="$(git -C "$APP_ROOT" status --porcelain --untracked-files=no || true)"
      if [[ -n "$dirty" ]]; then
        warn "Tracked files have local modifications on the server:"
        printf '%s\n' "$dirty" >&2
        if (( ! FORCE_RESET )); then
          die "Refusing to overwrite server-side edits. Commit or stash them, or re-run with --force-reset." 2
        fi
        warn "--force-reset given: discarding tracked server edits"
        run git -C "$APP_ROOT" reset --hard "origin/$BRANCH"
      fi
      run git -C "$APP_ROOT" checkout "$BRANCH" 2>/dev/null || true
      run_quiet git -C "$APP_ROOT" merge --ff-only "origin/$BRANCH" \
        || die "Cannot fast-forward $BRANCH. Server checkout has diverged; resolve manually or use --force-reset." 2
    fi
    ok "Repository at $(git -C "$APP_ROOT" rev-parse --short HEAD 2>/dev/null || echo '(dry-run)')"
    return 0
  fi

  if [[ -d "$APP_ROOT" && -n "$(ls -A "$APP_ROOT" 2>/dev/null || true)" ]]; then
    # cPanel pre-creates a placeholder app at the application root (a sample
    # server.js, public/, tmp/, stderr.log). The repository must WIN for every
    # path it contains, otherwise cPanel's stub server.js survives and the app
    # never starts, so this merges with overwrite instead of skipping.
    info "Application root already populated (cPanel placeholder app); merging the repo over it"
    WORK_TMP="${APP_ROOT}.clone.$$"
    run git clone --branch "$BRANCH" "$REPO_URL" "$WORK_TMP"
    if (( ! DRY_RUN )); then
      local backup
      backup="${HOME}/$(basename "$APP_ROOT").predeploy-$(date -u '+%Y%m%dT%H%M%SZ').tar.gz"
      if tar -czf "$backup" -C "$APP_ROOT" . 2>>"$LOG_FILE"; then
        info "Snapshot of pre-existing files: $backup"
      else
        warn "Could not snapshot $APP_ROOT before merging (contents were cPanel placeholders)"
      fi
      # cp -a merges recursively: repo files replace the placeholder server.js
      # and public/, while cPanel-only tmp/ and stderr.log survive, and .git
      # comes along so later deploys take the fast-forward path.
      cp -a "$WORK_TMP"/. "$APP_ROOT"/
      rm -rf "$WORK_TMP"
      WORK_TMP=""
      for critical in server.js package.json next.config.ts; do
        [[ -f "${APP_ROOT}/${critical}" ]] || die "After merge, ${APP_ROOT}/${critical} is missing." 2
      done
      ok "Repo merged into $APP_ROOT (cPanel placeholders replaced)"
    fi
    ok "Repository populated into $APP_ROOT"
    return 0
  fi

  run git clone --branch "$BRANCH" "$REPO_URL" "$APP_ROOT"
  ok "Cloned $BRANCH into $APP_ROOT"
}

# ----------------------------------------------------------------------------
# Step 4 - install and validate environment
# ----------------------------------------------------------------------------
ENV_REQUIRED=(
  NEXT_PUBLIC_APP_URL
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  RESEND_API_KEY
)
# Read in src/ but legitimately optional (features degrade or return 503).
ENV_OPTIONAL=(
  RESEND_WEBHOOK_SECRET
  DEFAULT_SENDER_DOMAINS
  ORDER_FROM_EMAIL
  ORDER_NOTIFICATION_EMAIL
  NEXT_PUBLIC_PAYPAL_CLIENT_ID
  PAYPAL_CLIENT_ID
  PAYPAL_CLIENT_SECRET
  PAYPAL_ENVIRONMENT
  PAYPAL_WEBHOOK_ID
  PAYSTACK_SECRET_KEY
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  HUNTER_API_KEY
  TRUEHOST_API_URL
  TRUEHOST_API_USERNAME
  TRUEHOST_API_KEY
)

env_keys() { sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' "$1" | sort -u; }

install_env() {
  step "Install production environment"

  local target="${APP_ROOT}/.env.production"
  # In a dry run nothing is written, so validate the file we *would* install.
  local check_file="$target"

  if (( KEEP_ENV )); then
    [[ -f "$target" ]] || die "--keep-env given but $target does not exist." 1
    ok "Reusing existing $target ($(awk 'END {print NR}' "$target") lines)"
  else
    # Strip CR unconditionally: this file is authored on Windows and CRLF breaks values.
    if (( DRY_RUN )); then
      check_file="$ENV_FILE"
      dim "  DRY-RUN: install $ENV_FILE -> $target (chmod 600), validating the source"
    else
      mkdir -p "$APP_ROOT"
      if ! tr -d '\r' <"$ENV_FILE" >"$target.deploy-tmp"; then
        die "Could not read $ENV_FILE" 1
      fi
      mv "$target.deploy-tmp" "$target"
      chmod 600 "$target"
      ok "Installed $target from $ENV_FILE (CRLF stripped, mode 600)"
    fi
  fi

  local line_count
  line_count="$(awk 'END {print NR}' "$check_file" 2>/dev/null || echo 0)"
  if (( line_count < ${#ENV_REQUIRED[@]} )); then
    warn "$check_file has only $line_count line(s); if newlines were lost in transit the values are glued together."
  fi

  # Reject malformed keys early: a stray space silently becomes an invalid env var.
  local bad
  bad="$(sed -e 's/\r$//' -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d' "$check_file" \
        | grep -Ev '^[A-Z_][A-Z0-9_]*=' || true)"
  if [[ -n "$bad" ]]; then
    die "Malformed lines in $check_file (expected KEY=value, no leading spaces or quotes):
$bad" 1
  fi

  # The file must source cleanly: the build inherits NEXT_PUBLIC_* from it.
  if ! ( set -a; . "$check_file"; set +a ) >/dev/null 2>&1; then
    die "$check_file does not source cleanly. Quote values that contain spaces." 1
  fi

  local missing=() k v
  for k in "${ENV_REQUIRED[@]}"; do
    grep -qE "^${k}=.+" "$check_file" || missing+=("$k")
  done
  if (( ${#missing[@]} )); then
    die "Missing required variable(s) in $check_file: ${missing[*]}" 1
  fi
  ok "All $((${#ENV_REQUIRED[@]})) required variables present"

  # A truncated or newline-mangled file shows up here as a glued-together URL,
  # which would otherwise deploy silently and break auth.
  for k in NEXT_PUBLIC_APP_URL NEXT_PUBLIC_SUPABASE_URL; do
    v="$(sed -n "s/^${k}=//p" "$check_file" | tail -1 | tr -d '"' | tr -d "'")"
    if [[ ! "$v" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]]; then
      die "${k} is not a plain https URL: '${v}'
  This is the usual signature of lost newlines when the file was created on Windows."
    fi
  done
  ok "URL variables parse cleanly"

  local absent=()
  for k in "${ENV_OPTIONAL[@]}"; do
    grep -qE "^${k}=.+" "$check_file" || absent+=("$k")
  done
  if (( ${#absent[@]} )); then
    warn "Optional variables not set (related features will report 503): ${absent[*]}"
  fi

  local app_url
  app_url="$(sed -n 's/^NEXT_PUBLIC_APP_URL=//p' "$check_file" | tail -1 | tr -d '"' | tr -d "'")"
  if [[ "$app_url" != "https://${DOMAIN}" ]]; then
    warn "NEXT_PUBLIC_APP_URL is '${app_url}' but expected https://${DOMAIN}. Auth callbacks and payment redirects use it."
  else
    ok "NEXT_PUBLIC_APP_URL = $app_url"
  fi

  # Never let secrets enter version control from the server either.
  if [[ -d "${APP_ROOT}/.git" ]]; then
    if git -C "$APP_ROOT" ls-files --error-unmatch .env.production >/dev/null 2>&1; then
      die ".env.production is tracked by git in this checkout. Untrack it before deploying." 1
    fi
    if ! git -C "$APP_ROOT" check-ignore -q .env.production; then
      warn ".env.production is not covered by .gitignore in this checkout."
    fi
  fi
}

# ----------------------------------------------------------------------------
# Step 5 - dependencies
# ----------------------------------------------------------------------------
install_deps() {
  step "Install dependencies (dev included)"

  if [[ ! -f "${APP_ROOT}/package-lock.json" ]]; then
    if (( DRY_RUN )); then
      warn "No checkout at $APP_ROOT yet (the clone was only simulated), so npm ci cannot be previewed."
      return 0
    fi
    die "package-lock.json missing; npm ci cannot run." 1
  fi

  if (( DRY_RUN )); then
    dim "  DRY-RUN: npm ci --no-audit --no-fund"
    return 0
  fi

  # devDependencies are required at build time, not optional: next.config.ts is
  # TypeScript and Next transpiles it before it can read the config, so a
  # production-only install fails with "Cannot find module 'typescript'" deep
  # inside Next's own CLI.
  #
  # cPanel's nodeenv ships an npm config with omit=dev (verified: `npm config get
  # omit` returns "dev" even with NODE_ENV unset), so dev must be requested
  # explicitly or 462 of the 628 locked packages never install.
  # pipefail makes the pipeline status reflect npm, not tee.
  if ! ( cd "$APP_ROOT" && npm ci --include=dev --no-audit --no-fund --loglevel=error ) 2>&1 | tee -a "$LOG_FILE"; then
    die "npm ci failed (see $LOG_FILE)" 2
  fi

  # Fail here with a clear reason rather than inside Next's config loader.
  if ! ( cd "$APP_ROOT" && node -e 'require.resolve("typescript")' >/dev/null 2>&1 ); then
    die "typescript is still missing after npm ci --include=dev.
  next.config.ts is TypeScript and cannot be transpiled without it." 2
  fi
  ok "Dependencies installed (dev included, typescript resolvable)"
}

# ----------------------------------------------------------------------------
# Step 6 - native image binary
# ----------------------------------------------------------------------------
verify_sharp() {
  step "Verify sharp (next/image)"

  if (( DRY_RUN )); then dim "  DRY-RUN: require('sharp')"; return 0; fi

  local out
  out="$( cd "$APP_ROOT" && node -e 'try{require("sharp");process.stdout.write("ok")}catch(e){process.stdout.write("missing")}' 2>/dev/null || echo missing)"
  if [[ "$out" == "ok" ]]; then
    ok "sharp loads on this platform"
  else
    warn "sharp is not loadable. Local JPEGs in public/images may 500 through the image optimizer."
    warn "Fix later with: cd $APP_ROOT && npm rebuild sharp"
  fi
}

# ----------------------------------------------------------------------------
# Step 7 - build (with rollback)
# ----------------------------------------------------------------------------
build_app() {
  step "Production build"

  if (( DRY_RUN )); then dim "  DRY-RUN: NEXT_PUBLIC_* exported; npm run build"; return 0; fi

  # NEXT_PUBLIC_* are inlined at compile time, so they must exist in this shell.
  set -a; . "${APP_ROOT}/.env.production"; set +a
  export NODE_ENV=production
  export NEXT_TELEMETRY_DISABLED=1

  if [[ -d "${APP_ROOT}/.next" ]]; then
    PREV_BUILD="${APP_ROOT}/.next.prev-$(date -u '+%Y%m%dT%H%M%SZ')"
    mv "${APP_ROOT}/.next" "$PREV_BUILD"
    info "Previous build parked at $PREV_BUILD (kept until health check passes)"
  fi

  local started=$SECONDS
  if ! ( cd "$APP_ROOT" && npm run build ) 2>&1 | tee -a "$LOG_FILE"; then
    fail "npm run build failed. Last 60 log lines:"
    tail -n 60 "$LOG_FILE" >&2 || true
    if [[ -n "$PREV_BUILD" && -d "$PREV_BUILD" ]]; then
      rm -rf "${APP_ROOT}/.next"
      mv "$PREV_BUILD" "${APP_ROOT}/.next"
      warn "Previous build restored; the live site keeps serving it"
      PREV_BUILD=""
    fi
    die "Build failed, deploy aborted" 2
  fi

  [[ -d "${APP_ROOT}/.next" ]] || die "Build reported success but .next is missing." 2
  ok "Build complete in $((SECONDS - started))s ($(du -sh "${APP_ROOT}/.next" 2>/dev/null | cut -f1))"
}

# ----------------------------------------------------------------------------
# Step 8 - Passenger registration
# ----------------------------------------------------------------------------
passenger_registered() {
  local docroot="${HOME}/public_html/.htaccess"
  if [[ -f "$docroot" ]] && grep -q "PassengerAppRoot" "$docroot" 2>/dev/null; then
    return 0
  fi
  # cPanel also writes per-domain .htaccess files for addon/subdomains.
  if grep -rqs --include='.htaccess' "PassengerAppRoot" "${HOME}" 2>/dev/null; then
    return 0
  fi
  return 1
}

try_uapi_register() {
  # Best effort only. The cPanel UI is authoritative; UAPI signatures vary by
  # cPanel build, so success is confirmed by passenger_registered, not by HTTP 200.
  if [[ -z "$CPANEL_USER" || -z "$CPANEL_TOKEN" ]]; then
    warn "--register needs CPANEL_USER and CPANEL_TOKEN (cPanel > Security > Manage API Tokens)"
    return 1
  fi
  local resp
  resp="$(curl -sS --max-time 60 -G \
      -H "Authorization: cpanel ${CPANEL_USER}:${CPANEL_TOKEN}" \
      --data-urlencode "name=${APP_NAME}" \
      --data-urlencode "path=${APP_ROOT}" \
      --data-urlencode "domain=${DOMAIN}" \
      --data-urlencode "app_startup_file=server.js" \
      --data-urlencode "app_mode=production" \
      "https://${CPANEL_HOST}:${CPANEL_PORT}/execute/${CPANEL_UAPI_MODULE}/${CPANEL_UAPI_FUNCTION}" 2>/dev/null || true)"
  _log "UAPI response: ${resp:-<empty>}"
  if [[ "$resp" == *'"status":1'* ]]; then
    return 0
  fi
  warn "UAPI registration did not confirm success: ${resp:-<empty response>}"
  return 1
}

check_registration() {
  step "Verify Passenger application"

  if (( DRY_RUN )); then dim "  DRY-RUN: check ~/.htaccess for PassengerAppRoot"; return 0; fi

  if passenger_registered; then
    ok "Passenger app is registered for this account"
    return 0
  fi

  if (( DO_REGISTER )) && try_uapi_register && passenger_registered; then
    ok "Application registered over UAPI"
    return 0
  fi

  cat >&2 <<EOF

${C_YELLOW}MANUAL STEP REQUIRED${C_RESET} - the Node.js application is not registered yet.
Everything is built and staged at $APP_ROOT; Apache just is not pointing at it.

  cPanel -> Software -> Setup Node.js App -> CREATE APPLICATION
    Node.js version          ${NODE_MAJOR}.x
    Application mode         Production
    Application root         ${APP_ROOT}
    Application URL          ${DOMAIN}
    Application startup file server.js
  Then save, and re-run this script (it will skip the finished steps).

EOF
  exit 3
}

# ----------------------------------------------------------------------------
# Step 9 - restart
# ----------------------------------------------------------------------------
restart_app() {
  step "Restart Passenger"

  run mkdir -p "${APP_ROOT}/tmp"
  run touch "${APP_ROOT}/tmp/restart.txt"
  if (( ! DRY_RUN )); then
    ok "Restart marker touched at $(date -u '+%H:%M:%SZ'); expecting ~10-60s of downtime"
  fi
}

# ----------------------------------------------------------------------------
# Step 10 - health check
# ----------------------------------------------------------------------------
health_check() {
  step "Health check"

  if (( DRY_RUN )); then dim "  DRY-RUN: curl https://${DOMAIN}/api/health"; return 0; fi

  local url="https://${DOMAIN}/api/health" body="" attempt
  for attempt in $(seq 1 18); do
    body="$(curl -fsS --max-time 20 "$url" 2>/dev/null || true)"
    if [[ "$body" == *'"ok":true'* ]]; then
      ok "$url -> $body  (after ${attempt} attempt(s))"
      return 0
    fi
    dim "  attempt ${attempt}/18: ${body:-no response}"
    sleep 5
  done

  # Fall back to HTTP to distinguish "app down" from "TLS/redirect misconfigured".
  body="$(curl -fsS --max-time 20 "http://${DOMAIN}/api/health" 2>/dev/null || true)"
  if [[ "$body" == *'"ok":true'* ]]; then
    warn "App is up over HTTP but not HTTPS. Enable AutoSSL / check the redirect."
    return 0
  fi

  fail "Health check failed after ~90s. Diagnose with:"
  fail "  tail -n 50 ${HOME}/logs/*error* 2>/dev/null"
  fail "  cat ${APP_ROOT}/.htaccess"
  fail "  ls -la ${APP_ROOT}/tmp"
  die "Deploy built successfully but the app is not serving" 2
}

# ----------------------------------------------------------------------------
# Step 11 - summary
# ----------------------------------------------------------------------------
summary() {
  step "Summary"

  if (( DRY_RUN )); then
    ok "Dry run finished; nothing was changed"
    return 0
  fi

  # Only now is the previous build provably unnecessary.
  if [[ -n "$PREV_BUILD" && -d "$PREV_BUILD" ]]; then
    rm -rf "$PREV_BUILD"
    dim "  Removed parked build $PREV_BUILD"
  fi

  printf '\n'
  printf '  %-18s %s\n' "Application root" "$APP_ROOT"
  printf '  %-18s %s\n' "Commit"           "$(git -C "$APP_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown) ($(git -C "$APP_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?'))"
  printf '  %-18s %s\n' "Node / npm"       "$(node -v) / $(npm -v)"
  printf '  %-18s %s\n' "Build size"       "$(du -sh "${APP_ROOT}/.next" 2>/dev/null | cut -f1)"
  printf '  %-18s %s\n' "Env file"         "$(stat -c '%a %n' "${APP_ROOT}/.env.production" 2>/dev/null || echo missing)"
  printf '  %-18s %s\n' "Live URL"         "https://${DOMAIN}"
  printf '  %-18s %s\n' "Log"              "$LOG_FILE"
  printf '  %-18s %s\n' "Total time"       "$((SECONDS - ${START_EPOCH:-0}))s"
  printf '\n'

  cat <<EOF
${C_BOLD}Still to confirm outside this script${C_RESET}
  - Supabase Auth -> URL Configuration: add https://${DOMAIN}/auth/callback to redirect URLs
  - Resend / PayPal / Paystack webhooks -> point at https://${DOMAIN}/api/webhooks/*
  - Apache ProxyTimeout: the campaign send route exceeds the default; ask the host to raise it
  - X-Forwarded-Proto must be forwarded or the auth callback builds http redirects
EOF
  ok "Deploy finished"
}

# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
main() {
  START_EPOCH=$SECONDS
  init_logging
  printf '\n%sMYMAILMARKET production deploy%s  v%s  ->  %s\n' \
    "$C_BOLD" "$C_RESET" "$SCRIPT_VERSION" "$APP_ROOT"
  (( DRY_RUN )) && warn "DRY RUN: no changes will be made"

  acquire_lock
  preflight

  if (( CHECK_ONLY )); then
    ok "Preflight only (--check): stopping here"
    exit 0
  fi

  activate_nodeenv
  sync_repo
  install_env
  install_deps
  verify_sharp
  build_app
  check_registration
  restart_app
  health_check
  summary
}

main "$@"

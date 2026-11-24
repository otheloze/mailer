#!/bin/bash
# =============================================================================
# build-artifact.sh -- produce a deployable .next WITHOUT building on the host.
#
# Why this exists: the cPanel account is capped at ~1 GB of LVE memory, and
# `next build` needs more. The cap cannot be raised, so the build runs in a
# Linux container on the developer's machine and only .next is uploaded.
#
# This script runs INSIDE the container (see deploy-artifact.ps1 for the
# orchestrator). It builds at the same absolute path the server uses
# (/home/jlazxdoi/api) so no container-specific path can leak into the output.
#
# Layout inside the container:
#   /src    read-only mount of the repository working tree
#   /out    writable mount where next.tgz is written
#   $APP    build directory, volume-backed (default /home/jlazxdoi/api)
#
# Environment (all optional except NEXT_PUBLIC_*):
#   APP, SRC, OUT
#   NEXT_PUBLIC_* ...  inlined into the client bundle at build time, so the
#                      production values MUST be passed in via --env-file.
# =============================================================================
set -Eeuo pipefail

APP="${APP:-/home/jlazxdoi/api}"
SRC="${SRC:-/src}"
OUT="${OUT:-/out}"

step() { printf '\n==> %s\n' "$*"; }
die()  { printf 'ERR %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Stage the source
# ---------------------------------------------------------------------------
step "Staging source: $SRC -> $APP"
[[ -d "$SRC" ]] || die "source mount $SRC is missing"
# Wiping APP would destroy the repository if the two paths ever coincide.
[[ "$APP" -ef "$SRC" ]] && die "APP ($APP) and SRC ($SRC) are the same directory"
mkdir -p "$APP"

# The build directory is a reused volume, so whatever an earlier run (or a hand
# copy) left behind survives staging and reaches the artifact:
#   - an .env* file, because Next only skips a .env value when process.env
#     already defines it, so a stale .env.local would bake developer values into
#     a production bundle even though --env-file supplies the real ones;
#   - a source file the repository has since deleted or renamed, because the
#     tarball below only adds and overwrites, so the stale copy is still
#     compiled in and the build stops matching the commit it claims to be.
# Wipe the directory instead. node_modules is kept because `npm ci` deletes and
# reinstalls it anyway, and it is the slowest part of a run.
find "$APP" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} + 2>/dev/null || true

# node_modules is excluded because the bind-mounted copy is a Windows install
# (wrong platform binaries); .next because it must be produced fresh; .git
# because a build never reads it; desktop/ because the Electron app is built
# separately and its node_modules and installers are large.
#
# Every .env* file is excluded except the committed example: the build must see
# exactly the variables passed in via --env-file. Staging .env.local would let
# developer values (e.g. NEXT_PUBLIC_* pointing at localhost) be inlined into a
# production bundle, because Next only skips a .env value when process.env
# already defines it.
( cd "$SRC" && tar -cf - \
    --exclude=./node_modules \
    --exclude=./.next \
    --exclude=./.git \
    --exclude=./desktop \
    --exclude=./.env \
    --exclude=./.env.local \
    --exclude=./.env.production \
    --exclude=./.env.production.local \
    --exclude=./.env.development \
    --exclude=./.env.development.local \
    . ) | ( cd "$APP" && tar -xf - )

for critical in package.json package-lock.json next.config.ts server.js; do
  [[ -f "$APP/$critical" ]] || die "$critical missing after staging"
done
cd "$APP"

step "Runtime: $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------------------
# 2. Dependencies (dev included: next.config.ts needs typescript)
# ---------------------------------------------------------------------------
step "npm ci --include=dev"
npm ci --include=dev --no-audit --no-fund --loglevel=error
node -e 'require.resolve("typescript")' >/dev/null 2>&1 \
  || die "typescript is not resolvable; next.config.ts cannot be transpiled"

# The artifact must be built by the same Next version the server runs.
BUILD_NEXT="$(node -e 'process.stdout.write(require("next/package.json").version)')"
step "next version at build time: $BUILD_NEXT"

# ---------------------------------------------------------------------------
# 3. Build
# ---------------------------------------------------------------------------
step "next build (NODE_ENV=production)"
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
npm run build

[[ -f "$APP/.next/BUILD_ID" ]] || die ".next/BUILD_ID missing; build did not complete"

# ---------------------------------------------------------------------------
# 4. Package the artifact
# ---------------------------------------------------------------------------
step "Packaging .next -> $OUT/next.tgz"
# $OUT is usually a bind mount that already exists. `mkdir -p` on an existing
# Docker Desktop bind mount can fail with EEXIST, and `set -e` would abort the
# whole run *after* a successful build, so check writability instead.
[[ -d "$OUT" ]] || mkdir -p "$OUT" || die "cannot create $OUT"
[[ -w "$OUT" ]] || die "$OUT is not writable"
tar -czf "$OUT/next.tgz" -C "$APP" .next || die "failed to package .next"
[[ -s "$OUT/next.tgz" ]] || die "next.tgz was not created"

step "Done"
printf 'build_id=%s\n' "$(cat "$APP/.next/BUILD_ID")"
printf 'tarball=%s\n' "$(du -h "$OUT/next.tgz")"

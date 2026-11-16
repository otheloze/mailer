#!/bin/bash
# =============================================================================
# pin-app-pool.sh -- keep the Node.js app on a single warm instance.
#
# The account has a ~1 GB LVE cap and the Next.js process uses ~240 MB. The
# default PassengerMaxPoolSize (6) makes Passenger fork extra app instances
# under load; those forks fail with EAGAIN and the web server answers 503.
# Keeping exactly one instance (and never idling it out) avoids the failed
# spawns; concurrent requests queue inside Passenger instead.
#
# cPanel rewrites public_html/.htaccess whenever the Node.js application is
# re-registered, which silently drops these directives, so re-run this after any
# change in Setup Node.js App. It is idempotent and backs up the file first.
#
# usage: bash pin-app-pool.sh [app-root]     (default /home/jlazxdoi/api)
# =============================================================================
set -eu

APP="${1:-/home/jlazxdoi/api}"
HT="/home/jlazxdoi/public_html/.htaccess"

[[ -f "$HT" ]] || { echo "ERR $HT missing" >&2; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
cp -p "$HT" "$HT.bak-$stamp"
echo "backup: $HT.bak-$stamp"

if grep -q '^PassengerMaxPoolSize' "$HT"; then
  echo "pool limits already present; leaving file untouched"
else
  sed -i 's|^# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END|PassengerMaxPoolSize 1\nPassengerMinInstances 1\n# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END|' "$HT"
  echo "inserted pool limits"
fi

echo "--- effective passenger config:"
grep -n 'Passenger' "$HT"

mkdir -p "$APP/tmp"
touch "$APP/tmp/restart.txt"
echo "restart triggered"

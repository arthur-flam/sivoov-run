#!/usr/bin/env bash
# Headless screenshots of every key screen, app and web. See docs/SHOTS.md.
#
#   ./scripts/shots.sh                 design loop: the app at `phone`, plus the web pages
#   ./scripts/shots.sh --store         store sizes: exact App Store and Play pixel dimensions
#   ./scripts/shots.sh --all           every preset
#   ./scripts/shots.sh --app|--web     one surface only
#   ./scripts/shots.sh run-live home   only the scenes whose name matches
#
# Everything lands in docs/shots/<preset>/<scene>.png with a contact sheet at
# docs/shots/index.html. The local Worker and Metro are started if they are not already up.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_PRESETS="phone"
WEB_PRESETS="web-mobile,web-desktop"
DO_APP=1
DO_WEB=1
GREP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --store) APP_PRESETS="store-ios,store-android"; DO_WEB=0 ;;
    --all)   APP_PRESETS="phone,phone-en,store-ios,store-android" ;;
    --app)   DO_WEB=0 ;;
    --web)   DO_APP=0 ;;
    --presets) shift; APP_PRESETS="$1" ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 1 ;;
    *) GREP="${GREP:+$GREP|}$1" ;;
  esac
  shift
done

# A shot of a screen with no race in it is worth nothing: make sure local D1/R2 have one.
npm run db:migrate:local -w api >/dev/null 2>&1 || true
npm run seed -w api -- local >/dev/null 2>&1 || echo "seed failed; screenshots may be empty" >&2
# Sample runs (a finish, a stop, a simulation) so the activity screens show real-looking data.
npm run seed:runs -w api -- local >/dev/null 2>&1 || echo "sample runs failed; activity screenshots may be empty" >&2
# Sign-in codes are capped at 5 per hour per entrant, which a repeated shots run would hit.
# The local D1 is disposable, so wipe the codes and start every run from zero.
( cd api && npx wrangler d1 execute sivoov-run --local --env local \
    --command "DELETE FROM auth_codes; DELETE FROM organizer_codes;" >/dev/null 2>&1 ) || true


if [ "$DO_WEB" = 1 ]; then
  echo "→ web pages ($WEB_PRESETS)"
  ( cd api && SHOTS_PRESETS="$WEB_PRESETS" npx playwright test -c playwright.shots.config.ts ${GREP:+--grep "$GREP"} )
fi

if [ "$DO_APP" = 1 ]; then
  echo "→ app screens ($APP_PRESETS)"
  # The setup project signs in for the whole matrix, so --grep must always keep it.
  ( cd app && SHOTS_PRESETS="$APP_PRESETS" npx playwright test -c playwright.shots.config.ts ${GREP:+--grep "sign in once|$GREP"} )
fi

node scripts/contact-sheet.mjs
echo "→ docs/shots/index.html"

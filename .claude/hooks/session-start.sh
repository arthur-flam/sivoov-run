#!/bin/bash
# SessionStart hook: make tests, typecheck and lint runnable in Claude Code on the web.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Workspaces are installed from the root lockfile. Idempotent; the container state is
# cached after the hook, so repeated installs are fast.
if [ -f package.json ]; then
  npm install --no-audit --no-fund --loglevel=error
fi

# Local Worker state (D1/R2 under .wrangler/) if the api workspace exists and has migrations.
if [ -f api/package.json ] && [ -d api/migrations ]; then
  (cd api && npm run db:migrate:local --if-present --silent) || echo "warn: local migrations failed, run them manually"
fi

# Playwright uses the pre-installed Chromium; never download browsers here.
echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' >> "$CLAUDE_ENV_FILE"
echo 'export CI=true' >> "$CLAUDE_ENV_FILE"
echo 'export EXPO_NO_TELEMETRY=1' >> "$CLAUDE_ENV_FILE"

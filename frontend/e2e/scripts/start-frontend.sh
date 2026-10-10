#!/usr/bin/env bash
# Builds and starts the production Next.js server for the e2e suite, in rewrite
# mode: the browser calls /api on this origin and Next forwards it to Django.
# NEXT_PUBLIC_* values are inlined at build time, so they are set for the build.
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_PORT="${E2E_BACKEND_PORT:-8101}"
FRONTEND_PORT="${E2E_FRONTEND_PORT:-3100}"

export NEXT_PUBLIC_API_URL=/api
export BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
export NEXT_PUBLIC_WS_URL="ws://127.0.0.1:${BACKEND_PORT}"
export NEXT_PUBLIC_SITE_URL="http://127.0.0.1:${FRONTEND_PORT}"
export REVALIDATE_SECRET="${E2E_REVALIDATE_SECRET:-e2e-revalidate-secret}"
# Never inherit a developer's Google client id: the login button would load Google's script
export NEXT_PUBLIC_GOOGLE_CLIENT_ID=

cd "$FRONTEND_DIR"
# E2E_SKIP_BUILD=1 reuses the last build (it must have been made with these same values)
if [[ "${E2E_SKIP_BUILD:-}" != "1" ]]; then
  npm run build
fi
exec npm run start -- --hostname 127.0.0.1 --port "$FRONTEND_PORT"

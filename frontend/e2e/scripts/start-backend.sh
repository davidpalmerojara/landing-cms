#!/usr/bin/env bash
# Starts the backend for the e2e suite: a throwaway SQLite database with the
# migrations applied, served by Daphne (ASGI, so WebSockets work).
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$(cd "$E2E_DIR/../../backend" && pwd)"
BACKEND_PORT="${E2E_BACKEND_PORT:-8101}"
FRONTEND_PORT="${E2E_FRONTEND_PORT:-3100}"

if [[ -n "${E2E_PYTHON:-}" ]]; then
  PYTHON="$E2E_PYTHON"
elif [[ -x "$BACKEND_DIR/venv/bin/python" ]]; then
  PYTHON="$BACKEND_DIR/venv/bin/python"
else
  PYTHON="python"
fi

# Nothing from a developer's own backend/.env may leak into the run
unset DATABASE_URL REDIS_URL

export DJANGO_DEBUG=True
export DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
export SQLITE_PATH="${E2E_SQLITE_PATH:-$BACKEND_DIR/e2e.sqlite3}"
export FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"
export CORS_ALLOWED_ORIGINS="http://127.0.0.1:${FRONTEND_PORT},http://localhost:${FRONTEND_PORT}"
export CSRF_TRUSTED_ORIGINS="$CORS_ALLOWED_ORIGINS"
export REVALIDATE_SECRET="${E2E_REVALIDATE_SECRET:-e2e-revalidate-secret}"
export AI_DEMO_MODE=True
export AI_DEMO_DELAY_SECONDS=0
export EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
# Every test starts guests from the same IP; the default (5/hour) would stop the suite
export GUEST_CREATION_RATE="${GUEST_CREATION_RATE:-1000/hour}"
# Same for register, join and token refresh (10/minute per IP by default)
export AUTH_RATE="${AUTH_RATE:-1000/minute}"

cd "$BACKEND_DIR"
rm -f "$SQLITE_PATH"
"$PYTHON" manage.py migrate --noinput
"$PYTHON" manage.py seed_plans
exec "$PYTHON" -m daphne -b 127.0.0.1 -p "$BACKEND_PORT" config.asgi:application

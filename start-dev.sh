#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_VENV="$BACKEND_DIR/venv"
BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
NODE_VERSION="${NODE_VERSION:-20.19.0}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  local exit_code=$?

  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  exit "${exit_code}"
}

trap cleanup INT TERM EXIT

require_file() {
  local file_path="$1"
  local label="$2"

  if [[ ! -f "${file_path}" ]]; then
    echo "Falta ${label}: ${file_path}" >&2
    exit 1
  fi
}

echo "Verificando entorno..."
require_file "$BACKEND_DIR/manage.py" "backend/manage.py"
require_file "$BACKEND_VENV/bin/activate" "backend/venv/bin/activate"
require_file "$BACKEND_DIR/.env" "backend/.env"
require_file "$FRONTEND_DIR/package.json" "frontend/package.json"
require_file "$FRONTEND_DIR/.env.local" "frontend/.env.local"

if [[ ! -f "$HOME/.nvm/nvm.sh" ]]; then
  echo "No se encontró nvm en \$HOME/.nvm/nvm.sh" >&2
  exit 1
fi

echo "Aplicando migraciones del backend..."
(
  cd "$BACKEND_DIR"
  source "$BACKEND_VENV/bin/activate"
  python manage.py migrate
)

echo "Arrancando backend en http://localhost:${BACKEND_PORT} ..."
(
  cd "$BACKEND_DIR"
  source "$BACKEND_VENV/bin/activate"
  exec python manage.py runserver "${BACKEND_PORT}"
) &
BACKEND_PID=$!

echo "Arrancando frontend en http://localhost:${FRONTEND_PORT} con Node ${NODE_VERSION} ..."
(
  cd "$FRONTEND_DIR"
  source "$HOME/.nvm/nvm.sh"
  nvm use "${NODE_VERSION}" >/dev/null
  exec npm run dev -- --port "${FRONTEND_PORT}"
) &
FRONTEND_PID=$!

echo
echo "Proyecto arrancado."
echo "- Frontend: http://localhost:${FRONTEND_PORT}"
echo "- Backend:  http://localhost:${BACKEND_PORT}/api"
echo
echo "Pulsa Ctrl+C para detener ambos procesos."

wait "$BACKEND_PID" "$FRONTEND_PID"

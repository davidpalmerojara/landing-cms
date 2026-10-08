#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_VENV="$BACKEND_DIR/venv"
BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
NODE_VERSION="${NODE_VERSION:-$(cat "$ROOT_DIR/.nvmrc")}"

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
  local hint="$3"

  if [[ ! -f "${file_path}" ]]; then
    echo "Falta ${label}. ${hint}" >&2
    exit 1
  fi
}

# Use nvm if it is installed; otherwise accept whatever Node is on PATH
# as long as it meets the minimum version in .nvmrc.
use_node() {
  if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm use "${NODE_VERSION}" >/dev/null
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "No se encontró Node. Instala Node ${NODE_VERSION} o superior." >&2
    exit 1
  fi

  if ! node -e '
    const [a, b] = process.argv.slice(1).map((v) => v.replace(/^v/, "").split(".").map(Number));
    process.exit(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))) ? 0 : 1);
  ' "$(node -v)" "${NODE_VERSION}"; then
    echo "Node $(node -v) es demasiado antiguo. Hace falta ${NODE_VERSION} o superior." >&2
    exit 1
  fi
}

echo "Verificando entorno..."
require_file "$BACKEND_VENV/bin/activate" "backend/venv" "Ejecuta: make install"
require_file "$BACKEND_DIR/.env" "backend/.env" "Ejecuta: make env"
require_file "$FRONTEND_DIR/.env.local" "frontend/.env.local" "Ejecuta: make env"
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Faltan las dependencias del frontend. Ejecuta: make install" >&2
  exit 1
fi
use_node

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

echo "Arrancando frontend en http://localhost:${FRONTEND_PORT} con Node $(node -v) ..."
(
  cd "$FRONTEND_DIR"
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

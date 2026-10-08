BACKEND_DIR := backend
FRONTEND_DIR := frontend
PYTHON ?= $(shell command -v python3.13 2>/dev/null || echo python3)
VENV := $(BACKEND_DIR)/venv
VENV_BIN := venv/bin

UV_COMPILE := uv pip compile requirements.in -o requirements.txt --python-version 3.13 --universal --generate-hashes

.PHONY: install env dev backend frontend migrate test test-backend test-frontend lint typecheck build check lock lock-upgrade

# --- Setup ---

install: env
	test -d $(VENV) || $(PYTHON) -m venv $(VENV)
	cd $(BACKEND_DIR) && $(VENV_BIN)/pip install --require-hashes -r requirements.txt
	cd $(FRONTEND_DIR) && npm ci

# Create local env files from the templates, never overwriting existing ones.
env:
	test -f $(BACKEND_DIR)/.env || cp $(BACKEND_DIR)/.env.example $(BACKEND_DIR)/.env
	test -f $(FRONTEND_DIR)/.env.local || cp $(FRONTEND_DIR)/.env.example $(FRONTEND_DIR)/.env.local

# --- Run ---

dev:
	./start-dev.sh

backend:
	cd $(BACKEND_DIR) && $(VENV_BIN)/python manage.py runserver 8001

frontend:
	cd $(FRONTEND_DIR) && npm run dev

migrate:
	cd $(BACKEND_DIR) && $(VENV_BIN)/python manage.py migrate

# --- Quality (same steps as CI) ---

test: test-backend test-frontend

test-backend:
	cd $(BACKEND_DIR) && $(VENV_BIN)/pytest -q

test-frontend:
	cd $(FRONTEND_DIR) && npm test

lint:
	cd $(FRONTEND_DIR) && npm run lint

typecheck:
	cd $(FRONTEND_DIR) && npm run typecheck

build:
	cd $(FRONTEND_DIR) && npm run build

check: test typecheck lint build

# --- Python lockfile (requires uv) ---

lock:
	cd $(BACKEND_DIR) && $(UV_COMPILE)

lock-upgrade:
	cd $(BACKEND_DIR) && $(UV_COMPILE) --upgrade

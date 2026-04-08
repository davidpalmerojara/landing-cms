BACKEND_DIR := backend
FRONTEND_DIR := frontend
NODE_VERSION ?= 20.19.0

.PHONY: dev backend frontend migrate test test-backend test-frontend lint typecheck

dev:
	./start-dev.sh

backend:
	cd $(BACKEND_DIR) && . venv/bin/activate && python manage.py runserver 8001

migrate:
	cd $(BACKEND_DIR) && . venv/bin/activate && python manage.py migrate

frontend:
	zsh -lc 'source "$$HOME/.nvm/nvm.sh" && nvm use $(NODE_VERSION) >/dev/null && cd $(FRONTEND_DIR) && npm run dev'

test: test-backend test-frontend

test-backend:
	cd $(BACKEND_DIR) && . venv/bin/activate && pytest -q

test-frontend:
	zsh -lc 'source "$$HOME/.nvm/nvm.sh" && nvm use $(NODE_VERSION) >/dev/null && cd $(FRONTEND_DIR) && npx vitest run'

lint:
	zsh -lc 'source "$$HOME/.nvm/nvm.sh" && nvm use $(NODE_VERSION) >/dev/null && cd $(FRONTEND_DIR) && npm run lint -- --max-warnings 48'

typecheck:
	zsh -lc 'source "$$HOME/.nvm/nvm.sh" && nvm use $(NODE_VERSION) >/dev/null && cd $(FRONTEND_DIR) && npx tsc --noEmit'

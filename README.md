# Paxl

Editor visual de landing pages SaaS con Next.js + React + TypeScript en frontend y Django + DRF en backend.

## Arranque rápido

Requisitos:
- `backend/venv` creado e instalado
- `backend/.env`
- `frontend/.env.local`
- `nvm` disponible
- Node `20.19.0`

Desde la raíz:

```bash
./start-dev.sh
```

Esto:
- ejecuta migraciones
- arranca backend en `http://localhost:8001`
- arranca frontend en `http://localhost:3000`
- detiene ambos procesos con `Ctrl+C`

## Comandos útiles

```bash
make dev
make migrate
make backend
make frontend
make test
make test-backend
make test-frontend
make lint
make typecheck
```

## Arranque manual

Backend:

```bash
cd /Users/davidpalmero/Desktop/landing-cms
source backend/venv/bin/activate
cd backend
python manage.py migrate
python manage.py runserver 8001
```

Frontend:

```bash
cd /Users/davidpalmero/Desktop/landing-cms
source "$HOME/.nvm/nvm.sh"
nvm use 20.19.0
cd frontend
npm ci
npm run dev
```

## URLs locales

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8001/api`

## Variables de entorno

Plantillas disponibles:
- `backend/.env.example`
- `frontend/.env.example`

Archivos locales esperados:
- `backend/.env`
- `frontend/.env.local`

# Paxl

[![CI](https://github.com/davidpalmerojara/landing-cms/actions/workflows/ci.yml/badge.svg)](https://github.com/davidpalmerojara/landing-cms/actions/workflows/ci.yml)

Editor visual de landing pages. Frontend en Next.js + React + TypeScript; backend en Django + Django REST Framework.

## Requisitos

- Python 3.13
- Node 20.19 o superior (la versión exacta está en `.nvmrc`; con nvm basta `nvm use`)
- `make`

No hace falta ningún servicio externo: en local se usa SQLite, una capa de canales en memoria y el email se imprime en la consola.

## Arranque rápido

```bash
make install   # crea backend/venv, instala dependencias y copia los .env de ejemplo
make migrate   # crea la base de datos SQLite
make dev       # arranca backend y frontend; Ctrl+C para parar los dos
```

- Frontend: http://localhost:3000
- API: http://localhost:8001/api

`make install` no sobrescribe un `backend/.env` ni un `frontend/.env.local` que ya existan. Las variables están documentadas en `backend/.env.example` y `frontend/.env.example`.

## Comandos

| Comando | Qué hace |
|---|---|
| `make dev` | Backend (8001) y frontend (3000) a la vez |
| `make backend` / `make frontend` | Cada parte por separado |
| `make test` | Tests de backend (pytest) y frontend (Vitest) |
| `make typecheck` / `make lint` / `make build` | Comprobaciones del frontend |
| `make check` | Todo lo anterior, los mismos pasos que el CI |
| `make lock` | Regenera el lockfile de Python desde `backend/requirements.in` (requiere [uv](https://docs.astral.sh/uv/)) |

## Documentación

- `DECISIONS.md`: decisiones de arquitectura (ADR).
- `docs/bugs-notables.md`: fallos encontrados y cómo se verificó el arreglo.

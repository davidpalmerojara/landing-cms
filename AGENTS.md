# AGENTS.md

## Descripción
Paxl es un editor visual de landing pages SaaS. Stack principal: Next.js App Router + React + TypeScript + Zustand en frontend, Django + DRF en backend. En `settings.py` el backend usa SQLite por defecto en local y PostgreSQL cuando existe `DATABASE_URL`. La autenticación combina JWT en cookies/httpOnly + fallback en localStorage, Google OAuth y Magic Links. La librería de media usa `Asset.file`; hoy persiste en storage Django local (`backend/media/`) y está preparada para evolucionar a S3 vía configuración de storage.

## Estructura Del Repositorio
```text
.
├── backend/          Django monolith: apps, API DRF, modelos, tests y configuración
├── frontend/         Next.js App Router: editor, dashboard, bloques, store, hooks y tests Vitest
├── docs/             mockups y referencias visuales del producto
├── infrastructure/   configuración de edge/proxy (`Caddyfile`)
├── CLAUDE.md         documentación auxiliar existente
└── AGENTS.md         guía operativa para trabajo autónomo
```

Ubicación real:
- Frontend: `frontend/`
- Backend: `backend/`
- Tests backend: `backend/accounts/tests/`, `backend/pages/tests/`, `backend/tests/`
- Tests frontend: `frontend/__tests__/`
- Configuración: `frontend/package.json`, `frontend/vitest.config.ts`, `frontend/eslint.config.mjs`, `frontend/tsconfig.json`, `backend/requirements.txt`, `backend/pytest.ini`, `backend/config/settings.py`, `backend/config/urls.py`

## Cómo Levantar El Entorno
Hay un script de arranque en raíz y un `Makefile` para el flujo diario.

Arranque recomendado:
```bash
./start-dev.sh
```

Este script:
- valida `backend/.env`, `frontend/.env.local`, `backend/venv` y `nvm`
- ejecuta migraciones
- arranca backend en `8001`
- arranca frontend en `3000`
- detiene ambos procesos al hacer `Ctrl+C`

Atajos disponibles:
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

Arranque manual, si hace falta depurar:

Frontend:
```bash
cd frontend
npm ci
```

Backend:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Migraciones:
```bash
cd backend
source venv/bin/activate
python manage.py migrate
```

Servidor frontend:
```bash
cd frontend
npm run dev
```

Servidor backend:
```bash
cd backend
source venv/bin/activate
python manage.py runserver 8001
```

Comandos útiles adicionales:
```bash
cd backend && source venv/bin/activate && python manage.py seed
cd backend && source venv/bin/activate && python manage.py seed_plans
cd backend && source venv/bin/activate && python manage.py cleanup_magic_tokens
cd backend && source venv/bin/activate && python manage.py check_domains
```

Variables de entorno detectadas:
- Frontend: `NEXT_PUBLIC_API_URL` URL base del backend; `NEXT_PUBLIC_GOOGLE_CLIENT_ID` client ID de Google OAuth para Next.js.
- Backend: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `DEFAULT_FROM_EMAIL`, `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_MONTHLY`, `STRIPE_PRO_PRICE_YEARLY`, `REDIS_URL`.

Nota operativa: `start-dev.sh` usa por defecto `frontend:3000` y `backend:8001`. Se puede sobrescribir con `FRONTEND_PORT`, `BACKEND_PORT` y `NODE_VERSION`.

## Cómo Ejecutar Tests
Frameworks:
- Backend: `pytest` + `pytest-django` + `factory-boy`
- Frontend: `Vitest` + Testing Library + `jsdom`
- E2E: No configurado

Backend:
```bash
cd backend
source venv/bin/activate
pytest
pytest pages/tests/test_views.py
pytest pages/tests/test_views.py::TestPageCRUD::test_list_pages
pytest -vv
pytest --cov=. --cov-report=term-missing
```

Backend, dónde mirar:
- Tests: `backend/accounts/tests/`, `backend/pages/tests/`
- Fixtures globales: `backend/conftest.py`
- Factories: `backend/tests/factories.py`

Frontend:
```bash
cd frontend
npm test
npm test -- __tests__/store/editor-store.test.ts
npm test -- __tests__/store/editor-store.test.ts -t "addBlock"
npm run test:coverage
```

Frontend, dónde mirar:
- Tests: `frontend/__tests__/`
- Setup global: `frontend/vitest.setup.ts`
- Helpers/page objects/fixtures E2E: No configurado

Linting, formateo y type checking:
```bash
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
```

Estado:
- ESLint frontend: configurado
- Type checking frontend: configurado vía `tsconfig.json`
- Formateo frontend: No configurado
- Lint Python: No configurado
- Formateo Python: No configurado
- `mypy`: No configurado

## Modelo De Datos
Jerarquía principal:
- `Workspace` -> agrupa páginas y assets; pertenece a `User` mediante `owner`.
- `Page` -> pertenece a `owner` y opcionalmente a `workspace`; contiene `blocks`, `collaborators`, tema, design tokens, SEO y estado `draft/published`.
- `Block` -> pertenece a `Page`; guarda `type`, `order`, `data` y `styles` en JSON.

Relaciones relevantes:
- `User` (`accounts.User`) extiende `AbstractUser`, usa UUID y tiene `avatar`, `google_id`, `ai_provider`, `ai_api_key`.
- `Page.collaborators` permite edición compartida.
- `PageVersion` guarda snapshots completos de bloques y metadata de página.
- `Asset` representa media subida por usuario/workspace.
- `CustomDomain` vincula dominios personalizados a una `Page`.
- `Subscription` es `OneToOne` con `Workspace`; `Plan` gobierna límites/features.
- `AnalyticsEvent` guarda eventos anónimos de páginas publicadas.
- `AIGenerationLog` registra uso y coste estimado de IA.

Block schemas:
- En backend, `BlockSerializer` trata `data` como JSON genérico; los schemas efectivos viven en `backend/ai_generation/block_schemas.py` y `frontend/lib/block-registry.ts`.
- Tipos soportados: `navbar`, `hero`, `features`, `testimonials`, `cta`, `footer`, `pricing`, `faq`, `logoCloud`, `gallery`, `contact`, `customHtml`, `team`, `stats`, `timeline`.
- Campos `data` por tipo:
  - `navbar`: `brandName`, `logoImage`, `link1`, `link2`, `link3`, `ctaText`
  - `hero`: `title`, `subtitle`, `buttonText`, `badgeText`, `secondaryButtonText`, `backgroundImage`, `alignment`
  - `features`: `title`, `feature1Title`, `feature1Desc`, `feature2Title`, `feature2Desc`
  - `testimonials`: `title`, `quote1`, `author1`, `role1`, `quote2`, `author2`, `role2`
  - `cta`: `title`, `subtitle`, `buttonText`
  - `footer`: `brandName`, `description`, `copyright`, `link1Label`, `link2Label`, `link3Label`
  - `pricing`: `title`, `subtitle`, `plan1Name`, `plan1Price`, `plan1Features`, `plan1ButtonText`, `plan2Name`, `plan2Price`, `plan2Features`, `plan2ButtonText`, `plan2Highlighted`, `billingPeriod`, `popularBadgeText`
  - `faq`: `title`, `q1`, `a1`, `q2`, `a2`, `q3`, `a3`
  - `logoCloud`: `title`, `logo1`, `logo2`, `logo3`, `logo4`, `logo5`
  - `gallery`: `title`, `subtitle`, `columns`, `image1`, `image2`, `image3`, `image4`, `image5`, `image6`
  - `contact`: `title`, `subtitle`, `buttonText`, `namePlaceholder`, `emailPlaceholder`, `messagePlaceholder`
  - `customHtml`: `html`
  - `team`: `title`, `subtitle`, `member1Name`, `member1Role`, `member1Image`, `member2Name`, `member2Role`, `member2Image`, `member3Name`, `member3Role`, `member3Image`
  - `stats`: `title`, `subtitle`, `stat1Value`, `stat1Label`, `stat2Value`, `stat2Label`, `stat3Value`, `stat3Label`, `stat4Value`, `stat4Label`
  - `timeline`: `title`, `item1Date`, `item1Title`, `item1Desc`, `item2Date`, `item2Title`, `item2Desc`, `item3Date`, `item3Title`, `item3Desc`

## Endpoints De La API
Públicos:
- Auth: `POST /api/auth/register/`, `POST /api/auth/login/`, `POST /api/auth/refresh/`, `POST /api/auth/logout/`, `POST /api/auth/google/`, `POST /api/auth/magic/request/`, `POST /api/auth/magic/verify/`
- Pages públicas: `GET /api/public/pages/{slug}/`, `GET /api/sitemap/`, `GET /api/public/sitemap-data/`, `GET /api/public/resolve-domain/?domain=...`
- Analytics ingest: `POST /api/analytics/collect/`
- Billing público: `GET /api/billing/plans/`, `POST /api/billing/webhook/`

Autenticados:
- Auth: `GET /api/auth/me/`, `GET|PUT /api/auth/ai-settings/`
- Pages: `GET|POST /api/pages/`, `GET|PUT|PATCH|DELETE /api/pages/{id}/`, `POST /api/pages/{id}/duplicate/`, `POST /api/pages/{id}/share/`, `GET /api/pages/{id}/collaborators/`, `POST /api/pages/{id}/unshare/`
- Versions: `GET|POST /api/pages/{page_id}/versions/`, `GET|PATCH|DELETE /api/pages/{page_id}/versions/{id}/`, `POST /api/pages/{page_id}/versions/{id}/restore/`
- Assets: `GET|POST /api/assets/`, `DELETE /api/assets/{id}/`
- AI: `POST /api/pages/{page_id}/generate/`, `POST /api/pages/{page_id}/blocks/{block_id}/edit-ai/`
- Analytics: `GET /api/pages/{page_id}/analytics/`
- Billing: `GET /api/billing/subscription/`, `GET /api/billing/payments/`, `POST /api/billing/checkout/`, `POST /api/billing/portal/`
- Domains: `GET|POST /api/domains/`, `GET|PATCH|DELETE /api/domains/{id}/`, `POST /api/domains/{id}/verify/`

Validación de inputs relevante:
- `POST /api/pages/{page_id}/generate/` valida `prompt` (max 2000), `tone` por choice y `language` en `es|en`.
- `POST /api/pages/{page_id}/blocks/{block_id}/edit-ai/` valida `instruction` (max 1000).
- `POST /api/billing/checkout/` valida `cycle` en `monthly|yearly`.
- `POST /api/pages/{id}/share/` valida `email`; `POST /api/pages/{id}/unshare/` valida `user_id`.
- `POST|PATCH /api/pages/{page_id}/versions/` valida `label` opcional con max 200.

## Arquitectura Del Frontend
Store:
- Store principal: `frontend/store/editor-store.ts`
- Estado clave: `page`, historial `past/future`, bloque seleccionado, preview mode, device mode, viewport, auto-save, colaboración, toasts y drag state
- Acciones principales: `addBlock`, `updateBlock`, `updateBlockStyle`, `updateBlockResponsiveStyle`, `deleteBlock`, `duplicateBlock`, `undo`, `redo`, `copy`, `paste`, `setTheme`, `updateSeo`, `setDesignTokenColors`, `save`, `setViewportState`, `zoomIn`, `zoomOut`, `applyRemoteBlockUpdate`

Bloques:
- Registro/factory: `frontend/lib/block-registry.ts` y `frontend/lib/block-factory.ts`
- Patrón real: cada tipo vive en `frontend/components/blocks/`, se declara en `blockRegistry` con `label`, `icon`, `initialData`, `fields` y `component`; `createBlock()` usa ese registro para construir instancias

Inspector:
- `frontend/components/inspector/Inspector.tsx`
- Selección de panel: localiza `selectedBlock` desde Zustand, resuelve `blockRegistry[selectedBlock.type]` y renderiza dinámicamente `fields` usando `FieldRenderer`
- Los estilos por dispositivo salen de `resolveStyles` y se escriben con `updateBlockStyle` / `updateBlockResponsiveStyle`

Rutas App Router principales:
- `/` landing/entry
- `/login`, `/register`, `/auth/magic/[token]`
- `/dashboard`
- `/editor` redirección al primer page o creación inicial
- `/editor/[pageId]` editor principal
- `/preview/[pageId]` preview autenticado
- `/p/[slug]` página pública
- `/settings`, `/settings/billing`, `/settings/domains`

## Decisiones De Arquitectura Que NO Debes Cambiar
Bloques grandes tipados. Cada bloque es una unidad atómica con schema definido. No crear sistemas de section → row → column → componente libre.

El tema manda. Los colores y tipografías se definen en Design Tokens. Los bloques consumen tokens. No añadir color pickers dentro de bloques individuales.

Owner-based filtering. Todas las queries de Django filtran por workspace del usuario. Todo nuevo endpoint debe incluir este filtrado.

Auto-save con debounce. Los cambios del editor se guardan automáticamente. No añadir botones de "Guardar" manuales.

Sin librerías pesadas innecesarias. Para funcionalidades simples (drag & drop de lista, bottom sheet, swipe), implementar con APIs nativas del navegador.

## Estado Actual Del Proyecto
Completado:
- Editor visual desktop (canvas, drag & drop, zoom/pan, inline editing, undo/redo)
- Autenticación (JWT + Google OAuth + Magic Links)
- Sistema de plantillas con deep copy
- Media Library
- Publicación de páginas
- Auto-save con debounce
- Inspector reactivo por tipo de bloque

En desarrollo:
- Quick Edit Mode (editor móvil) no aparece todavía como ruta/pantalla dedicada en `frontend/app/`
- Testing y bug fixing

Existe ya código en repo para: colaboración por WebSocket, analytics, billing, dominios personalizados, versionado e IA. No expandir esas áreas sin instrucción explícita.

NO implementar sin instrucciones explícitas:
- Colaboración en tiempo real (WebSockets)
- Generación por IA
- Analítica / A/B Testing
- Stripe / facturación
- Versionado de páginas
- Dominios personalizados
- Nuevos tipos de bloque

## Instrucciones Para Tareas De Testing
1. Primero lee el código que vas a testear. No escribas tests contra lo que crees que hace el código. Lee la implementación real.
2. Ejecuta los tests existentes antes de hacer cambios. Si alguno falla, documéntalo pero no lo arregles a menos que te lo pidan.
3. Usa los patrones existentes. Si ya hay tests, sigue el mismo estilo (imports, naming, fixtures, assertions). No inventes un estilo nuevo.
4. Tests de backend: usar `pytest` + `factory-boy`. Cada test debe ser independiente. Reutiliza `backend/conftest.py` y `backend/tests/factories.py`.
5. Tests E2E: usar Playwright. En este repo no está configurado; no introducirlo sin aprobación.
6. Cuando termines, ejecuta la suite relevante y reporta cuántos pasan, cuántos fallan y, por cada fallo, el error completo con una hipótesis de causa.
7. No arregles código de producción a menos que la tarea lo pida explícitamente. Si un test falla por un bug real, documenta el bug pero no lo corrijas.

## Instrucciones Para Code Review
- Verifica que los nuevos endpoints tienen owner-based filtering.
- Verifica que los campos de usuario visible son accesibles (labels, ARIA).
- Verifica que no se añaden dependencias innecesarias.
- Verifica que los tests cubren el happy path y al menos un edge case.
- Verifica que no hay secrets hardcodeados.
- Verifica que los nuevos bloques siguen el patrón del factory.

## Reglas Operativas Para Agentes de IA

### Antes de cualquier cambio

1. Leer `CLAUDE.md` y `AGENTS.md` completos. No asumir contexto de conversaciones anteriores.
2. Leer el código que vas a modificar. No generar cambios contra suposiciones.
3. Verificar que los tests pasan ANTES de empezar: `make test` o los comandos específicos de la sección que vas a tocar.

### Testing obligatorio

4. Al modificar lógica de negocio, crear o actualizar tests. No es opcional.
5. Respetar la pirámide de testing: muchos unit → algunos integration → pocos e2e.
6. Testear edge cases: inputs vacíos, arrays vacíos, tokens expirados, respuestas 500, usuarios sin permisos.
7. Tests de backend: un test = un escenario. Usar factories de `backend/tests/factories.py`. No crear datos manualmente si ya existe factory.
8. Tests de frontend: usar Testing Library con queries accesibles (`getByRole`, `getByLabelText`). Evitar `getByTestId` salvo último recurso.

### Calidad de código

9. Nunca silenciar errores ni usar `catch {}` vacío. Si capturas, loguea y re-lanza o maneja.
10. Respetar la separación de capas: componente → hook → API client → backend. Un componente no hace fetch directo.
11. Usar idempotency pattern en endpoints de mutación (pagos, publicación, duplicación).
12. Validar inputs en servidor aunque ya se validen en cliente.
13. No introducir `any` en TypeScript. Usar `unknown` con type narrowing.

### Dependencias y arquitectura

14. No introducir dependencias nuevas sin justificación. Si la añades, documéntala en `DECISIONS.md` con formato ADR.
15. Respetar las decisiones documentadas en `CLAUDE.md` sección 5 y `DECISIONS.md`. Si crees que una decisión debe cambiar, proponlo explícitamente en vez de ignorarla.
16. No crear abstracciones prematuras. Si algo se usa una vez, no merece un helper. Si se usa tres veces, evalúa.

### Boy Scout Rule

17. Si tocas código existente, mejóralo: nombres más claros, tipos más estrictos, early returns en vez de nesting. Pero no hagas refactors que no estén relacionados con tu tarea.

### Documentación

18. Si tu cambio altera la API, el modelo de datos, o un patrón arquitectónico, actualiza `CLAUDE.md` y/o `AGENTS.md`.
19. Si tomas una decisión arquitectónica nueva (nueva dependencia, cambio de patrón, nuevo servicio), documéntala en `DECISIONS.md`.

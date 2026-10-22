# AGENTS.md: guía del código de Paxl

Guía pública para quien vaya a tocar el código, sea una persona o una herramienta automática. Léela entera antes de cada tarea. Las decisiones con su contexto y alternativas están en [`DECISIONS.md`](DECISIONS.md); los fallos notables, en [`docs/bugs-notables.md`](docs/bugs-notables.md); qué es el proyecto y cómo se ejecuta, en [`README.md`](README.md).

---

## 1. Descripción

Paxl es un editor visual de landing pages SaaS: se monta la página con bloques tipados, se ve en escritorio, tablet y móvil, se edita con otras personas a la vez y se publica con su propia dirección. Es la demo de un proyecto personal. El producto actual se centra en la creación visual de landing pages; el roadmap futuro lo amplía hacia una plataforma CMS más completa.

Frontend en Next.js (App Router) con React, TypeScript y Zustand; backend en Django con DRF y Channels. En `settings.py` el backend usa SQLite por defecto en local y PostgreSQL cuando existe `DATABASE_URL`. La sesión vive en cookies httpOnly (ADR-008); además hay Google OAuth y enlaces mágicos. Las imágenes subidas se guardan en la base de datos (`Asset` con los metadatos, `AssetBlob` con los bytes), recodificadas con Pillow, y `pages.media` las sirve en `/media/assets/...` (ADR-049): nada depende del disco del servidor.

---

## 2. Stack tecnológico

### Frontend

| Dependencia | Versión | Propósito |
|---|---|---|
| Next.js | 16.4.0 | Framework (App Router) |
| React | 19.2.3 | UI |
| TypeScript | ^5 | Tipado estricto obligatorio |
| Zustand | ^5.0.11 | Estado global del editor |
| next-intl | ^4.8.3 | Interfaz en español e inglés |
| Tailwind CSS | ^4 | Estilos utilitarios con los tokens del tema (ADR-012) |
| Lucide React | ^0.577.0 | Iconografía |
| Recharts | ^3.8.0 | Gráficas de analítica |
| clsx | ^2.1.1 | Clases condicionales |
| @react-oauth/google | ^0.13.4 | Login social |
| Vitest + jsdom | ^4.1.0 / ^29 | Tests de unidad y de componentes |
| Playwright | 1.64.0 | Tests de punta a punta (solo Chromium) |
| axe-core | ^4.11.1 | Comprobaciones de accesibilidad en los tests |

### Backend

| Dependencia | Versión | Propósito |
|---|---|---|
| Django | >=5.1,<6.0 | Framework |
| Django REST Framework | >=3.15 | API REST |
| djangorestframework-simplejwt | >=5.3 | JWT (en cookies) |
| django-cors-headers | >=4.4 | CORS |
| Channels + Daphne | >=4.0 | WebSockets (colaboración) y servidor ASGI |
| channels-redis | >=4.2 | Capa de canales opcional |
| anthropic | >=0.39 | IA (Anthropic), solo con clave propia o del servidor |
| google-genai | >=1.0 | IA (Google), igual |
| stripe | >=8.0 | Pagos (solo modo de pruebas, ADR-036) |
| Pillow | >=11 | Recodificación de imágenes subidas (ADR-049) |
| bleach + tinycss2 | >=6 / >=1.3 | Saneado de texto y estilos (ADR-029) |
| whitenoise | >=6.7 | Estáticos |
| psycopg2-binary | >=2.9 | PostgreSQL |
| pytest + pytest-django + factory-boy | >=8 / >=4.8 / >=3.3 | Tests del backend |

### Infraestructura

- **DB**: SQLite (desarrollo), PostgreSQL (producción vía `DATABASE_URL`; en Neon, la cadena con pooler y `CONN_MAX_AGE=0`, ADR-056).
- **Auth**: JWT solo en cookies httpOnly (acceso 1 h, refresco 7 d con rotación y lista negra al cerrar sesión; un token de refresco solo vale una vez, ADR-054), comprobación de `Origin` como defensa CSRF (ADR-008), WebSocket autenticado con un ticket de un solo uso (ADR-010), Google OAuth (el script de Google solo se carga en `/login` y `/register`, ADR-039) y enlaces mágicos. Email y usuario son únicos sin distinguir mayúsculas (ADR-037).
- **Almacenamiento**: imágenes en PostgreSQL (`AssetBlob`), recodificadas (WebP, 1600 px, sin EXIF), con cuotas por cuenta y global, servidas con caché inmutable y ETag; el navegador reduce las fotos antes de subirlas (ADR-049).
- **Email**: todo envío pasa por `accounts/mailing.py`, con tope global diario (`EMAIL_DAILY_LIMIT`, 250) y por destinatario (`EMAIL_RECIPIENT_DAILY_LIMIT`, 5); un fallo es `503 EMAIL_UNAVAILABLE`. En desarrollo el email se imprime en la consola; en producción sale por la API HTTPS de Brevo (`EMAIL_BACKEND=accounts.brevo.BrevoEmailBackend`, `BREVO_API_KEY`; Render gratis bloquea SMTP). Con `DEBUG` apagado el backend de consola detiene el arranque (`paxl.E004`); para apagar el email, el backend `dummy` (ADR-050).
- **Plan demo**: con `DEMO_ALL_PRO` (por defecto) y sin clave de Stripe, toda cuenta e invitado tiene las funciones Pro (`demo_all_pro` en `/api/features/`, ADR-051). Una cuenta sin email verificado publica como un invitado (ADR-052).
- **Topes de almacenamiento** (base gratuita de 0,5 GB, ADR-053): página `MAX_PAGE_BYTES`, cuenta `ACCOUNT_STORAGE_LIMIT_BYTES` / `GUEST_STORAGE_LIMIT_BYTES`, `MAX_PAGES_PER_ACCOUNT`, `MAX_VERSIONS_PER_PAGE`, analítica `ANALYTICS_PAGE_DAILY_LIMIT` y `ANALYTICS_RETENTION_DAYS`, y `DATABASE_SIZE_LIMIT_MB`.
- **Servidor**: un proceso Daphne (ASGI) para HTTP y WebSocket; whitenoise para estáticos; `/healthz` y `/api/healthz/` sin base de datos ni validación de `Host` (ADR-015, ADR-056). Con `DJANGO_DEBUG=False`, `manage.py check` y el arranque de Daphne se niegan a continuar con `NUM_PROXIES=0` o con una clave `sk_live_` de Stripe; el panel `/admin/` está apagado salvo `ADMIN_ENABLED=True` (ADR-038).
- **Despliegue** (ADR-055, ADR-056): Vercel (frontend) + Render gratis (backend, Blueprint en `render.yaml`; el build `backend/build.sh` ejecuta `collectstatic`, `migrate`, `seed_plans` y `seed_demo`) + Neon (PostgreSQL) + Brevo (email), en Frankfurt. `frontend/vercel.json` añade la cabecera `X-Paxl-Origin-Secret` a `/api` y `/media`, y la IP del visitante sale de `config/client_ip.py` (`ORIGIN_SECRET`, `NUM_PROXIES`, `DIRECT_PROXY_HOPS`). El mantenimiento diario es `manage.py daily_maintenance`, lanzado por `.github/workflows/cleanup.yml` con el secreto `PROD_DATABASE_URL`. Node 22 (`.nvmrc`), Python 3.13.
- **Tiempo real**: Django Channels. Sin `REDIS_URL`, la capa de canales y los bloqueos están en memoria (un solo proceso); con `REDIS_URL`, en Redis. Solo la capa de canales y los bloqueos usan Redis: los tickets del WebSocket, los límites de DRF y la caché del plan siguen en memoria de cada proceso, lo que basta para un único proceso.

---

## 3. Estructura del repositorio

```text
landing-cms/
├── start-dev.sh              Arranca backend y frontend para desarrollo
├── Makefile                  Atajos: instalar, arrancar, tests, lint, typecheck, e2e, lockfile
├── render.yaml               Blueprint de Render para el backend
├── frontend/
│   ├── app/                  Rutas (App Router)
│   │   ├── page.tsx          Landing de marketing
│   │   ├── login, register   Acceso (contraseña, enlace mágico, Google)
│   │   ├── auth/magic/[token]  Verificación del enlace mágico
│   │   ├── join/             Canjear un enlace de invitación
│   │   ├── dashboard/        Lista de páginas del usuario
│   │   ├── editor/[pageId]/  Editor (completo, o Quick Edit en teléfonos)
│   │   ├── preview/[pageId]/ Vista previa autenticada
│   │   ├── p/[slug]/         Página pública (render en servidor, caché con revalidación, SEO)
│   │   ├── revalidate/       POST con el que Django invalida la caché al publicar (ADR-019)
│   │   ├── settings/         Cuenta, facturación, dominios
│   │   └── pricing, about, contact, changelog, privacy, terms   Páginas de marketing y legales
│   ├── components/           editor/, blocks/ (15 bloques), renderer/, inspector/, mobile-editor/,
│   │                         dashboard/, billing/, analytics/, ai/, auth/, guest/, settings/,
│   │                         marketing/, providers/, ui/ (primitivos)
│   ├── store/editor-store.ts Store de Zustand
│   ├── hooks/                Lógica reutilizable (useAuth, usePageSync, useAutoSave, useCollaboration...)
│   ├── lib/                  block-registry, block-factory, api, page-sync, page-theme, design-tokens...
│   ├── messages/             es.json y en.json (todo texto visible va en los dos)
│   ├── types/                Tipos (block-data.ts, page.ts, editor.ts...)
│   ├── __tests__/            Tests Vitest
│   ├── e2e/                  Tests Playwright contra el stack real
│   └── public/               Capturas de la landing y fotos propias de las plantillas (ADR-045)
├── backend/
│   ├── config/               settings.py, urls.py, asgi.py, client_ip.py, checks.py
│   ├── accounts/             User, auth, cookies JWT, invitados, email (mailing.py, brevo.py)
│   ├── pages/                Page, Block, Asset/AssetBlob, PageVersion, CustomDomain, validadores
│   ├── submissions/          Mensajes del formulario de contacto
│   ├── ai_generation/        Generación con IA, modo demo y fixtures
│   ├── analytics/            AnalyticsEvent, seguimiento sin cookies, retención
│   ├── billing/              Plan, Subscription, Stripe, plan demo
│   ├── collaboration/        Consumer del WebSocket, bloqueos, presencia
│   ├── tests/                Factories y tests transversales (cada app tiene además su `tests/`)
│   └── build.sh              Build de Render
├── infrastructure/           `Caddyfile` para dominios propios (solo con `CUSTOM_DOMAINS_ENABLED`, ADR-027)
├── docs/                     bugs-notables.md y el vídeo de la demo
├── DECISIONS.md              ADR
└── .github/workflows/        CI (ci.yml) y mantenimiento diario (cleanup.yml)
```

Tests: backend en `backend/*/tests/` y `backend/tests/`; frontend en `frontend/__tests__/`; e2e en `frontend/e2e/`. Configuración: `frontend/package.json`, `frontend/vitest.config.mts`, `frontend/eslint.config.mjs`, `frontend/tsconfig.json`, `backend/requirements.in` (el lockfile `requirements.txt` se genera con uv, ADR-011), `backend/pytest.ini`, `backend/config/settings.py`.

---

## 4. Cómo levantar el entorno

Primera vez:

```bash
make install   # backend/venv + dependencias (lockfile con hashes) + npm ci + copia los .env de ejemplo
make migrate
```

Día a día:

```bash
make dev       # equivale a ./start-dev.sh
```

`start-dev.sh`:
- valida `backend/venv`, `backend/.env`, `frontend/.env.local` y `frontend/node_modules` (si falta algo, indica el comando `make` que lo arregla);
- usa nvm si está instalado; si no, acepta el Node del PATH si cumple la versión mínima de `.nvmrc`;
- corre migraciones, arranca Django en `8001` y Next.js en `3000`, y cierra ambos con `Ctrl+C`.

Se puede cambiar con `FRONTEND_PORT`, `BACKEND_PORT` y `NODE_VERSION`.

Atajos en la raíz: `make backend`, `make frontend`, `make test`, `make test-backend`, `make test-frontend`, `make lint`, `make typecheck`, `make build`, `make e2e`, `make check` (los mismos pasos que el CI), `make lock` / `make lock-upgrade` (regenerar `backend/requirements.txt` desde `requirements.in` con uv, ADR-011).

Arranque manual, si hace falta depurar (desde la raíz del repo):

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8001
```

En otra terminal:

```bash
nvm use        # opcional: lee .nvmrc
cd frontend
npm ci
npm run dev    # http://localhost:3000
```

Comandos de gestión útiles (con el venv activo, desde `backend/`): `seed` (datos de ejemplo), `seed_plans`, `seed_demo` (cuenta de demostración; solo hace algo con `DEMO_USERNAME`, `DEMO_EMAIL` y `DEMO_PASSWORD`), `cleanup_guests`, `cleanup_magic_tokens`, `daily_maintenance` (todo el mantenimiento diario), `check_domains`.

### Variables de entorno

Todas están documentadas, con su valor por defecto, en `backend/.env.example` y `frontend/.env.example`; con los valores por defecto el proyecto arranca en local sin ningún servicio externo.

- Frontend: `NEXT_PUBLIC_API_URL`, `BACKEND_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SITE_URL`, `REVALIDATE_SECRET`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; solo en Vercel `PAXL_ORIGIN_SECRET` y `PAXL_ALLOW_PREVIEW_BACKEND`. Con `VERCEL_ENV=production` el build falla si falta o apunta a localhost alguna de las cuatro primeras.
- Backend: Django y red (`DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `FRONTEND_URL`, `REVALIDATE_SECRET`, `NUM_PROXIES`, `ORIGIN_SECRET`, `DIRECT_PROXY_HOPS`, `LOG_CLIENT_IP`); base de datos (`DATABASE_URL`, `MIGRATE_DATABASE_URL`, `SQLITE_PATH`, `REDIS_URL`); email (`EMAIL_BACKEND`, `BREVO_API_KEY`, `DEFAULT_FROM_EMAIL`, `EMAIL_*`); plan y topes (`DEMO_ALL_PRO`, `MAX_*`, `*_STORAGE_LIMIT_BYTES`, `ANALYTICS_*`, `DATABASE_SIZE_LIMIT_MB`, `GUEST_*`, `ASSET_*`); cuenta demo (`DEMO_*`); IA (`AI_DEMO_MODE`, `GOOGLE_AI_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_MODEL`, `ANTHROPIC_MODEL`); Stripe (`STRIPE_*`); `GOOGLE_CLIENT_ID`; `CUSTOM_DOMAINS_*`; límites de acceso (`AUTH_RATE`, `REFRESH_RATE`, `GUEST_CREATION_RATE`...).

---

## 5. Cómo ejecutar los tests

Frameworks:
- Backend: `pytest` + `pytest-django` + `factory-boy`.
- Frontend: Vitest + jsdom. No hay `@testing-library/react`: los tests montan los componentes con un `createRoot` propio (por ejemplo `frontend/__tests__/mobile-editor/test-utils.tsx`) y buscan por rol o nombre accesible.
- E2E: Playwright (solo Chromium) en `frontend/e2e/`, contra el stack real (ADR-030).

Backend:

```bash
cd backend && source venv/bin/activate
pytest
pytest pages/tests/test_views.py
pytest pages/tests/test_views.py::TestPageCRUD::test_list_pages
pytest --cov=. --cov-report=term-missing
```

Fixtures globales en `backend/conftest.py` y factories en `backend/tests/factories.py`. Las pruebas fijan `DEMO_ALL_PRO=False` para seguir probando los planes reales (ADR-051).

Frontend:

```bash
cd frontend
npm test
npm test -- __tests__/store/editor-store.test.ts
npm test -- __tests__/store/editor-store.test.ts -t "addBlock"
npm run test:coverage
npm run lint          # eslint, con tope de 40 avisos
npm run typecheck     # tsc --noEmit
npm run check:classes # falla si una clase de color no genera CSS (ADR-012)
```

E2E:

```bash
cd frontend && npx playwright install chromium   # solo la primera vez
make e2e                                         # o: cd frontend && npm run e2e
```

- Necesita `make install`. Arranca solo los dos servidores: Daphne en `127.0.0.1:8101` con una SQLite desechable (`backend/e2e.sqlite3`, se recrea en cada ejecución) y `next build` + `next start` en `127.0.0.1:3100`. No toca `backend/db.sqlite3` ni `.env`. Los emails se escriben en ficheros que las pruebas leen (así se verifica un email con un enlace mágico).
- Variables: `E2E_FRONTEND_PORT`, `E2E_BACKEND_PORT`, `E2E_PYTHON` (intérprete del backend), `E2E_SKIP_BUILD=1` (reutiliza el último `next build`), `E2E_REUSE_SERVERS=1` (usa servidores ya levantados con `bash e2e/scripts/start-backend.sh` y `start-frontend.sh`).
- Una prueba: `cd frontend && npx playwright test account`; con interfaz: `npx playwright test --ui`. Si falla, la traza queda en `frontend/test-results/` (`npx playwright show-trace <trace.zip>`); en CI, el trabajo `e2e` la sube como artefacto.
- Helpers y fixture de idioma en `frontend/e2e/support.ts`; arranque de servidores en `frontend/e2e/scripts/`.

Estado de las herramientas: ESLint y `tsc` configurados; formateo de frontend, lint y formateo de Python y `mypy` no configurados (no hay Prettier: sigue el estilo existente).

---

## 6. Arquitectura core

### Estructura de bloques

Las páginas se componen de un array de bloques JSON tipados. Cada bloque tiene `id`, `type`, `name`, `data` y `styles` (`BlockStyles` con padding, margin, bgColor, borderRadius). Los bloques se renderizan con un patrón Factory (`lib/block-factory.ts`) que consulta `lib/block-registry.ts`: cada tipo se declara en `blockRegistry` con `label`, `icon`, `initialData`, `fields` y `component`, y `createBlock()` construye instancias a partir de él.

Backend: modelo `Block` con `type`, `order`, `data` (JSONField), `styles` (JSONField) y FK a `Page`.

### Store de Zustand (`store/editor-store.ts`)

Store centralizado con `subscribeWithSelector`, única fuente de verdad del editor. Acciones principales:

- **Bloques**: `addBlock`, `updateBlock`, `updateBlockField`, `addListItem` / `removeListItem` / `moveListItem`, `updateBlockStyle`, `deleteBlock` (`requestDeleteBlock` / `confirmDeleteBlock` / `cancelDeleteBlock` con confirmación), `duplicateBlock`, `reorderBlocks`, `moveBlockUp` / `moveBlockDown`, `selectBlock`. `selectBlock` y `requestDeleteBlock` devuelven `boolean`: `false` si otra conexión tiene el bloqueo del bloque; quien abra una UI de edición debe comprobarlo (ADR-035).
- **Responsive**: `updateBlockResponsiveStyle` (overrides por tablet y móvil).
- **Tema y SEO**: `updateDesignTokenColor` / `Typography` / `Spacing` / `Borders`, `setDesignTokenColors`, `updateSeo`.
- **Historia**: `undo`, `redo`, `setPageWithHistory` (arrays `past` / `future`; acepta `coalesceKey` para que las ediciones seguidas de un mismo campo formen un solo paso).
- **Portapapeles**: `copy`, `paste`.
- **Vista**: `setDeviceMode`, `togglePreview`, `setLeftTab`, `setViewportState` (zoom y desplazamiento), `setInteractionState`, `toggleInspectorSection`.
- **Arrastrar y soltar**: `initDrag`, `activateDrag`, `updateDragPosition`, `setCanvasDropIndex`, `setLayerDropIndex`, `performDrop`, `cancelDrag`.
- **Colaboración**: `setPresence`, `addPresence` / `removePresence`, `setBlockLock` / `setBlockLocks`, `applyRemotePage`, `applyRemoteBlockUpdate` (el texto en directo va a `relayedEdits`, no a la base de sincronización), `replaceBlockData`, `setAccessRevoked` (solo lectura), `requestCollabReconnect` (ADR-024, ADR-035).
- **Página**: `loadPage` (sustituye la página y vacía historial y selección; la marca como remota para que el autosave no la reenvíe), `setSyncBase`, `setAutoSaveStatus`.
- **Avisos**: `addToast`, `removeToast`.
- **IDs de bloque**: UUID v4 generados en el cliente con `newBlockId()` y conservados por el servidor (ADR-014).

### Autosave

Hook `useAutoSave` suscrito al store. Detecta cambios, aplica debounce de 3 s (0,8 s con más conexiones) y guarda a través de `PageSyncController` (`lib/page-sync.ts`). Cada edición se copia al momento en `localStorage` (`lib/page-backup.ts`, con la base del servidor); al cargar, los cambios sin confirmar se fusionan sobre la página del servidor. El cambio pendiente se envía al desmontar, ocultar o cerrar la pestaña (`keepalive`), y `flushPendingSave()` (`lib/save-flush.ts`) lo envía antes de acciones que usan la copia del servidor (guardar versión, IA, salir). El controlador pone `autoSaveStatus` y `saveIssue` en el store, reintenta (2/5/15/30 s, `online`, reconexión) y deja fuera de los PUT los campos que el servidor rechaza, sin bloquear el resto (ADR-031). Lo que el servidor escribe fuera de un guardado (editar un bloque con IA) entra en la base de sincronización con la versión que devuelve (`adoptServerBlock`, ADR-046), para que deshacer y los guardados siguientes no choquen con un 409. Límites de campos del servidor en `lib/field-limits.ts`; mensajes de error por código en `lib/api-errors.ts`. No hay botón "Guardar": no añadirlo.

### Editor en pantallas táctiles y en el móvil

El editor completo funciona con los dedos (ADR-043). El lienzo es `touch-none` y `hooks/useCanvasTouchGestures.ts` traduce los gestos: un dedo desplaza, dos hacen zoom, toque = clic, doble toque = `dblclick` (edición en línea). Los arrastres táctiles los decide `lib/touch-drag.ts`; el zoom vive en `lib/canvas-zoom.ts` (0,25 a 2). Con `pointer-coarse:` los controles miden 44 px; por debajo de `xl` inspector e historial se abren sobre el lienzo y por debajo de `lg` la barra de componentes es un panel con el botón "Bloques".

Quick Edit (`components/mobile-editor/`) es el editor de los teléfonos: ventana de menos de 768 px de ancho o pantalla táctil de hasta 500 px de alto; las tabletas usan el editor completo (ADR-040, ADR-044). No es una ruta aparte: `app/editor/[pageId]` elige la interfaz; mismo store, misma API.

### Inspector

`components/inspector/Inspector.tsx` localiza el bloque seleccionado en el store, resuelve `blockRegistry[selectedBlock.type]` y renderiza sus `fields` con `FieldRenderer`. Los estilos por dispositivo salen de `resolveStyles` y se escriben con `updateBlockStyle` / `updateBlockResponsiveStyle`.

### Página pública

`/p/[slug]` se renderiza en el servidor con `components/renderer/PageRenderer.tsx` y cachea los datos hasta que Django llama a `POST /revalidate` al publicar, despublicar o borrar (ADR-019). Los bloques usan container queries (`@tablet:`, `@desktop:`), no `isMobile`/`isTablet`. `<html lang>` es el idioma de la página (el proxy pasa el slug al layout raíz); la página es el `<main id="main-content">`; botones sin enlace se pintan como texto y textos vacíos no se pintan (ADR-042). Los ajustes por dispositivo caen en cascada escritorio → tableta → móvil.

### Filtrado por propietario

Las queries de Django filtran por el propietario o por colaborador de la página (`owner=request.user` o `collaborators`); un usuario nunca accede a datos de otro. Los ViewSets usan `get_queryset()` filtrado, y **todo endpoint nuevo debe incluir este filtrado**.

### Modelo de datos (Django)

- **User** (AbstractUser): UUID pk, email único sin distinguir mayúsculas, `google_id`, `avatar`, `is_guest` (cuenta temporal, ADR-022). Las claves de IA del usuario no se guardan: viajan en la petición de generación y se descartan.
- **User.email_verified / sessions_revoked_at**: el enlace mágico o Google demuestran el email; si la cuenta tenía una contraseña sin confirmar, se desactiva y se cierran todas las sesiones y sus enlaces de invitación (ADR-018, ADR-054). Sin verificar, sus páginas publicadas llevan las protecciones de las de invitado (ADR-052): `noindex`, fuera del sitemap, sin Custom HTML, formulario sin envío y aviso. `/api/auth/me/` devuelve `email_verified`.
- **SentEmail**: kind (magic_link/share), recipient_hash (SHA-256 de la dirección), page_id, created_at. Cuenta los topes de email; se poda a los 30 días (ADR-050).
- **Workspace**: owner FK, nombre.
- **Page**: owner FK, workspace FK, name, slug (único), status (draft/published, solo cambia con publish/unpublish), `published_version` FK + `published_at` (copia pública congelada, ADR-017), `version` (control de concurrencia, ADR-024), `design_tokens` (JSON, el tema completo de la página, ADR-020), `language` (etiqueta BCP 47, por defecto `es`, ADR-033), campos SEO (`seo_title`, `seo_description`, `og_*` con `og_type` website/article, `noindex`) y `collaborators` (edición compartida).
- **Block**: page FK, type, order, data (JSON), styles (JSON).
- **PageVersion**: page FK, version_number, snapshot (JSON), page_metadata (JSON), trigger, label, size_bytes.
- **Asset**: owner FK, workspace FK, name, `path` (único, lo que va tras `/media/`), mime_type (detectado), size, width, height, sha256 (ETag). Los bytes están en **AssetBlob** (1:1, cascada), que el listado y el borrado nunca leen.
- **FormSubmission** (app `submissions`): page FK, block_id, name, email, message, created_at (sin IP).
- **CustomDomain**: workspace FK, page FK, domain (único), dns_status, ssl_status, is_active. Apagado salvo `CUSTOM_DOMAINS_ENABLED` (ADR-027).
- **Plan**: name, max_pages, max_ai_generations_per_hour, feature flags. **Subscription**: OneToOne con Workspace, plan FK, stripe_subscription_id, status, billing_cycle. Con `DEMO_ALL_PRO` y la facturación apagada, `get_user_plan` responde Pro para todos (ADR-051).
- **AnalyticsEvent**: page FK, event_type, `visitor_id` (hash diario calculado en servidor, sin cookies; `analytics/privacy.py`), block_id, event_data (JSON filtrado por tipo), referrer (solo origen), UTM, screen_size. Retención de 90 días (`analytics/retention.py`, ADR-053).
- **AIGenerationLog**: user FK, page FK, prompt, mode, source (demo / live / own_key), tokens y coste estimado.

---

## 7. Decisiones de producto y arquitectura

Están tomadas y no deben cuestionarse ni cambiarse sin discusión explícita (si crees que una debe cambiar, propónlo en vez de ignorarla).

**Modelo de editor: bloques grandes tipados.** No usamos el modelo de Elementor (section > row > column > componente libre). Cada bloque es una unidad atómica con schema definido. Razón: coherencia, mantenibilidad, mejor para la IA.

**El tema manda.** Los colores y tipografías se definen en Design Tokens a nivel de página. Los bloques consumen tokens, no valores fijos; el usuario no elige colores dentro de un bloque individual, los elige en el tema. Los bloques pintan con las variables derivadas de `tokensToThemeVars` (`--theme-text-on-primary`, `--theme-inverse-*`, `--theme-primary-text`...), que garantizan contraste AA; nada de blancos fijos ni opacidad sobre texto (ADR-041). La sección de cada bloque pinta `var(--block-bg, <su color>)` para que el fondo propio del bloque se vea (ADR-042).

**Tipografía semántica.** No hay `fontSize` libre. Cada campo de texto tiene un rol (h1-h6, p, small) y el tema define cómo se ve cada rol.

**Modo claro/oscuro global.** Un interruptor a nivel de página, no por bloque. El tema define las paletas light y dark. Alternancia de superficies (default/alternate) para dar ritmo entre secciones.

**Paletas predefinidas + personalización.** Se elige una paleta como punto de partida y se pueden ajustar colores individuales, con validación de contraste WCAG AA.

**Roles semánticos en bloques.** Los bloques usan roles de color (`backgroundRole: "primary" | "background" | "surface"`, `buttonRole: "primary" | "secondary"`) en vez de colores directos. Las plantillas se diseñan con roles y funcionan con cualquier paleta.

**Quick Edit para móvil.** No es una versión comprimida del editor de escritorio: es un modo optimizado para cambios rápidos (lista de bloques como interfaz principal, hoja inferior para editar, IA para textos, vista previa a pantalla completa). Tema, SEO y versiones se quedan en el ordenador (ADR-040).

**Libertad de sistema, no de píxel.** El spacing usa tokens (sm/md/lg), no píxeles; los radios de borde usan tokens; los colores se heredan del tema. Los overrides por bloque son la excepción.

**Autosave, sin botón de guardar.** Los cambios del editor se guardan solos con debounce.

**Sin librerías pesadas innecesarias.** Para funcionalidades simples (arrastrar y soltar, hojas inferiores, gestos) se usan las APIs nativas del navegador (ADR-009).

**Modelo híbrido como evolución futura.** Los layout slots internos (secciones con columnas + componentes) y las variantes/skins no se implementan ahora; la estructura actual de `Block` es extensible para absorberlos sin reescritura.

---

## 8. Tipos de bloque disponibles

15 bloques registrados en `lib/block-registry.ts`:

| Tipo | Label | Campos de `data` |
|---|---|---|
| `hero` | Hero | title, subtitle, buttonText, buttonLink, badgeText, secondaryButtonText, secondaryButtonLink, backgroundImage, alignment |
| `features` | Features | title, features[] {title, description} (máx. 6) |
| `testimonials` | Testimonials | title, testimonials[] {quote, author, role} (máx. 6) |
| `cta` | Call to Action | title, subtitle, buttonText, buttonLink |
| `footer` | Footer | brandName, description, copyright, links[] {label, url} (máx. 6) |
| `pricing` | Pricing | title, subtitle, billingPeriod, popularBadgeText, plans[] {name, price, features (una por línea), buttonText, buttonLink, highlighted} (máx. 4) |
| `faq` | FAQ | title, questions[] {question, answer} (máx. 12) |
| `logoCloud` | Logo Cloud | title, logos[] {name} (máx. 12) |
| `gallery` | Gallery | title, subtitle, columns ('2'\|'3'\|'4'), images[] {src, alt} (máx. 12) |
| `contact` | Contact Form | title, subtitle, buttonText, namePlaceholder, emailPlaceholder, messagePlaceholder |
| `customHtml` | Custom HTML | html (iframe con sandbox, ADR-016) |
| `navbar` | Navigation Bar | brandName, logoImage, links[] {label, url} (máx. 6), ctaText, ctaLink |
| `team` | Team | title, subtitle, members[] {name, role, image} (máx. 8) |
| `stats` | Statistics | title, subtitle, stats[] {value, label} (máx. 6) |
| `timeline` | Timeline | title, events[] {date, title, description} (máx. 10) |

Las listas son arrays de objetos (ADR-021). Los tipos viven en `types/block-data.ts` (unión discriminada por `type`); `normalizeBlockData()` en `lib/block-data.ts` convierte los datos de la API al tipo de cada bloque, y el backend los valida en `clean_block_data` (`pages/block_validators.py`), el único camino para REST, WebSocket, IA y restauración de versiones. Los campos de texto son texto plano (ADR-029) y las URLs de imagen son estrictas (ADR-034, ADR-047).

Cada bloque nuevo debe: registrarse en `block-registry.ts`, tener componente en `components/blocks/`, tener su contenido de ejemplo en español e inglés en `lib/block-defaults.ts` (y un elemento nuevo por cada lista), y seguir la interfaz `BlockProps` (`blockId`, `data`, `isPreviewMode`). El contenido que crea la app (bloques nuevos, plantillas en `lib/template-content/`) sigue el idioma de la interfaz en el momento de crearlo (ADR-025); nunca se traduce lo ya escrito. Los bloques nuevos y las plantillas traen enlaces a anclas de la página.

Diseño responsive: los bloques no saben en qué dispositivo están. Usan clases mobile-first con las variantes de container query `@tablet:` (>= 640 px) y `@desktop:` (>= 1024 px); cada superficie que pinta bloques (canvas, vista previa, página pública, miniaturas) pone `@container` en su raíz. Nada en un bloque puede depender de `window`, porque la página pública se renderiza en el servidor (ADR-019).

---

## 9. Endpoints de la API

### Auth (`/api/auth/`)

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| POST | `/register/` | No | Crear cuenta + cookies. Usuario nuevo: solo letras ASCII, números y `_ . -` (ADR-047) |
| POST | `/login/` | No | Login + cookies httpOnly. Usuario o contraseña incorrectos o vacíos: `401 INVALID_CREDENTIALS` en el idioma de la petición (ADR-048); cuenta sin contraseña utilizable (enlace mágico, Google o desactivada por ADR-018): `401 PASSWORD_DISABLED` (ADR-054) |
| POST | `/refresh/` | No | Renovar el token de acceso. Cupo propio por IP (`REFRESH_RATE`); el token viejo vale una sola vez (ADR-054) |
| POST | `/logout/` | No | Limpiar cookies y poner el refresco en la lista negra |
| POST | `/google/` | No | Login con Google ID token. Una cuenta nueva toma el usuario de la parte local del correo, con lo que no sea `[A-Za-z0-9_.-]` cambiado por `_` (igual con el enlace mágico, ADR-048) |
| POST | `/magic/request/` | No | Enviar enlace mágico (como mucho 3 por buzón cada 15 min y 5 correos al día; pasado el límite, la misma respuesta sin envío, ADR-047). Email apagado, tope global o fallo del proveedor: `503 EMAIL_UNAVAILABLE`, sin token guardado (ADR-050) |
| POST | `/magic/verify/` | No | Verificar el token del enlace |
| POST | `/guest/` | No | Sesión de invitado temporal, 24 h (ADR-022) |
| POST | `/guest/claim/` | Sí (invitado) | Convertir el invitado en cuenta normal y conservar sus páginas |
| POST | `/join/` | No | Canjear un enlace de invitación: colaborador (usuario con sesión) o invitado nuevo (ADR-024) |
| GET | `/me/` | Sí | Usuario actual (incluye `email_verified`) |
| DELETE | `/me/` | Sí (no invitado) | Borrar la cuenta y todo lo suyo; pide `password` o `confirm_username` (ADR-028) |
| POST | `/ws-ticket/` | Sí | Ticket de un solo uso para abrir el WebSocket (ADR-010) |

WebSocket de colaboración: `ws/pages/{page_id}/?ticket=...`.

### Pages (`/api/pages/`)

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/` | Sí | Lista paginada (propias y compartidas), 20 por página; `?page=` y `?search=` (nombre o slug) |
| POST | `/` | Sí | Crear página + bloques |
| GET | `/{id}/` | Sí | Detalle con bloques + SEO (incluye `is_owner`) |
| PUT / PATCH | `/{id}/` | Sí | Actualización (sincroniza bloques). Exige `version`; `409 VERSION_CONFLICT` si cambió (ADR-024) |
| DELETE | `/{id}/` | Sí (propietario) | Eliminar (avisa por WebSocket a quien la tiene abierta) |
| POST | `/{id}/duplicate/` | Sí (propietario) | Duplicar con bloques |
| POST | `/{id}/publish/` | Sí (propietario) | Congelar el borrador como versión pública (ADR-017) |
| POST | `/{id}/unpublish/` | Sí (propietario) | Despublicar |
| GET | `/{id}/submissions/` | Sí | Mensajes del formulario de contacto (paginado) |
| DELETE | `/{id}/submissions/{sid}/` | Sí | Borrar un mensaje |
| GET / POST | `/{id}/versions/` | Sí | Listar/crear versiones (la lista incluye `max_versions`; crear está limitado por hora y necesita sitio, ADR-053) |
| GET / PATCH / DELETE | `/{id}/versions/{vid}/` | Sí (borrar: propietario) | Ver, renombrar o borrar una versión (`400 PUBLISHED_VERSION` si es la publicada) |
| POST | `/{id}/versions/{vid}/restore/` | Sí | Restaurar versión (conserva los ids de los bloques) |
| POST / DELETE | `/{id}/invite/` | Sí (propietario) | Enlace de invitación, 24 h y 5 usos (ADR-024). `DELETE` revoca todos los enlaces; quitar un colaborador también (ADR-054) |
| POST | `/{id}/share/` | Sí (propietario) | Compartir con un email; responde lo mismo exista o no la cuenta (un aviso por página y destinatario, solo a direcciones verificadas) |
| GET | `/{id}/collaborators/` | Sí | Colaboradores de la página |
| POST | `/{id}/unshare/` | Sí (propietario) | Quitar un colaborador (`user_id`) y borrar los enlaces de invitación |

Un colaborador que intenta una acción del propietario recibe `403 {"error", "code": "NOT_OWNER"}` (ADR-032): publicar, despublicar, duplicar, eliminar la página o una versión, `generate`, compartir, `unshare` e `invite`. Los campos de texto de los bloques son texto plano (ADR-029); las URLs de imagen (bloques y `og_image`) solo admiten `https://host/...` o una ruta `/...` (ADR-047), sin comillas, paréntesis ni `;` (ADR-034).

### Públicos

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/api/public/pages/{slug}/` | No | Versión publicada (copia congelada) por slug |
| POST | `/api/public/pages/{slug}/contact/` | No | Enviar el formulario de contacto (límite, honeypot; `403 UNVERIFIED_PAGE` / `GUEST_PAGE` en páginas restringidas) |
| GET | `/api/sitemap/` | No | Sitemap XML (caché 1 h) |
| GET | `/api/public/sitemap-data/` | No | JSON para el sitemap de Next.js |
| GET | `/api/public/resolve-domain/` | No | Resolver dominio propio (404 `FEATURE_DISABLED` si `CUSTOM_DOMAINS_ENABLED` está apagado, ADR-027) |
| GET | `/api/features/` | No | Funciones del despliegue: `{ "custom_domains", "billing", "demo_all_pro", "email" }` (booleanos; ADR-027, ADR-036, ADR-050, ADR-051) |
| GET | `/healthz`, `/api/healthz/` | No | Salud sin base de datos ni validación de `Host` (ADR-056) |

### Imágenes, dominios, IA, analítica y facturación

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET / POST | `/api/assets/` | Sí (subir: no invitado) | Listar/subir imágenes. La subida recodifica (WebP, 1600 px, sin EXIF) y aplica cuotas: `400 INVALID_IMAGE` / `IMAGE_TOO_LARGE`, `413 FILE_TOO_LARGE`, `403 ASSET_QUOTA`, `507 STORAGE_FULL`, 429 pasadas 30 por hora (ADR-049) |
| DELETE | `/api/assets/{id}/` | Sí | Borrar una imagen y sus bytes |
| GET / HEAD | `/media/<path>` | No | Imagen subida, desde la base de datos (caché inmutable, `ETag`, CSP `sandbox`). Cualquier cuerpo de más de 6 MB recibe `413 REQUEST_TOO_LARGE` antes de leerse |
| GET / POST / PATCH / DELETE | `/api/domains/` | Sí (Pro) | CRUD de dominios propios; solo con `CUSTOM_DOMAINS_ENABLED` (ADR-027) |
| POST | `/api/domains/{id}/verify/` | Sí | Verificar DNS |
| GET | `/api/ai/options/?language=es` | Sí | Modo de la IA (demo / live / unavailable) y prompts de ejemplo (ADR-023) |
| POST | `/api/pages/{id}/generate/` | Sí (propietario) | Generar página con IA (demo: página guardada; con clave propia: llamada real). Valida `prompt` (máx. 2000), `tone` y `language` (`es\|en`) |
| POST | `/api/pages/{id}/blocks/{bid}/edit-ai/` | Sí | Editar bloque con IA (demo: variante guardada, en el idioma de la página). Valida `instruction` (máx. 1000); responde `block` y `page_version`. `409 BLOCK_CHANGED` si el bloque cambió mientras tanto, `409 BLOCK_LOCKED` si otra conexión lo tiene bloqueado |
| POST | `/api/analytics/collect/` | No | Registrar eventos: lotes de 10, 30 por minuto e IP, `ANALYTICS_PAGE_DAILY_LIMIT` por página y día (ADR-053) |
| GET | `/api/pages/{id}/analytics/` | Sí | Analítica de la página (`400 INVALID_PERIOD` si el periodo no vale) |
| GET | `/api/billing/plans/` | No | Planes disponibles |
| GET | `/api/billing/subscription/` | Sí | Suscripción actual, `effective_plan`, `demo_all_pro` y `usage` |
| GET | `/api/billing/payments/` | Sí | Historial de pagos |
| POST | `/api/billing/checkout/` | Sí | Crear sesión de Stripe (`cycle` en `monthly\|yearly`). `503 FEATURE_DISABLED` sin clave de prueba de Stripe (ADR-036) |
| POST | `/api/billing/portal/` | Sí | Portal de facturación de Stripe; igual que checkout |
| POST | `/api/billing/webhook/` | No | Webhook de Stripe, idempotente por evento; `503` si la facturación está apagada |

Errores de límites habituales: `413 PAGE_TOO_LARGE`, `403 STORAGE_LIMIT`, `403 PAGE_LIMIT`, `503 SERVICE_FULL`, `503 EMAIL_UNAVAILABLE`. Todos siguen el formato `{"error": "mensaje", "code": "CODIGO"}`.

---

## 10. Convenciones de código

### Nombres

- Archivos React: PascalCase (`HeroBlock.tsx`, `CanvasViewport.tsx`).
- Archivos de lib, hooks y types: camelCase o kebab-case (`block-registry.ts`, `useAuth.ts`, `editor-store.ts`).
- Archivos Django: snake_case (`models.py`, `serializers.py`).
- Componentes React: PascalCase, funcionales, con arrow functions.
- Variables y funciones de TS: camelCase; de Python: snake_case.
- Constantes: camelCase para objetos (`blockRegistry`), UPPER_SNAKE para los ajustes de Django.

### Estructura de componentes

```tsx
// Imports (lucide, types, hooks, store, lib, components)
// Types/interfaces locales
// Component (arrow function, export default)
```

### Patrones

- Solo componentes funcionales, sin clases.
- Hooks propios en `hooks/` para la lógica reutilizable; el store de Zustand como única fuente de verdad del editor (sin prop drilling).
- Tailwind CSS con los tokens del tema (`bg-surface-card`, `text-muted`, `border-subtle`...), registrados con `@theme inline` en `app/globals.css` (ADR-012); `npm run check:classes` falla si una clase de color no genera CSS. Valores arbitrarios solo cuando no existe token.
- `clsx()` para clases condicionales.
- Django: serializers en `serializers.py`, views en `views.py`, URLs por router de DRF.
- Todo texto visible va en `frontend/messages/es.json` y `en.json`, con redacción natural en los dos idiomas.

---

## 11. Estado actual del proyecto

Completado:

- Editor visual completo: lienzo, arrastrar y soltar, edición en línea, zoom y desplazamiento, deshacer y rehacer, modos de dispositivo, uso con los dedos en tabletas (ADR-043) y Quick Edit en teléfonos (ADR-040, ADR-044).
- 15 tipos de bloque con inspector reactivo; plantillas con fotos propias (ADR-045).
- Auth: contraseña, Google OAuth y enlaces mágicos con cookies httpOnly; modo invitado de 24 h (ADR-022); verificación del email (ADR-018, ADR-052).
- Panel con lista de páginas, estadísticas y tarjetas.
- Autosave con debounce, copia local y fusión de cambios (ADR-031).
- Páginas públicas en `/p/[slug]` renderizadas en el servidor con SEO, caché que Django invalida al publicar (`REVALIDATE_SECRET`, ADR-019) y fuentes del tema autoalojadas con next/font.
- Historial de versiones con instantáneas y restauración, con tope por página (ADR-053).
- Tema de página = Design Tokens (color, tipografía, espaciado, bordes), editables en la vista Estilos, con 14 paletas (ADR-020) y colores derivados que garantizan contraste AA (ADR-041).
- Estilos responsive por bloque (overrides de tablet y móvil).
- Colaboración en tiempo real: presencia, bloqueo por bloque, cursores, enlaces de invitación y fusión en tres vías (ADR-024, ADR-035).
- Generación con IA (página entera y edición de bloque): modo demo sin coste, clave propia o clave del servidor con topes (ADR-023).
- Analítica sin cookies (visitas, clics, scroll, conversión de CTA) con retención de 90 días.
- Imágenes en PostgreSQL con cuotas (ADR-049); email por Brevo con topes (ADR-050); plan demo con todo Pro (ADR-051); topes de almacenamiento (ADR-053).
- Despliegue gratuito definido: Vercel + Render + Neon + Brevo (ADR-055, ADR-056).
- Interfaz en español e inglés. Accesibilidad (WCAG 2.2 AA como objetivo): aria-labels, trampas de foco, navegación con teclado, `prefers-reduced-motion`, enlace para saltar al contenido en todas las rutas.
- Design system Paxl: `#2563EB` como azul primario, superficies `#0A0F1A` / `#111827` / `#1F2937`, tipografía DM Sans + JetBrains Mono.

Apagado en la demo desplegada:

- Pagos reales con Stripe (solo modo de pruebas, y solo con una clave `sk_test_`; ADR-036).
- Dominios propios (`CUSTOM_DOMAINS_ENABLED`, ADR-027): necesitan DNS y certificados.

Roadmap futuro (no implementar sin instrucciones explícitas):

- A/B testing.
- Componentes avanzados y layout slots (modelo híbrido).
- Dominios propios y pagos reales.
- Presencia compartida entre procesos (hoy es por proceso, ADR-015).

---

## 12. Reglas para generar código

1. Nunca generes código para fases futuras sin que te lo pidan explícitamente.
2. Respeta los patrones existentes: si los componentes usan un estilo determinado, sigue ese estilo.
3. Los bloques nuevos siguen la misma estructura que los existentes (registro en `block-registry`, componente en `blocks/`, `BlockProps`).
4. No añadas dependencias sin justificación; prefiere implementaciones nativas cuando la funcionalidad es simple. Si añades una, documéntala en `DECISIONS.md` con formato ADR.
5. Todo endpoint nuevo tiene filtrado por propietario o colaborador.
6. Todo campo visible al usuario es accesible (labels, roles ARIA, objetivos táctiles de 44 px en móvil).
7. No reescribas módulos completos desde cero: modifica de forma incremental.
8. No cambies el diseño visual salvo que se pida explícitamente.
9. Mantén la funcionalidad existente en cada cambio.
10. No crees abstracciones prematuras: si algo se usa una vez, no merece un helper; si se usa tres veces, evalúa.
11. Si tocas código existente, déjalo mejor (nombres claros, tipos estrictos, early returns), pero sin refactors ajenos a la tarea.

---

## 13. Estándares de calidad

### Clean code

- Funciones pequeñas con responsabilidad única. Si una función hace fetch + transformación + render, divídela.
- Nombres descriptivos: `fetchPageBlocks()` en vez de `getData()`, `isPublished` en vez de `flag`.
- Consistencia: si un slice de Zustand sigue un patrón (acción + selector), todos lo siguen igual.
- Un componente React renderiza UI. La lógica vive en hooks y servicios, los datos en el store.

### Tipado estricto

- TypeScript con `strict: true`. Prohibido `any`: usa `unknown` y type guards si el tipo es dinámico.
- Los tipos son documentación viva: si cambias la lógica, actualiza el tipo primero.
- Interfaces para contratos públicos (props, respuestas de la API); `type` para uniones y utilidades.

### Separación de capas

```
UI (componentes) → hooks/servicios → cliente de API (lib/api.ts) → backend → DB
```

- Un componente nunca hace `fetch()` directo: usa `lib/api.ts` o un hook.
- Un hook no renderiza UI. Un servicio no conoce React.
- Backend: los serializers validan y transforman, las views orquestan, los modelos encapsulan la lógica de dominio.

### Gestión de errores

- Nunca silenciar errores: `catch {}` vacío está prohibido. Si capturas, maneja, o registra y vuelve a lanzar.
- Frontend: error boundaries para fallos de render; `try/catch` con aviso al usuario (toast, error en línea).
- Backend: respuestas de error consistentes, `{ "error": "mensaje", "code": "ERROR_CODE" }`; `logger.error()` con contexto, nunca `print()`.
- Nunca exponer trazas, IDs internos o configuración en respuestas de producción.

### Validación

- Siempre se valida en el servidor, aunque ya se valide en el cliente: el cliente es comodidad de UX, el servidor es seguridad. En el backend, serializers de DRF y, para lo complejo, validadores propios (`clean_block_data` para todo lo que entra en un bloque).

### Seguridad

- Consultas parametrizadas siempre; nunca concatenar texto del usuario en SQL ni en filtros del ORM.
- Defensa CSRF por comprobación de `Origin` (ADR-008); los endpoints JWT no usan tokens CSRF.
- Límites de frecuencia en los endpoints sensibles (acceso, registro, enlace mágico, IA, subidas, analítica). El límite de acceso cuenta por IP con sesión o sin ella (ADR-047). La IP de confianza sale de `config/client_ip.py` (ADR-055); nada lee `X-Forwarded-For` por su cuenta.
- Cabeceras de seguridad: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, CSP del frontend (ADR-038).
- JWT: firma validada en el servidor, acceso de 1 h, refresco rotado de 7 d.
- Los secretos van en variables de entorno, nunca en el código.

### Idempotencia

- Los endpoints de mutación críticos (pagos, publicación, duplicación) deben tolerar repeticiones; usa upserts en vez de inserts ciegos donde aplique. El webhook de Stripe es idempotente por evento.

### Rendimiento

- Carga diferida para rutas y componentes pesados (`next/dynamic`, `React.lazy`).
- Paginación obligatoria en los endpoints que devuelven listas.
- Índices en la base para los campos usados en filtros y ordenación; orden explícito en las listas (`order_by`).
- Caché con invalidación correcta: nunca cachear sin estrategia de invalidación.
- Imágenes con `width` y `height` explícitos; las de páginas publicadas cargan en diferido salvo los dos primeros bloques (ADR-049).

### Anti-patrones explícitos

| Prohibido | Alternativa |
|---|---|
| `console.log` en producción | `logger.info/warn/error` o eliminarlo |
| `any` en TypeScript | `unknown` + type guard |
| Consultas sin parametrizar | ORM o sentencias preparadas |
| `catch {}` vacío | Manejar el error, o registrar y volver a lanzarlo |
| `// TODO` sin ticket | `// TODO(PAXL-123): descripción` |
| Secretos en el código | Variables de entorno (`.env`) |
| `!important` en CSS | Especificidad correcta o refactor |
| Merge sin revisión | PR con al menos una revisión |

---

## 14. Cómo trabajar en una tarea

### Antes de cambiar nada

1. Lee esta guía entera. No asumas contexto de conversaciones anteriores.
2. Lee el código que vas a modificar; no generes cambios contra suposiciones.
3. Comprueba que los tests pasan antes de empezar (`make test` o los comandos de la parte que vas a tocar).

### Tests

4. Al modificar lógica de negocio, crea o actualiza tests: no es opcional. Un fallo corregido lleva un test que falla sin el arreglo.
5. Respeta la pirámide: muchos tests de unidad, algunos de integración, pocos e2e (los e2e son para lo que solo el stack real puede probar).
6. Prueba los casos límite: entradas y arrays vacíos, tokens caducados, respuestas 500, usuarios sin permisos.
7. Backend: un test = un escenario; reutiliza `backend/conftest.py` y las factories de `backend/tests/factories.py`.
8. Frontend: busca por rol, etiqueta o nombre accesible (`[role=...]`, `[aria-label=...]`); `data-testid` solo como último recurso.
9. Al terminar, ejecuta la suite relevante y cuenta pasan/fallan; por cada fallo, el error completo y una hipótesis de causa.

### Revisión de código

- ¿Los endpoints nuevos filtran por propietario o colaborador?
- ¿Los campos visibles son accesibles (labels, ARIA, 44 px en móvil) y están en español e inglés?
- ¿Se añaden dependencias innecesarias o secretos en el código?
- ¿Los tests cubren el caso feliz y al menos un caso límite?
- ¿Los bloques nuevos siguen el patrón del factory?

### Documentación

- Si tu cambio altera la API, el modelo de datos o un patrón de arquitectura, actualiza este archivo.
- Si tomas una decisión de arquitectura nueva (dependencia, patrón, servicio), añade un ADR a `DECISIONS.md`.
- Un fallo notable (bloqueante o grave) se añade a `docs/bugs-notables.md`.

---

## 15. Referencia de diseño

### Paleta Paxl

| Token | Valor | Uso |
|---|---|---|
| Primary | `#2563EB` | Botones, acciones, focus rings, acentos interactivos |
| Primary hover | `#1D4ED8` | Hover de botones primarios |
| Surface base | `#0A0F1A` | Lienzo, fondo principal |
| Surface elevated | `#111827` | Inputs, paneles secundarios |
| Surface card | `#1F2937` | Tarjetas, paneles, modales (cristal: `/80 backdrop-blur-2xl`) |
| Border default | `#374151` | Bordes (con opacidad `/10` a `/30`) |
| Border subtle | `#1F2937` | Bordes sutiles, separadores |
| Text primary | `#F9FAFB` | Texto principal |
| Text secondary | `#9CA3AF` | Texto secundario |
| Text muted | `#8B95A5` | Texto de menor jerarquía, placeholders (4,5:1 sobre tarjeta) |
| Success | `#10B981` | Estados correctos |
| Warning | `#F59E0B` | Advertencias |
| Error | `#EF4444` (texto: `#F87171`) | Errores, acciones destructivas |

Modo claro (`[data-theme="light"]` en `app/globals.css`): superficies `#FFFFFF` / `#F9FAFB`, texto `#111827` / `#4B5563` / `#626A77` (los tonos de texto muted, error `#C42020` y primary `#1F56E0` se oscurecen un poco para llegar a 4,5:1 también sobre los paneles teñidos), success `#047857`, warning `#B45309`, error `#DC2626`. Todos los pares texto/fondo cumplen WCAG AA (4,5:1). Los tokens se usan como clases de Tailwind (ADR-012).

### Tipografía

| Fuente | Uso |
|---|---|
| DM Sans | Títulos, texto de cuerpo, interfaz en general |
| JetBrains Mono | Código, valores monoespaciados, inputs técnicos |

### Tokens de forma

| Token | Valor |
|---|---|
| Border radius small | 6 px |
| Border radius medium | 8-12 px |
| Border radius large | 16 px |
| Spacing base | Múltiplos de 4 px |

# CLAUDE.md -- Paxl

Referencia principal del proyecto. Leer antes de cada tarea para mantener contexto y consistencia.

---

## 1. Descripcion del proyecto

Paxl es un editor visual de landing pages SaaS. El producto actual esta enfocado en la creacion visual de landing pages como caso de uso principal. El roadmap futuro amplia el producto hacia una plataforma CMS mas completa.

---

## 2. Stack tecnologico

### Frontend

| Dependencia | Version | Proposito |
|---|---|---|
| Next.js | 16.1.6 | Framework (App Router) |
| React | 19.2.3 | UI |
| TypeScript | ^5 | Tipado obligatorio |
| Zustand | ^5.0.11 | Estado global del editor |
| Tailwind CSS | ^4 | Estilos utilitarios |
| Lucide React | ^0.577.0 | Iconografia |
| Recharts | ^3.8.0 | Graficas de analitica |
| clsx | ^2.1.1 | Utilidad de clases condicionales |
| @react-oauth/google | ^0.13.4 | Login social |
| Vitest | ^4.1.0 | Testing |

### Backend

| Dependencia | Version | Proposito |
|---|---|---|
| Django | >=5.1,<6.0 | Framework |
| Django REST Framework | >=3.15 | API REST |
| djangorestframework-simplejwt | >=5.3 | JWT auth |
| django-cors-headers | >=4.4 | CORS |
| Channels + Daphne | >=4.0 | WebSockets (colaboracion) |
| channels-redis | >=4.2 | Channel layer |
| anthropic | >=0.39 | Generacion IA (Anthropic) |
| google-genai | >=1.0 | Generacion IA (Google) |
| stripe | >=8.0 | Pagos |
| psycopg2-binary | >=2.9 | PostgreSQL |
| pytest + pytest-django | >=8.0 | Testing backend |

### Infraestructura

- **DB**: SQLite (dev), PostgreSQL (produccion via DATABASE_URL)
- **Auth**: JWT (access 1h / refresh 7d), Google OAuth, Magic Links, httpOnly cookies
- **Storage**: Media files via Django FileField (upload_to `assets/%Y/%m/`)
- **Realtime**: Django Channels (InMemoryChannelLayer dev, Redis produccion)

---

## 3. Estructura del proyecto

```
landing-cms/
  start-dev.sh                    # Script raiz para arrancar backend + frontend
  Makefile                        # Atajos de desarrollo, tests, lint y typecheck
  frontend/
    app/                          # Rutas Next.js (App Router)
      page.tsx                    # Landing marketing
      layout.tsx                  # Root layout + metadata
      login/                     # Login (email/password + magic link)
      register/                  # Registro
      dashboard/                 # Lista de paginas del usuario
      editor/[pageId]/           # Editor visual
      preview/[pageId]/          # Preview de pagina
      p/[slug]/                  # Pagina publica (SSR + SEO)
      auth/magic/[token]/        # Verificacion magic link
      settings/                  # Settings hub, dominios, billing
    components/
      editor/                    # TopBar, LeftSidebar, CanvasViewport, BlockWrapper, etc.
      blocks/                    # 15 componentes de bloque
      inspector/                 # Inspector de propiedades por bloque
      ui/                        # Primitivos UI (Button, Input, Panel, Tabs, etc.)
      analytics/                 # Componentes de analitica
      dashboard/                 # Componentes del dashboard
      billing/                   # Componentes de billing
    store/
      editor-store.ts            # Zustand store centralizado
    hooks/                       # useAuth, usePageSync, useAutoSave, useEditorShortcuts, etc.
    lib/                         # block-registry, block-factory, api, themes, design-tokens
    types/                       # blocks.ts, page.ts, editor.ts, inspector.ts

  backend/
    config/                      # settings.py, urls.py, asgi.py
    accounts/                    # User model, auth views, JWT + cookies
    pages/                       # Page, Block, Asset, PageVersion, CustomDomain
    ai_generation/               # AIGenerationLog, vistas de generacion IA
    analytics/                   # AnalyticsEvent, tracking de visitantes
    billing/                     # Plan, Subscription, PaymentHistory, Stripe webhooks
    collaboration/               # WebSocket consumers (en desarrollo)
    tests/                       # Tests backend (pytest)

  infrastructure/                # Config de deploy (pendiente)
  docs/                          # Mockups de referencia
```

---

## 3.1 Arranque rapido

Flujo recomendado:

```bash
./start-dev.sh
```

El script:
- valida `backend/.env`, `frontend/.env.local`, `backend/venv` y `nvm`
- corre migraciones
- arranca Django en `8001`
- arranca Next.js en `3000`
- cierra ambos procesos con `Ctrl+C`

Atajos disponibles en la raiz:

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

```bash
cd /Users/davidpalmero/Desktop/landing-cms
source backend/venv/bin/activate
cd backend
python manage.py migrate
python manage.py runserver 8001
```

En otra terminal:

```bash
cd /Users/davidpalmero/Desktop/landing-cms
source "$HOME/.nvm/nvm.sh"
nvm use 20.19.0
cd frontend
npm ci
npm run dev
```

---

## 4. Arquitectura core

### Estructura de bloques

Las paginas se componen de un array de bloques JSON tipados. Cada bloque tiene `id`, `type`, `name`, `data` (Record<string, unknown>) y `styles` (BlockStyles con padding, margin, bgColor, borderRadius). Los bloques se renderizan mediante un patron Factory en `lib/block-factory.ts` que consulta `lib/block-registry.ts`.

Backend: modelo `Block` con campos `type`, `order`, `data` (JSONField), `styles` (JSONField), FK a Page.

### Store de Zustand (`store/editor-store.ts`)

Store centralizado con `subscribeWithSelector`. Acciones principales:

- **Bloques**: `addBlock`, `updateBlock`, `updateBlockStyle`, `deleteBlock`, `duplicateBlock`, `selectBlock`
- **Responsive**: `updateBlockResponsiveStyle` (overrides por tablet/mobile)
- **Historia**: `undo`, `redo`, `setPageWithHistory` (con arrays `past`/`future`)
- **Clipboard**: `copy`, `paste`
- **Viewport**: `setDeviceMode`, `togglePreview`, `setZoom`, `panTo`
- **DnD**: `startDragPending`, `startDrag`, `updateDragPosition`, `endDrag`, `setCanvasDropIndex`
- **Colaboracion**: `setConnectedUsers`, `setRemoteCursors`, `applyRemotePageUpdate`
- **Toasts**: `addToast`, `removeToast`
- **Page**: `setPageWithHistory`, `loadPage`, `setAutoSaveStatus`

### Auto-save

Hook `useAutoSave` suscrito al store via `subscribeWithSelector`. Detecta cambios, aplica debounce de 3s, envia PUT a la API. Indicador visual en TopBar (Guardando.../Guardado/Error). localStorage como fallback si la red falla.

### Owner-based filtering

Todas las queries de Django filtran por `owner=request.user`. Un usuario nunca accede a datos de otro. El ViewSet de Pages usa `get_queryset()` filtrado.

### Modelo de datos (Django)

- **User** (AbstractUser): UUID pk, email unico, google_id, ai_provider, ai_api_key
- **Workspace**: owner FK, nombre
- **Page**: owner FK, workspace FK, name, slug (unique), status (draft/published), theme_id, custom_theme (JSON), design_tokens (JSON), SEO fields (seo_title, seo_description, og_*, noindex)
- **Block**: page FK, type, order, data (JSON), styles (JSON)
- **PageVersion**: page FK, version_number, snapshot (JSON), page_metadata (JSON), trigger, label, size_bytes
- **Asset**: owner FK, workspace FK, name, file (FileField), mime_type, size
- **CustomDomain**: workspace FK, page FK, domain (unique), dns_status, ssl_status, is_active
- **Plan**: name, max_pages, max_ai_generations_per_hour, feature flags
- **Subscription**: workspace FK, plan FK, stripe_subscription_id, status, billing_cycle
- **AnalyticsEvent**: page FK, event_type, visitor_id, block_id, event_data (JSON), UTM params
- **AIGenerationLog**: user FK, page FK, prompt, mode, token counts, cost

---

## 5. Decisiones de producto y arquitectura

Estas decisiones estan tomadas y no deben cuestionarse ni cambiarse sin discusion explicita.

**Modelo de editor: bloques grandes tipados.** No usamos el modelo de Elementor (section > row > column > componente libre). Cada bloque es una unidad atomica con schema definido. Razon: coherencia, mantenibilidad, mejor para IA.

**El tema manda.** Los colores y tipografias se definen en Design Tokens a nivel de pagina. Los bloques consumen tokens, no valores hardcodeados. El usuario no elige colores dentro de un bloque individual -- los elige en el tema.

**Tipografia semantica.** No hay fontSize libre. Cada campo de texto tiene un rol (h1-h6, p, small) y el tema define como se ve cada rol. El usuario no escribe `fontSize: 17px`, elige una posicion en la escala tipografica.

**Modo claro/oscuro global.** Un toggle a nivel de pagina, no por bloque. El tema define las paletas light y dark. Surface alternation (default/alternate) para ritmo visual entre secciones.

**Paletas predefinidas + personalizacion.** El usuario elige una paleta como punto de partida y puede ajustar colores individuales. Validacion de contraste WCAG AA al modificar.

**Roles semanticos en bloques.** Los bloques usan roles de color (`backgroundRole: "primary" | "background" | "surface"`, `buttonRole: "primary" | "secondary"`) en vez de colores directos. Las plantillas se disenan con roles y funcionan con cualquier paleta.

**Quick Edit Mode para movil.** No es una version comprimida del editor desktop. Es un modo optimizado para cambios rapidos: lista de bloques como interfaz principal, bottom sheet para edicion, IA para textos, preview a pantalla completa real. Mismo store, misma API, diferente UI.

**Libertad de sistema, no de pixel.** El spacing usa tokens (sm/md/lg), no pixeles. Los border-radius usan tokens. Los colores se heredan del tema. Los overrides por bloque son la excepcion, no la norma.

**Modelo hibrido como evolucion futura.** Los layout slots internos (secciones con columnas + componentes) y las variantes/skins estan documentados como Future Architecture. No se implementan ahora. La estructura actual de Block es extensible para absorber esta evolucion sin reescritura.

---

## 6. Tipos de bloque disponibles

15 bloques registrados en `lib/block-registry.ts`:

| Tipo | Label | Campos principales de `data` |
|---|---|---|
| `hero` | Hero Section | title, subtitle, buttonText, badgeText, secondaryButtonText, backgroundImage, alignment |
| `features` | Features Grid | title, feature1Title, feature1Desc, feature2Title, feature2Desc |
| `testimonials` | Testimonials | title, quote1, author1, role1, quote2, author2, role2 |
| `cta` | Call to Action | title, subtitle, buttonText |
| `footer` | Footer Simple | brandName, description, copyright, link1Label, link2Label, link3Label |
| `pricing` | Pricing Table | title, plan1Name, plan1Price, plan1Features, plan2Name, plan2Price, plan2Features, billingPeriod, popularBadgeText |
| `faq` | FAQ Accordion | title, q1, a1, q2, a2, q3, a3 |
| `logoCloud` | Logo Cloud | title, logos (array) |
| `gallery` | Gallery Grid | title, images (array) |
| `contact` | Contact Form | title, subtitle, namePlaceholder, emailPlaceholder, messagePlaceholder, buttonText |
| `customHtml` | Custom HTML | html |
| `navbar` | Navigation Bar | brandName, links, ctaText |
| `team` | Team Members | title, members (array con name, role, image) |
| `stats` | Statistics | title, stats (array con label, value) |
| `timeline` | Timeline | title, events (array con date, title, description) |

Cada bloque nuevo debe: registrarse en `block-registry.ts`, tener componente en `components/blocks/`, y seguir la interfaz `BlockProps` (`blockId`, `data`, `isMobile`, `isTablet`, `isPreviewMode`).

---

## 7. Endpoints de la API

### Auth (`/api/auth/`)

| Metodo | Endpoint | Auth | Descripcion |
|---|---|---|---|
| POST | `/register/` | No | Crear cuenta + tokens |
| POST | `/login/` | No | Login + httpOnly cookies |
| POST | `/refresh/` | No | Renovar access token |
| POST | `/logout/` | No | Limpiar cookies |
| POST | `/google/` | No | Login con Google ID token |
| POST | `/magic/request/` | No | Enviar magic link |
| POST | `/magic/verify/` | No | Verificar magic token |
| GET | `/me/` | Si | Usuario actual |
| GET | `/ai-settings/` | Si | Config de IA del usuario |

### Pages (`/api/pages/`)

| Metodo | Endpoint | Auth | Descripcion |
|---|---|---|---|
| GET | `/` | Si | Lista paginada (owner) |
| POST | `/` | Si | Crear pagina + bloques |
| GET | `/{id}/` | Si | Detalle con bloques + SEO |
| PUT | `/{id}/` | Si | Update completo (sync bloques) |
| DELETE | `/{id}/` | Si | Eliminar |
| POST | `/{id}/duplicate/` | Si | Duplicar con bloques |
| GET/POST | `/{id}/versions/` | Si | Listar/crear versiones |
| POST | `/{id}/versions/{vid}/restore/` | Si | Restaurar version |

### Public

| Metodo | Endpoint | Auth | Descripcion |
|---|---|---|---|
| GET | `/api/public/pages/{slug}/` | No | Pagina publicada por slug |
| GET | `/api/sitemap/` | No | Sitemap XML (cache 1h) |
| GET | `/api/public/sitemap-data/` | No | JSON para Next.js sitemap |
| GET | `/api/public/resolve-domain/` | No | Resolver dominio custom |

### Assets, Domains, AI, Analytics, Billing

| Metodo | Endpoint | Auth | Descripcion |
|---|---|---|---|
| GET/POST | `/api/assets/` | Si | Listar/subir assets |
| GET/POST/DELETE | `/api/domains/` | Si (Pro) | CRUD dominios custom |
| POST | `/api/domains/{id}/verify/` | Si | Verificar DNS |
| POST | `/api/pages/{id}/generate/` | Si | Generar pagina con IA |
| POST | `/api/pages/{id}/blocks/{bid}/edit-ai/` | Si | Editar bloque con IA |
| POST | `/api/analytics/collect/` | No | Trackear evento |
| GET | `/api/pages/{id}/analytics/` | Si | Analitica de pagina |
| GET | `/api/billing/plans/` | No | Planes disponibles |
| GET | `/api/billing/subscription/` | Si | Suscripcion actual |
| POST | `/api/billing/checkout/` | Si | Crear sesion Stripe |
| POST | `/api/billing/webhook/` | No | Webhook de Stripe |

---

## 8. Convenciones de codigo

### Naming

- **Archivos React**: PascalCase (`HeroBlock.tsx`, `CanvasViewport.tsx`)
- **Archivos lib/hooks/types**: camelCase o kebab-case (`block-registry.ts`, `useAuth.ts`, `editor-store.ts`)
- **Archivos Django**: snake_case (`models.py`, `serializers.py`)
- **Componentes React**: PascalCase, functional components con arrow functions
- **Variables/funciones TS**: camelCase
- **Variables/funciones Python**: snake_case
- **Constantes**: camelCase para objetos (`blockRegistry`), UPPER_SNAKE para Django settings

### Estructura de componentes

```tsx
// Imports (lucide, types, hooks, store, lib, components)
// Types/interfaces locales
// Component (arrow function, export default)
```

### Patrones

- Functional components exclusivamente, sin class components
- Hooks custom en `hooks/` para logica reutilizable
- Store Zustand como unica fuente de verdad del editor (sin prop drilling)
- Tailwind CSS con arbitrary values (`bg-[#1F2937]/80`) para el design system
- `clsx()` para clases condicionales
- Django: serializers en `serializers.py`, views en `views.py`, URLs via DRF router

### Linting y testing

- ESLint (eslint-config-next) para frontend
- Vitest + Testing Library para tests frontend
- pytest + pytest-django para tests backend
- No hay Prettier configurado; seguir estilo existente

---

## 9. Estado actual del proyecto

### Completado

- Editor visual completo: canvas, DnD, inline editing, zoom/pan, undo/redo, device modes
- 15 tipos de bloque con inspector reactivo
- Auth: JWT + Google OAuth + Magic Links con httpOnly cookies
- Dashboard con sidebar, stats, cards de paginas
- Auto-save con debounce 3s
- Paginas publicas en `/p/[slug]` con SSR + SEO metadata
- Version history con snapshots y restore
- Temas predefinidos (8) + Design Tokens custom (color, tipografia, spacing, borders)
- Responsive styles por bloque (tablet/mobile overrides)
- AI generation (full page + edit block) con Anthropic y Google
- Analytics tracking (pageview, click, scroll, CTA conversion)
- Billing con Stripe (planes, checkout, webhooks)
- Custom domains con verificacion DNS
- Asset upload y galeria
- Accesibilidad: aria-labels, focus traps, keyboard nav, reduced motion
- Design system Paxl: `#2563EB` primary blue, superficies `#0A0F1A`/`#111827`/`#1F2937`, tipografia DM Sans + JetBrains Mono

### En desarrollo

- Quick Edit Mode (editor movil)
- Colaboracion en tiempo real (WebSocket consumers)

### Roadmap futuro (no implementar sin instrucciones explicitas)

- Colaboracion completa (cursores, locks por bloque)
- A/B Testing
- Componentes avanzados + layout slots
- i18n
- Deploy produccion (Vercel + Railway/Fly.io)

---

## 10. Reglas para generar codigo

1. Nunca generes codigo para fases futuras sin que te lo pida explicitamente.
2. Respeta los patrones existentes. Si los componentes usan un estilo determinado, sigue ese estilo.
3. Los bloques nuevos deben seguir la misma estructura que los existentes (registrarse en block-registry, tener componente en `blocks/`, seguir `BlockProps`).
4. No agregues dependencias nuevas sin justificacion. Prefiere implementaciones nativas cuando la funcionalidad es simple.
5. Todo nuevo endpoint debe tener owner-based filtering.
6. Todo nuevo campo visible al usuario debe ser accesible (labels, roles ARIA, targets tactiles de 44px en movil).
7. No reescribas modulos completos desde cero. Modifica incrementalmente.
8. No cambies el diseno visual salvo que se solicite explicitamente.
9. Mantener la funcionalidad existente en cada cambio.

---

## 11. Estándares de calidad y buenas prácticas

### Clean Code

- Funciones pequeñas con responsabilidad única. Si una función hace fetch + transformación + render, dividirla.
- Nombres descriptivos: `fetchPageBlocks()` en vez de `getData()`, `isPublished` en vez de `flag`.
- Consistencia en patterns: si un slice de Zustand sigue un patrón (action + selector), todos lo siguen igual.
- Un componente React hace UNA cosa: renderizar UI. La lógica vive en hooks/services, los datos en el store.

### Tipado estricto

- TypeScript `strict: true`. Prohibido `any` — usar `unknown` + type guards si el tipo es dinámico.
- Los tipos son documentación viva: si cambias la lógica, actualiza el tipo primero.
- Interfaces para contratos públicos (props, API responses), types para uniones y utilidades.

### Separación de capas

```
UI (componentes) → hooks/services → API client (lib/api.ts) → Backend → DB
```

- Un componente nunca hace `fetch()` directo. Usa `lib/api.ts` o un hook.
- Un hook no renderiza UI. Un servicio no conoce React.
- Backend: serializers validan y transforman, views orquestan, models encapsulan lógica de dominio.

### Error handling

- Nunca silenciar errores. `catch {}` vacío está prohibido.
- Frontend: error boundaries en React para fallos de render. `try/catch` con feedback al usuario (toast, inline error).
- Backend: respuestas de error consistentes: `{ "error": "mensaje", "code": "ERROR_CODE" }`.
- Logging estructurado: en backend usar `logger.error()` con contexto, nunca `print()`.

### Validación

- Siempre validar en servidor, aunque ya se valide en cliente. El cliente es conveniencia UX, el servidor es seguridad.
- Backend: serializers de DRF como capa de validación obligatoria. Para lógica compleja, considerar validadores custom.
- Frontend: validar antes de enviar para UX, pero nunca confiar en que el frontend validó.

### Seguridad

- Queries parametrizadas siempre. Nunca concatenar strings para queries SQL o ORM filters con input del usuario.
- CSRF tokens activos en Django (excepto endpoints JWT stateless).
- Rate limiting en endpoints sensibles: login, register, magic link, AI generation.
- Headers de seguridad: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`.
- JWT: validación de firma en servidor, access tokens con expiración corta (1h), refresh tokens rotados (7d).
- Nunca exponer stack traces, IDs internos o configuración en respuestas de error de producción.

### Idempotencia

- Endpoints de mutación críticos (pagos, publicación, duplicación) deben soportar `idempotency_key`.
- Upserts en vez de inserts ciegos donde aplique.
- Especialmente crítico en integración con Stripe: webhooks pueden llegar duplicados.

### Performance

- Lazy loading para rutas y componentes pesados (`next/dynamic`, `React.lazy`).
- Paginación obligatoria en endpoints que devuelven listas (`?page=1&page_size=20`).
- Índices en DB para campos usados en filtros y ordenamiento.
- Caché con invalidación correcta: nunca cachear sin estrategia de invalidación.
- Imágenes: `next/image` con `width`/`height` explícitos, formatos modernos (WebP/AVIF).

### Anti-patterns explícitos

| Prohibido | Alternativa |
|---|---|
| `console.log` en producción | `logger.info/warn/error` o eliminar |
| `any` en TypeScript | `unknown` + type guard |
| Queries sin parametrizar | ORM o prepared statements |
| Merge sin review | PR con al menos 1 revisión |
| `// TODO` sin ticket | `// TODO(PAXL-123): descripción` |
| `catch {}` vacío | `catch (e) { logger.error(e); throw }` o manejar |
| Secrets en código | Variables de entorno via `.env` |
| `!important` en CSS | Especificidad correcta o refactor |

---

## Como ejecutar

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed          # Datos de ejemplo (opcional)
python manage.py runserver 8001

# Frontend
cd frontend
npm install
npm run dev                    # http://localhost:3000

# Tests
cd frontend && npx vitest run
cd backend && pytest
```

### Paleta Paxl

| Token | Valor | Uso |
|---|---|---|
| Primary | `#2563EB` | Botones, acciones, focus rings, acentos interactivos |
| Primary hover | `#1D4ED8` | Hover en botones primarios |
| Surface base | `#0A0F1A` | Canvas, fondo principal |
| Surface elevated | `#111827` | Inputs, paneles secundarios |
| Surface card | `#1F2937` | Cards, paneles, modales (glass: `/80 backdrop-blur-2xl`) |
| Border default | `#374151` | Bordes (con opacidad `/10` a `/30`) |
| Border subtle | `#1F2937` | Bordes sutiles, separadores |
| Text primary | `#F9FAFB` | Texto principal |
| Text secondary | `#9CA3AF` | Texto secundario |
| Text muted | `#6B7280` | Texto deshabilitado, placeholders |
| Success | `#10B981` | Estados exitosos |
| Warning | `#F59E0B` | Advertencias |
| Error | `#EF4444` | Errores, acciones destructivas |

### Tipografia

| Fuente | Uso |
|---|---|
| DM Sans | Headings, body text, UI general |
| JetBrains Mono | Codigo, valores monospace, inputs tecnicos |

### Tokens de forma

| Token | Valor |
|---|---|
| Border radius small | 6px |
| Border radius medium | 8-12px |
| Border radius large | 16px |
| Spacing base | Multiplos de 4px |

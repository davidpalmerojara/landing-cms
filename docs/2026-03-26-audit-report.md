# Auditoría Integral — 2026-03-26

Proyecto auditado: `landing-cms` / Paxl  
Documentación base leída completa: `CLAUDE.md`, `AGENTS.md`, `DECISIONS.md`

## Alcance y método

- Auditoría estática de frontend y backend contra los estándares descritos en `CLAUDE.md`, `AGENTS.md` y `DECISIONS.md`.
- Auditoría responsive basada en código, rutas reales, clases Tailwind y layout composition.
- Auditoría de consistencia de textos, branding e i18n basada en barrido repo-wide.
- Auditoría de sincronía frontend-backend basada en `frontend/lib/api.ts`, fetches directos y `backend/*/urls.py`.
- Auditoría de readiness de deploy con ejecución real de tests, typecheck, lint y build.

Limitaciones:

- La auditoría responsive es estática. No hubo sesión de navegador ni screenshots automáticos porque el repo no trae E2E ni Playwright configurado.
- En categorías con cientos de incidencias de bajo nivel, el informe prioriza bloqueadores, patrones sistémicos y los archivos con más densidad de deuda.

## Resultados ejecutados

- Backend tests: `148 passed, 110 warnings`
- Frontend tests: `95 passed (8 files)`
- Typecheck frontend: `1 error`
- ESLint frontend: `0 errors, 45 warnings`
- Build frontend: `OK` con Node `20.19.0`

Detalles operativos:

- `frontend/package.json` exige Node `>=20.19.0`; con `20.17.0` Vitest falló por incompatibilidad ESM.
- El build de Next pasó cuando el entorno pudo resolver `next/font/google`.
- Tamaño emitido en `.next/static`: `1,646,162` bytes JS + `103,905` bytes CSS.
- Chunk más grande: `frontend/.next/static/chunks/0q.d58gdgwwcb.js` con `582,615` bytes.

---

## Tarea 1 — Auditoría de estándares de código

## Resumen ejecutivo

Totales confirmados o mínimos observados por categoría:

| Categoría | Total | Blocker | Major | Minor |
|---|---:|---:|---:|---:|
| 1. Clean Code | `>=81` | 0 | `>=18` | `>=63` |
| 2. Tipado estricto | `192` | 1 | 69 | 122 |
| 3. Separación de capas | `>=24` | 0 | `>=18` | `>=6` |
| 4. Error handling | `>=14` | 0 | `>=10` | `>=4` |
| 5. Validación | `>=7` | 0 | `>=6` | `>=1` |
| 6. Seguridad | `>=8` | 0 | `>=6` | `>=2` |
| 7. Idempotencia | `>=8` | 0 | `>=7` | `>=1` |
| 8. Performance | `>=35` | 0 | `>=20` | `>=15` |
| 9. Anti-patterns | `4` | 0 | 2 | 2 |

### 1. Clean Code

Total violaciones confirmadas: `>=81` (`0 blocker`, `>=18 major`, `>=63 minor`)

Hallazgos principales:

- `frontend/app/dashboard/page.tsx:28`
  Regla violada: función/componente de 559 líneas.
  Código problemático: `export default function DashboardPage() { ... }`
  Fix recomendado: extraer `Sidebar`, `Header`, `StatsRow`, `PagesGrid`, `EmptyState`, `CreateFlow`.
  Severidad: `major`

- `frontend/components/mobile-editor/MobileEditor.tsx:31`
  Regla violada: función/componente de 530 líneas.
  Código problemático: `export default function MobileEditor(...) { ... }`
  Fix recomendado: separar `TopBar`, `BlockList`, `PublishSheet`, `AddBlockSheet`, `MobilePreview`.
  Severidad: `major`

- `frontend/components/editor/TopBar.tsx:28`
  Regla violada: función/componente de 351 líneas.
  Código problemático: `function TopBar(...) { ... }`
  Fix recomendado: extraer `SaveStatus`, `PublishActions`, `VersionActions`, `ShareActions`, `PreviewActions`.
  Severidad: `major`

- `backend/ai_generation/views.py:64`
  Regla violada: una sola función concentra authz, validación, rate limit, prompt building, llamada a proveedor, persistencia y logging.
  Código problemático: `GeneratePageView.post`
  Fix recomendado: mover validación a serializer, rate limiting a throttle/service, llamada IA a service, persistencia a coordinator.
  Severidad: `major`

- `backend/analytics/views.py:141`
  Regla violada: lógica de agregación/negocio compleja incrustada en la view.
  Código problemático: `PageAnalyticsView.get`
  Fix recomendado: extraer service de analítica con funciones por métrica y query layer específica.
  Severidad: `major`

- `frontend/hooks/usePageSync.ts:123`
  Regla violada: demasiadas responsabilidades en un solo hook.
  Código problemático: carga inicial + fallback localStorage + mapping API<->store + guardado + publicación.
  Fix recomendado: dividir en `usePageLoader`, `usePageSaver`, `pageMappers.ts`.
  Severidad: `major`

- `frontend/hooks/useIsQuickEditMode.ts:18`
  Regla violada: naming genérico.
  Código problemático: `const handler = (...) => { ... }`
  Fix recomendado: renombrar a `handleMediaQueryChange`.
  Severidad: `minor`

- `frontend/hooks/usePageSync.ts:58`
  Regla violada: naming genérico en mapper con lógica de transformación grande.
  Código problemático: `function localPageToApi(page: Page) { ... }`
  Fix recomendado: mantener el nombre, pero separar `mapSeoToApi`, `mapBlocksToApi`, `mapThemeToApi`.
  Severidad: `minor`

- `frontend/store/editor-store.ts`
  Regla violada: patrón inconsistente de tipado/acciones en el slice de Zustand.
  Código problemático: decenas de actions públicas sin tipos explícitos de params/retorno.
  Fix recomendado: extraer acciones por dominio (`blocks`, `theme`, `viewport`, `collaboration`) y tipar firmas.
  Severidad: `major`

Datos cuantitativos:

- Funciones >50 líneas en frontend: `66`
- Funciones >50 líneas en backend: `15`
- Top frontend:
  `frontend/app/dashboard/page.tsx:28` `DashboardPage` `559`
  `frontend/components/mobile-editor/MobileEditor.tsx:31` `530`
  `frontend/components/editor/TopBar.tsx:28` `351`
  `frontend/components/mobile-editor/MobileBlockCard.tsx:68` `316`
  `frontend/components/inspector/AssetPickerModal.tsx:16` `301`
- Top backend:
  `backend/ai_generation/prompts.py:8` `get_system_prompt` `217`
  `backend/ai_generation/views.py:64` `post` `180`
  `backend/analytics/views.py:141` `get` `170`
  `backend/ai_generation/views.py:249` `post` `153`
  `backend/billing/views.py:96` `post` `80`

### 2. Tipado Estricto

Total violaciones confirmadas: `192` (`1 blocker`, `69 major`, `122 minor`)

Estado base:

- `frontend/tsconfig.json:7`
  Regla verificada: `strict: true`
  Resultado: `OK`
  Severidad: `none`

Hallazgos:

- `frontend/__tests__/mobile-editor/test-utils.tsx:119`
  Regla violada: typecheck roto.
  Código problemático: `mql.matches = width < 768;`
  Fix recomendado: recrear el objeto `MediaQueryList`, usar descriptor mutable propio o un wrapper tipado para tests.
  Severidad: `blocker`

- `frontend/backend`
  Regla verificada: usos de `: any`, `as any`, `@ts-ignore`, `@ts-expect-error`
  Resultado: `0` usos reales en código del proyecto.
  Nota: solo aparece un comentario documental en `backend/ai_generation/block_schemas.py:8`.
  Severidad: `none`

- `frontend/lib/api.ts`
  Regla violada: helpers públicos sin tipo de retorno explícito.
  Código problemático: `register`, `login`, `googleLogin`, `pages.list`, `versions.restore`, `domains.verify`, etc.
  Fix recomendado: añadir `Promise<...>` explícito a todos los métodos públicos del API client.
  Severidad: `major`

- `frontend/store/editor-store.ts`
  Regla violada: parámetros públicos sin tipar.
  Código problemático: `addBlock(type, label, index, initialData)`, `updateBlock(id, key, value)`, `setTheme(themeId)`, `replaceBlockData(blockId, newType, newData)`, etc.
  Fix recomendado: declarar firmas explícitas en la implementación y no depender solo del interface estructural.
  Severidad: `major`

- `frontend/lib/block-factory.ts:5`
  Regla violada: parámetro sin tipar.
  Código problemático: `generateId(prefix)`
  Fix recomendado: `generateId(prefix: string): string`
  Severidad: `minor`

- `frontend/lib/templates.ts:4`
  Regla violada: parámetro sin tipar.
  Código problemático: `generateId(prefix)`
  Fix recomendado: `generateId(prefix: string): string`
  Severidad: `minor`

Datos cuantitativos:

- Funciones nombradas sin retorno explícito en `frontend/lib`, `frontend/hooks`, `frontend/store`: `122`
- Parámetros sin tipar en esos módulos: `69`
- Concentración:
  `frontend/store/editor-store.ts` concentra `67/69` parámetros sin tipar.
  `frontend/lib/api.ts` concentra la mayoría de funciones públicas sin retorno explícito.

### 3. Separación de Capas

Total violaciones confirmadas: `>=24` (`0 blocker`, `>=18 major`, `>=6 minor`)

Hallazgos:

- `frontend/app/settings/domains/page.tsx`
  Regla violada: componente de UI llama directamente a `api.*`.
  Código problemático: `api.domains.list/create/verify/delete`, `api.pages.list`, `api.billing.subscription`.
  Fix recomendado: mover a `useDomainsSettings()` o service con estado y side effects encapsulados.
  Severidad: `major`

- `frontend/app/settings/billing/page.tsx`
  Regla violada: componente de UI mezcla fetch, transformación y render.
  Código problemático: `api.billing.plans/subscription/payments/checkout/portal`
  Fix recomendado: `useBillingSettings()` + formateadores fuera del componente.
  Severidad: `major`

- `frontend/app/dashboard/page.tsx`
  Regla violada: pantalla orquesta CRUD directamente.
  Código problemático: `api.pages.list/create/duplicate/delete`
  Fix recomendado: hook `useDashboardPages()`.
  Severidad: `major`

- `frontend/app/p/[slug]/page.tsx:34`
  Regla violada: fetch directo desde un server component sin centralizar contrato.
  Código problemático: `fetch(`${API_BASE}/public/pages/${slug}/`)`
  Fix recomendado: centralizar en `lib/public-pages.ts` o reutilizar el cliente de contrato.
  Severidad: `minor`

- `backend/ai_generation/views.py:64`
  Regla violada: view con demasiada lógica de negocio.
  Código problemático: validación manual, rate limit, provider resolution, retries, persistencia.
  Fix recomendado: serializer + `ai_generation/services.py`.
  Severidad: `major`

- `backend/analytics/views.py:141`
  Regla violada: view usada como service de agregación.
  Código problemático: cálculo de métricas, bounce rate, CTR, referrers y device breakdown.
  Fix recomendado: mover a un service puro reutilizable y testeable.
  Severidad: `major`

- `backend/billing/views.py:96`
  Regla violada: lógica de negocio de Stripe incrustada en la view.
  Código problemático: customer creation + checkout session orchestration.
  Fix recomendado: `billing/services/checkout.py`.
  Severidad: `major`

Datos cuantitativos:

- Call sites directos a `api.*` en frontend productivo: `43`
- Archivos con mayor acoplamiento:
  `frontend/hooks/usePageSync.ts` `7`
  `frontend/app/settings/domains/page.tsx` `6`
  `frontend/app/settings/billing/page.tsx` `5`
  `frontend/app/dashboard/page.tsx` `4`

### 4. Error Handling

Total violaciones confirmadas: `>=14` (`0 blocker`, `>=10 major`, `>=4 minor`)

Hallazgos:

- `backend/config/exception_handler.py:14-17`
  Regla violada: contrato de error inconsistente.
  Código problemático: devuelve solo `{error}` y solo normaliza `404/500`.
  Fix recomendado: estandarizar todas las respuestas a `{ error: string, code: string, details?: unknown }`.
  Severidad: `major`

- `backend/analytics/views.py:43,52,55,82,84`
  Regla violada: respuestas de error/success sin payload consistente.
  Código problemático: `Response(status=...)`
  Fix recomendado: devolver `code` semántico también en `400/404/500`; mantener `204` solo donde aporte valor real.
  Severidad: `major`

- `backend/billing/views.py:225-244,258,275`
  Regla violada: webhook retorna status codes desnudos.
  Código problemático: `Response(status=...)`
  Fix recomendado: al menos log estructurado + códigos consistentes para inspección operativa.
  Severidad: `major`

- `backend/pages/views.py:172`
  Regla violada: `catch` vacío.
  Código problemático: `except Exception: pass` al enviar email de share.
  Fix recomendado: loggear y devolver warning al cliente o telemetría interna.
  Severidad: `major`

- `backend/pages/views.py:386`
  Regla violada: `catch` vacío.
  Código problemático: `except Exception: pass` al broadcast WS de restore.
  Fix recomendado: `logger.warning(...)`.
  Severidad: `major`

- `frontend/components/editor/VersionHistoryPanel.tsx:84,93`
  Regla violada: errores ignorados.
  Código problemático: `catch { /* ignore */ }`
  Fix recomendado: toast/error state.
  Severidad: `major`

- `frontend/app/sitemap.ts:21-22,39-40`
  Regla violada: fallos de red ignorados por completo.
  Código problemático: `catch { // ignore }`
  Fix recomendado: registrar fallo o usar fetch wrapper con fallback observable.
  Severidad: `minor`

- `frontend/app/preview/[pageId]/page.tsx:134-135`
  Regla violada: fallo silencioso al publicar.
  Código problemático: `catch { // silently fail }`
  Fix recomendado: feedback de error y rollback visual.
  Severidad: `major`

- `frontend/hooks/usePageSync.ts:16-20`
  Regla violada: solo `console.error` en vez de canal consistente.
  Código problemático: `logSyncError`
  Fix recomendado: cliente centralizado de logging/reporting.
  Severidad: `minor`

### 5. Validación

Total violaciones confirmadas: `>=7` (`0 blocker`, `>=6 major`, `>=1 minor`)

Estado base:

- `zod` no se usa en servidor.
- La validación principal del backend hoy está en serializers DRF y validadores propios.

Hallazgos:

- `backend/ai_generation/views.py:77-90`
  Regla violada: input del usuario validado manualmente en view.
  Código problemático: `prompt`, `tone`, `language` via `request.data.get(...)`
  Fix recomendado: `GeneratePageSerializer`.
  Severidad: `major`

- `backend/ai_generation/views.py:271-280`
  Regla violada: input del usuario validado manualmente en view.
  Código problemático: `instruction`
  Fix recomendado: `EditBlockSerializer`.
  Severidad: `major`

- `backend/billing/views.py:102-107`
  Regla violada: input del usuario validado manualmente.
  Código problemático: `cycle = request.data.get(...)`
  Fix recomendado: serializer de checkout.
  Severidad: `major`

- `backend/pages/views.py:130-135`
  Regla violada: share sin serializer dedicado.
  Código problemático: `email = request.data.get('email', '').strip()`
  Fix recomendado: `SharePageSerializer`.
  Severidad: `major`

- `backend/pages/views.py:209-214`
  Regla violada: unshare sin serializer dedicado.
  Código problemático: `user_id = request.data.get('user_id', '').strip()`
  Fix recomendado: `UnsharePageSerializer`.
  Severidad: `major`

- `backend/pages/views.py:291,307`
  Regla violada: labels de versionado manualmente validados.
  Código problemático: `label = request.data.get('label', '')`
  Fix recomendado: serializer dedicado a create/update de versiones.
  Severidad: `major`

- `frontend/app/register/page.tsx:24-27`
  Regla violada: validación presente en frontend y no simétrica como UX de parseo.
  Código problemático: password mismatch se valida localmente y luego se parsea el error del backend con `JSON.parse` sobre el mensaje.
  Fix recomendado: contrato tipado de errores DRF.
  Severidad: `minor`

### 6. Seguridad

Total violaciones confirmadas: `>=8` (`0 blocker`, `>=6 major`, `>=2 minor`)

Hallazgos:

- `backend/collaboration/consumers.py:29-37`
  Regla violada: control de acceso insuficiente.
  Código problemático: `return Page.objects.filter(pk=page_id).exists()`
  Fix recomendado: exigir owner o collaborator real.
  Severidad: `major`

- `frontend/hooks/useAuth.ts:15-19`
  Regla violada: el frontend sigue tratando `localStorage` como prerequisito de auth, contradiciendo `ADR-008`.
  Código problemático: si no hay token local, redirige sin probar `/auth/me/` con cookie.
  Fix recomendado: autenticación cookie-first real.
  Severidad: `major`

- `frontend/hooks/useCollaboration.ts:212`
  Regla violada: JWT en query string de WebSocket.
  Código problemático: ``${WS_BASE}/ws/pages/${pageId}/?token=${token}``
  Fix recomendado: cookie auth o header/subprotocol controlado.
  Severidad: `major`

- `frontend/components/blocks/CustomHtmlBlock.tsx:11`
  Regla verificada: `dangerouslySetInnerHTML`.
  Estado: está parcialmente justificado porque backend sanitiza en `backend/pages/block_sanitizers.py:77-88` y `backend/pages/serializers.py:42-52`.
  Riesgo residual: sigue siendo una superficie sensible.
  Severidad: `minor`

- `backend/config/settings.py:207-217`
  Regla verificada: headers de seguridad en Django.
  Estado: `SecurityMiddleware`, CSRF, `X_FRAME_OPTIONS`, HSTS y cookies seguras en prod están presentes.
  Severidad: `none`

- `frontend/next.config.ts:3-5`
  Regla violada: no hay headers frontend adicionales ni CSP.
  Código problemático: config vacía.
  Fix recomendado: `headers()` con CSP básica, `Referrer-Policy`, `Permissions-Policy`.
  Severidad: `major`

- SQL sin parametrizar
  Resultado: no se encontraron usos de `.raw()`, `cursor()`, `execute()` o `RawSQL` en código del proyecto.
  Severidad: `none`

- Secrets hardcodeados
  Resultado: no se encontraron secrets activos en fuente.
  Riesgo residual: persisten defaults y branding viejo de BuilderPro en config/infrastructure.
  Severidad: `minor`

### 7. Idempotencia

Total violaciones confirmadas: `>=8` (`0 blocker`, `>=7 major`, `>=1 minor`)

Hallazgos:

- `backend/billing/views.py:246-258`
  Regla verificada: Stripe webhook sí implementa idempotencia con `WebhookLog.objects.get_or_create(...)`.
  Resultado: `OK`
  Severidad: `none`

- `backend/billing/views.py:96-175`
  Regla violada: checkout sin `idempotency_key` de cliente.
  Código problemático: `CreateCheckoutView.post`
  Fix recomendado: aceptar `Idempotency-Key` o key explícita y propagarla a Stripe.
  Severidad: `major`

- `backend/pages/views.py:94-115`
  Regla violada: duplicate crea copias sin protección de replay.
  Código problemático: `duplicate`
  Fix recomendado: idempotency token o deduplicación temporal.
  Severidad: `major`

- `backend/pages/views.py:118-175`
  Regla violada: share no es idempotente a nivel request.
  Código problemático: puede reenviar email/side effects al repetir POST.
  Fix recomendado: request idempotency o side-effect guard.
  Severidad: `major`

- `backend/ai_generation/views.py:64-243`
  Regla violada: generación IA muta la página sin protección ante retries del cliente.
  Código problemático: reemplaza bloques completos.
  Fix recomendado: `idempotency_key` por generación.
  Severidad: `major`

- `backend/ai_generation/views.py:249-383`
  Regla violada: edit block AI tampoco es idempotente.
  Severidad: `major`

- `backend/pages/views.py:330-392`
  Regla violada: restore de versiones no tiene deduplicación.
  Severidad: `major`

- `backend/pages/views.py:571-621`
  Regla violada: verify domain es replayable sin guard explícito.
  Severidad: `minor`

### 8. Performance

Total violaciones confirmadas: `>=35` (`0 blocker`, `>=20 major`, `>=15 minor`)

Hallazgos:

- `frontend/app` y `frontend/components`
  Regla violada: no se encontraron `React.lazy()` ni `next/dynamic()`.
  Código problemático: `0` usos.
  Fix recomendado: lazy-load de modales pesados, analytics, version history, AI, asset library.
  Severidad: `major`

- `frontend/components/blocks/NavbarBlock.tsx:21`
  Regla violada: `<img>` sin optimización.
  Fix recomendado: `next/image` o estrategia de imagen optimizada.
  Severidad: `major`

- `frontend/components/blocks/GalleryBlock.tsx:55`
  Regla violada: `<img>` sin optimización.
  Severidad: `major`

- `frontend/components/editor/SeoPanel.tsx:97,260`
  Regla violada: `<img>` sin optimización.
  Severidad: `minor`

- `frontend/components/editor/TopBar.tsx:397`
  Regla violada: `<img>` sin optimización.
  Severidad: `minor`

- `backend/pages/serializers.py:91-93`
  Regla violada: patrón N+1 probable.
  Código problemático: `obj.blocks.order_by('order')[:4]` por página en `PageListSerializer`.
  Fix recomendado: precargar preview blocks o anotar snapshot/lite fields.
  Severidad: `major`

- `backend/pages/views.py:66-72`
  Regla violada: queryset sin `select_related('owner')` pese a usar `owner.username` en serializer list.
  Fix recomendado: añadir `select_related('owner')`.
  Severidad: `major`

- `backend/billing/views.py:80`
  Regla violada: lista sin contrato paginado.
  Código problemático: `sub.payments.all()[:20]`
  Fix recomendado: paginación DRF real.
  Severidad: `minor`

- `backend/pages/views.py:489-506`
  Regla violada: `public/sitemap-data` devuelve lista completa sin paginación.
  Severidad: `minor`

- `backend/pages/models.py:76-78`
  Regla violada: faltan índices explícitos en `Page` para patrones comunes (`owner`, `workspace`, `status`, `updated_at`).
  Fix recomendado: añadir índices compuestos.
  Severidad: `major`

### 9. Anti-patterns

Total violaciones confirmadas: `4` (`0 blocker`, `2 major`, `2 minor`)

Hallazgos:

- `frontend/hooks/usePageSync.ts:19`
  Regla violada: `console.error` en runtime.
  Fix recomendado: logger centralizado.
  Severidad: `major`

- `frontend/hooks/useCollaboration.ts:17`
  Regla violada: `console.warn` en runtime.
  Fix recomendado: canal de observabilidad controlado.
  Severidad: `minor`

- `backend/pages/block_validators.py:106`
  Regla violada: `TODO` sin ticket/issue.
  Fix recomendado: referenciar issue o convertir en ADR/backlog.
  Severidad: `minor`

- `frontend/hooks/usePageSync.ts:17`
  Regla violada: `TODO` sin ticket/issue.
  Fix recomendado: referenciar issue.
  Severidad: `major`

### Top 20 violaciones más graves

1. `frontend/hooks/useAuth.ts:15-19` rompe el modelo cookie-first de `ADR-008` y puede expulsar usuarios autenticados por cookie. `blocker`
2. `frontend/app/preview/[pageId]/page.tsx:205-206` fuerza desktop mode siempre; la preview autenticada no es responsive al redimensionar. `blocker`
3. `frontend/__tests__/mobile-editor/test-utils.tsx:119` rompe `tsc --noEmit`. `blocker`
4. `backend/collaboration/consumers.py:29-37` acepta cualquier usuario autenticado para cualquier página existente. `major`
5. `backend/config/exception_handler.py:14-17` no estandariza el contrato de error; el frontend parsea strings frágiles. `major`
6. `frontend/app/preview/[pageId]/page.tsx:45-54` introduce “Guardar” manual falso, contradiciendo el autosave documentado. `major`
7. `frontend/components/editor/BrowserFrame.tsx:31-33,48,57` usa anchos mínimos rígidos que hacen frágil el editor a `1024px`. `major`
8. `frontend/app/layout.tsx:27` mantiene `lang="en"` con UI mayoritariamente en español. `major`
9. No existe sistema de i18n real, pero hay `478` strings UI hardcodeadas detectadas heurísticamente. `major`
10. `frontend/proxy.ts:9,16-18,25` y múltiples archivos mantienen referencias a BuilderPro. `major`
11. `backend/ai_generation/views.py:64-243` mezcla demasiadas responsabilidades críticas en una sola view. `major`
12. `backend/analytics/views.py:141-310` concentra agregación pesada y decisiones de negocio en la view. `major`
13. `backend/pages/views.py:172` ignora fallos de email al compartir. `major`
14. `backend/pages/views.py:386` ignora fallos de broadcast al restaurar versión. `major`
15. `frontend/components/editor/VersionHistoryPanel.tsx:84,93` ignora errores en update/delete. `major`
16. `frontend/app/login/page.tsx:88,100,127` inputs `text-sm` bajo `16px`, con riesgo de zoom en iOS. `major`
17. `frontend/app/register/page.tsx:76,88,100,112` mismo problema de inputs sub-16px. `major`
18. `backend/pages/serializers.py:91-93` genera N+1 para previews del dashboard. `major`
19. `frontend/app/settings/domains/page.tsx` centraliza demasiada lógica de fetch/estado/render en un solo componente. `major`
20. `frontend/next.config.ts:3-5` permanece vacía; no hay CSP ni headers frontend adicionales. `major`

### Archivos más problemáticos

Ranking heurístico por densidad de deuda observada en longitud, acoplamiento API y texto hardcodeado:

| Archivo | Score | Long functions | API calls | Hardcoded texts |
|---|---:|---:|---:|---:|
| `frontend/app/settings/domains/page.tsx` | 105 | 3 | 6 | 39 |
| `frontend/app/dashboard/page.tsx` | 72 | 1 | 4 | 38 |
| `frontend/app/page.tsx` | 68 | 1 | 0 | 58 |
| `frontend/app/settings/billing/page.tsx` | 67 | 2 | 5 | 17 |
| `frontend/hooks/usePageSync.ts` | 52 | 1 | 7 | 0 |
| `frontend/components/editor/TopBar.tsx` | 51 | 1 | 1 | 35 |
| `frontend/app/login/page.tsx` | 48 | 1 | 3 | 20 |
| `frontend/components/dashboard/AIGenerateModal.tsx` | 40 | 1 | 3 | 12 |
| `frontend/components/editor/VersionHistoryPanel.tsx` | 39 | 1 | 3 | 11 |
| `frontend/app/preview/[pageId]/page.tsx` | 38 | 2 | 2 | 6 |

---

## Tarea 2 — Auditoría responsive completa

## Problemas por página

### Auth

- `frontend/app/login/page.tsx:88,100,127`
  Problema: inputs con `text-sm` en mobile, potencial zoom en iOS.
  Viewports: `375`, `428`
  Fix sugerido: `text-base` o `text-[16px]`.
  Severidad: `major`

- `frontend/app/register/page.tsx:76,88,100,112`
  Problema: mismo patrón sub-16px en inputs.
  Viewports: `375`, `428`
  Fix sugerido: `text-base`.
  Severidad: `major`

- `frontend/app/login/page.tsx:108,135,175,183`
  Verificación: botones cumplen altura razonable con `py-2.5`; no vi un blocker de touch target.
  Severidad: `none`

### Dashboard

- `frontend/app/dashboard/page.tsx:179`
  Problema: sidebar fija `w-64`.
  Viewports: `768`, `1024`
  Efecto: combina mal con header fijo y contenido desplazado; en tablet el layout queda justo.
  Fix sugerido: ancho responsive o drawer real en `<1024`.
  Severidad: `major`

- `frontend/app/dashboard/page.tsx:253,319`
  Problema: header fijo + `lg:ml-64` + `pt-24` dependen de breakpoint, no del espacio real.
  Viewports: `1024`
  Fix sugerido: layout por CSS grid.
  Severidad: `major`

- `frontend/app/dashboard/page.tsx:556-562`
  Problema: FAB fija puede tapar tarjetas o empty state.
  Viewports: `375`, `428`
  Fix sugerido: reservar bottom padding dinámico en el scroll container.
  Severidad: `minor`

### Editor desktop (>=768)

- `frontend/components/editor/BrowserFrame.tsx:31-33`
  Problema: `w-[768px] min-w-[768px]` y `min-w-[1024px]`.
  Viewports: `768`, `1024`
  Efecto: canvas e inspector compiten por espacio y degradan usabilidad en iPad landscape / portátil justo.
  Fix sugerido: grid con columnas flexibles y canvas `max-width` sin `min-width`.
  Severidad: `major`

- `frontend/components/editor/BrowserFrame.tsx:48`
  Problema: `min-h-[800px]`.
  Viewports: `768`, `1024`
  Efecto: obliga scroll interno y desperdicia altura útil.
  Fix sugerido: `min-h-full` o `min-h-[min(100dvh-...)]`.
  Severidad: `major`

- `frontend/components/editor/BrowserFrame.tsx:57`
  Problema: `px-24` fija en la pseudo URL bar.
  Viewports: `768`, `1024`
  Fix sugerido: padding responsive.
  Severidad: `minor`

### Quick Edit Mode (<768)

- `frontend/components/mobile-editor/MobileBottomSheet.tsx:109-111`
  Problema: top fija `top-14` / `top-[45%]`.
  Viewports: `375`, `428`
  Efecto: mala convivencia con teclado virtual y pantallas bajas.
  Fix sugerido: usar `100dvh`, `visualViewport`, safe areas.
  Severidad: `major`

- `frontend/components/mobile-editor/MobileEditor.tsx:453-460`
  Problema: FAB fija sin reservar espacio inferior.
  Viewports: `375`, `428`
  Efecto: puede tapar contenido accionable.
  Fix sugerido: `pb-[calc(fab-height+safe-area)]`.
  Severidad: `major`

- `frontend/components/mobile-editor/MobileEditor.tsx:639-649`
  Problema: barra fija de preview sobre contenido.
  Viewports: `375`, `428`
  Fix sugerido: inset safe-area y padding inferior del scroll.
  Severidad: `major`

- `frontend/app/editor/[pageId]/page.tsx:124-141`
  Problema: Quick Edit existe como rama condicional, no como ruta/pantalla dedicada.
  Relación con AGENTS: el propio documento lo marca como pendiente.
  Severidad: `major`

### Preview autenticada

- `frontend/app/preview/[pageId]/page.tsx:205-206`
  Problema crítico: `isMobile={false}` y `isTablet={false}` para todos los bloques.
  Viewports: todos, especialmente redimensionando desktop -> mobile
  Fix sugerido: copiar el patrón de `frontend/app/p/[slug]/PublicPageClient.tsx:71-75,133-135`.
  Severidad: `blocker`

- `frontend/app/preview/[pageId]/page.tsx:63-106`
  Problema: topbar no está pensada para mobile estrecho.
  Viewports: `375`, `428`
  Fix sugerido: ocultar o colapsar acciones secundarias.
  Severidad: `major`

### Página pública `/p/[slug]`

- `frontend/app/p/[slug]/PublicPageClient.tsx:102`
  Problema: empty state con `h-screen`.
  Viewports: móviles con browser chrome variable
  Fix sugerido: `min-h-screen` o `min-h-[100dvh]`.
  Severidad: `minor`

- `frontend/app/p/[slug]/not-found.tsx:6`
  Problema: `h-screen`.
  Viewports: mobile Safari/Chrome
  Fix sugerido: `min-h-screen` o `100dvh`.
  Severidad: `minor`

### Marketing pages

Estado real de rutas en `frontend/app/`:

- Existen: `/`, `/login`, `/register`, `/dashboard`, `/editor`, `/editor/[pageId]`, `/preview/[pageId]`, `/p/[slug]`, `/settings`, `/settings/billing`, `/settings/domains`
- No existen: `/pricing`, `/about`, `/privacy`, `/terms`, `/changelog`, `/contact`

Conclusión:

- No son auditables porque no están implementadas en el repo actual.
- Si esas páginas son requisito de producto para deploy, esto es `major`.

### Settings

- `frontend/app/settings/billing/page.tsx:217-218`
  Problema: tabla de pagos depende de `overflow-x-auto` y `min-w-[480px]`.
  Viewports: `375`, `428`
  Fix sugerido: convertir a cards en mobile.
  Severidad: `minor`

- `frontend/app/settings/domains/page.tsx:139`
  Problema: modal fija `max-w-[420px]`.
  Viewports: `375`
  Efecto: cabe, pero queda rígida y sin estrategia de teclado/safe area.
  Fix sugerido: full-screen sheet en mobile.
  Severidad: `minor`

- `frontend/app/settings/domains/page.tsx:354-402`
  Problema: header de card con acciones laterales puede comprimirse.
  Viewports: `375`, `428`
  Fix sugerido: apilar acciones debajo del dominio.
  Severidad: `major`

## Problemas técnicos de CSS

- `frontend/components/editor/BrowserFrame.tsx:31-33`
  Clase/propiedad: `min-w-[768px]`, `min-w-[1024px]`
  Fix sugerido: eliminar anchos mínimos rígidos.

- `frontend/components/mobile-editor/MobileBottomSheet.tsx:110`
  Clase/propiedad: `top-[45%]`
  Fix sugerido: layout por `dvh` y safe areas.

- `frontend/app/page.tsx:53`
  Clase/propiedad: `w-[900px] h-[500px]`
  Fix sugerido: tamaños fluidos por viewport.

- `frontend/app/page.tsx:199`
  Clase/propiedad: `w-[800px] h-[400px]`
  Fix sugerido: tamaños relativos (`vw`, `clamp`).

- `frontend/app/login/page.tsx:88,100,127`
  Clase/propiedad: `text-sm` en inputs
  Fix sugerido: `text-base`.

- `frontend/app/register/page.tsx:76,88,100,112`
  Clase/propiedad: `text-sm` en inputs
  Fix sugerido: `text-base`.

- `frontend/app/p/[slug]/not-found.tsx:6`
  Clase/propiedad: `h-screen`
  Fix sugerido: `min-h-[100dvh]`.

- `frontend/app/p/[slug]/PublicPageClient.tsx:102`
  Clase/propiedad: `h-screen`
  Fix sugerido: `min-h-[100dvh]`.

- `frontend/components/blocks/GalleryBlock.tsx:55`
  Clase/propiedad: `<img>`
  Fix sugerido: `next/image` + `max-w-full`.

- `frontend/components/blocks/NavbarBlock.tsx:21`
  Clase/propiedad: `<img>`
  Fix sugerido: `next/image`.

## Top 20 fixes por impacto

1. Hacer responsive la preview autenticada usando device mode real.
2. Eliminar `min-w-[768px]` y `min-w-[1024px]` del `BrowserFrame`.
3. Subir inputs de auth a `16px` mínimo.
4. Rehacer `MobileBottomSheet` con `100dvh` y manejo de teclado.
5. Reservar espacio inferior para FAB y preview bar del mobile editor.
6. Convertir la tabla de billing a cards en mobile.
7. Apilar acciones de dominios en mobile.
8. Reducir o hacer fluidos los blobs/decoraciones gigantes de la landing.
9. Sustituir `h-screen` por `100dvh`/`min-h-screen` en not-found y empty states.
10. Colapsar la topbar de preview en mobile.
11. Desacoplar sidebar fija del dashboard en tablet.
12. Convertir layout del editor a grid flexible.
13. Revisar modales anchos fijos y hacerlos sheet en mobile.
14. Adoptar `next/image` en bloques y paneles críticos.
15. Añadir equivalentes `active:` o `focus-visible:` donde hoy solo hay `hover:`.
16. Revisar posiciones fixed con `bottom-6/right-6` para no tapar contenido.
17. Reducir dependencia de `overflow-x-auto` como escape responsive.
18. Dar bottom padding explícito a listas largas en mobile.
19. Revisar tipografías `text-[9px]`, `text-[10px]`, `text-[11px]` en UI operativa.
20. Añadir validación visual responsive específica para Quick Edit en viewport `768`.

---

## Tarea 3 — Auditoría de consistencia (textos, naming, UI)

Estado general:

- No se detectó un sistema real de i18n en frontend.
- Se detectaron `478` textos hardcodeados heurísticamente en `app/` y `components/`.
- El HTML raíz sigue marcado como inglés: `frontend/app/layout.tsx:27`.

## Textos sin i18n (hardcodeados)

Top offenders por densidad:

- `frontend/app/page.tsx` `58`
- `frontend/app/settings/domains/page.tsx` `39`
- `frontend/app/dashboard/page.tsx` `38`
- `frontend/components/editor/TopBar.tsx` `35`
- `frontend/app/login/page.tsx` `20`
- `frontend/components/editor/SeoPanel.tsx` `18`
- `frontend/app/settings/billing/page.tsx` `17`
- `frontend/components/mobile-editor/MobileEditor.tsx` `17`
- `frontend/app/register/page.tsx` `14`
- `frontend/components/inspector/Inspector.tsx` `14`

Ejemplos prioritarios:

- `frontend/components/editor/TopBar.tsx:352-361`
  Texto: `Guardando...`, `Guardado`, `Guardar`
  Clave sugerida: `editor.save_status.*`

- `frontend/app/dashboard/page.tsx:324-327`
  Texto: `Mis Páginas`, contador de publicadas
  Clave sugerida: `dashboard.pages.*`

- `frontend/app/settings/domains/page.tsx:323-333`
  Texto: `Dominios`, `Agregar dominio`
  Clave sugerida: `settings.domains.*`

- `frontend/app/login/page.tsx:66,111,139,178,186`
  Texto: copy completo de login
  Clave sugerida: `auth.login.*`

- `frontend/app/register/page.tsx:56,123,163`
  Texto: copy completo de registro
  Clave sugerida: `auth.register.*`

## Mezclas de idioma

- `frontend/components/analytics/AnalyticsPanel.tsx:205`
  Inconsistencia: `Top referrers` en UI mayoritariamente española.

- `backend/pages/models.py:28-30`
  Inconsistencia: choices `Draft` / `Published` en modelo, mientras la UI usa `Borrador` / `Publicada`.

- `frontend/app/layout.tsx:27`
  Inconsistencia: `lang="en"` con contenido español.

## Terminología inconsistente

- `frontend/app/dashboard/page.tsx:324`
  Usa `Mis Páginas`

- `frontend/components/editor/VersionHistoryPanel.tsx:215`
  Usa `Previsualizar`

- `frontend/app/preview/[pageId]/page.tsx`
  Usa `Guardar` manual dentro de preview, aunque la decisión del proyecto es autosave sin guardado manual.

- `frontend/components/analytics/AnalyticsPanel.tsx`
  Mezcla `bloque` con `referrers`.

## Referencias a nombre antiguo

Referencias activas detectadas:

- `backend/accounts/views.py:168,173`
- `backend/config/settings.py:2,230`
- `backend/config/asgi.py:2`
- `backend/collaboration/consumers.py:36`
- `backend/ai_generation/prompts.py:11,231`
- `backend/pages/views.py:159`
- `backend/pages/management/commands/seed.py:56`
- `frontend/public/bp-analytics.js:2`
- `frontend/proxy.ts:9,16-18,25`
- `infrastructure/Caddyfile` mantiene dominios `builderpro`

## Estados inconsistentes

- `frontend/components/editor/TopBar.tsx`
  Estado de save/autosave real.

- `frontend/app/preview/[pageId]/page.tsx`
  Estado de save falso local, no persistente.

- `frontend/components/mobile-editor/MobileEditor.tsx:509-551`
  Publicación y estados difieren de desktop/editor.

## Formato inconsistente

- Fechas:
  `frontend/app/settings/billing/page.tsx:231` usa `toLocaleDateString('es-ES')`
  `frontend/components/editor/VersionHistoryPanel.tsx:33-38` usa formato relativo propio.

- URLs:
  Se muestran `/p/{slug}` en algunos sitios y dominio completo en otros.

- Truncamiento:
  dashboard y topbar usan criterios distintos para `page.name`.

## Total por categoría

| Categoría | Total observado |
|---|---:|
| Textos hardcodeados | `478` |
| Mezclas de idioma relevantes | `>=3` |
| Terminología inconsistente | `>=4` |
| Referencias a nombre antiguo | `>=10` |
| Estados inconsistentes | `>=3` |
| Formatos inconsistentes | `>=3` |

---

## Tarea 4 — Auditoría de consistencia frontend-backend

## Mapeo API

| Frontend | Método + URL | Backend | ¿Coinciden? |
|---|---|---|---|
| `frontend/lib/api.ts:220` | `POST /auth/register/` | `backend/accounts/urls.py:51` | Sí |
| `frontend/lib/api.ts:229` | `POST /auth/login/` | `backend/accounts/urls.py:52` | Sí |
| `frontend/lib/api.ts:238` | `POST /auth/google/` | `backend/accounts/urls.py:55` | Sí |
| `frontend/lib/api.ts:247` | `POST /auth/magic/request/` | `backend/accounts/urls.py:56` | Sí |
| `frontend/lib/api.ts:254` | `POST /auth/magic/verify/` | `backend/accounts/urls.py:57` | Sí |
| `frontend/lib/api.ts:263` | `GET /auth/me/` | `backend/accounts/urls.py:58` | Sí |
| `frontend/lib/api.ts:265-276` | `POST /auth/logout/` | `backend/accounts/urls.py:54` | Sí |
| `frontend/lib/api.ts:317` | `GET /auth/ai-settings/` | `backend/accounts/urls.py:59` | Sí |
| `frontend/lib/api.ts:320` | `PUT /auth/ai-settings/` | `backend/accounts/urls.py:59` | Sí |
| `frontend/lib/api.ts:281` | `GET /pages/` | `backend/pages/urls.py:9` | Sí |
| `frontend/lib/api.ts:283` | `GET /pages/{id}/` | `backend/pages/urls.py:9` | Sí |
| `frontend/lib/api.ts:285` | `POST /pages/` | `backend/pages/urls.py:9` | Sí |
| `frontend/lib/api.ts:288` | `PUT /pages/{id}/` | `backend/pages/urls.py:9` | Sí |
| `frontend/lib/api.ts:291` | `DELETE /pages/{id}/` | `backend/pages/urls.py:9` | Sí |
| `frontend/lib/api.ts:294` | `POST /pages/{id}/duplicate/` | `backend/pages/views.py:93` | Sí |
| `frontend/lib/api.ts:297` | `POST /pages/{id}/share/` | `backend/pages/views.py:117` | Sí |
| `frontend/lib/api.ts:303` | `POST /pages/{id}/unshare/` | `backend/pages/views.py:199` | Sí |
| `frontend/lib/api.ts:309` | `GET /pages/{id}/collaborators/` | `backend/pages/views.py:177` | Sí |
| `frontend/lib/api.ts:326` | `POST /pages/{pageId}/generate/` | `backend/ai_generation/urls.py:5` | Sí |
| `frontend/lib/api.ts:338` | `POST /pages/{pageId}/blocks/{blockId}/edit-ai/` | `backend/ai_generation/urls.py:6` | Sí |
| `frontend/lib/api.ts:350` | `GET /assets/` | `backend/pages/urls.py:10` | Sí |
| `frontend/lib/api.ts:352` | `POST /assets/` | `backend/pages/urls.py:10` | Sí |
| `frontend/lib/api.ts:358` | `DELETE /assets/{id}/` | `backend/pages/urls.py:10` | Sí |
| `frontend/lib/api.ts:363` | `GET /pages/{pageId}/analytics/` | `backend/analytics/urls.py:7` | Sí |
| `frontend/lib/api.ts:375` | `GET /billing/plans/` | `backend/billing/urls.py:6` | Sí |
| `frontend/lib/api.ts:377` | `GET /billing/subscription/` | `backend/billing/urls.py:7` | Sí |
| `frontend/lib/api.ts:380` | `GET /billing/payments/` | `backend/billing/urls.py:8` | Sí |
| `frontend/lib/api.ts:383` | `POST /billing/checkout/` | `backend/billing/urls.py:9` | Sí |
| `frontend/lib/api.ts:389` | `POST /billing/portal/` | `backend/billing/urls.py:10` | Sí |
| `frontend/lib/api.ts:396` | `GET /pages/{pageId}/versions/` | `backend/pages/urls.py:23` | Sí |
| `frontend/lib/api.ts:401` | `GET /pages/{pageId}/versions/{id}/` | `backend/pages/urls.py:24` | Sí |
| `frontend/lib/api.ts:404` | `POST /pages/{pageId}/versions/` | `backend/pages/urls.py:23` | Sí |
| `frontend/lib/api.ts:410` | `PATCH /pages/{pageId}/versions/{id}/` | `backend/pages/urls.py:24` | Sí |
| `frontend/lib/api.ts:416` | `DELETE /pages/{pageId}/versions/{id}/` | `backend/pages/urls.py:24` | Sí |
| `frontend/lib/api.ts:419` | `POST /pages/{pageId}/versions/{id}/restore/` | `backend/pages/urls.py:25` | Sí |
| `frontend/lib/api.ts:428` | `GET /domains/` | `backend/pages/urls.py:11` | Sí |
| `frontend/lib/api.ts:430` | `GET /domains/{id}/` | `backend/pages/urls.py:11` | Sí |
| `frontend/lib/api.ts:432` | `POST /domains/` | `backend/pages/urls.py:11` | Sí |
| `frontend/lib/api.ts:438` | `PATCH /domains/{id}/` | `backend/pages/urls.py:11` | Sí |
| `frontend/lib/api.ts:444` | `DELETE /domains/{id}/` | `backend/pages/urls.py:11` | Sí |
| `frontend/lib/api.ts:447` | `POST /domains/{id}/verify/` | `backend/pages/views.py:571` | Sí |
| `frontend/app/p/[slug]/page.tsx:34` | `GET /public/pages/{slug}/` | `backend/pages/urls.py:19` | Sí |
| `frontend/proxy.ts:42` | `GET /public/resolve-domain/?domain=...` | `backend/pages/urls.py:22` | Sí |
| `frontend/app/sitemap.ts:16` | `GET /sitemap/` | `backend/pages/urls.py:20` | Sí |
| `frontend/app/sitemap.ts:27` | `GET /public/sitemap-data/` | `backend/pages/urls.py:21` | Sí |

## Endpoints huérfanos

Sin uso de UI real detectado:

- `GET /api/auth/ai-settings/`
  Estado: backend vivo, helper existe, nadie lo invoca.
  Clasificación: `desconectado`

- `GET /api/domains/{id}/`
  Estado: helper existe, sin caller.
  Clasificación: `desconectado`

- `PATCH /api/domains/{id}/`
  Estado: helper existe, sin caller.
  Clasificación: `desconectado`

No son huérfanos aunque no pasen por `frontend/lib/api.ts`:

- `POST /api/analytics/collect/` lo consume `frontend/public/bp-analytics.js`
- `GET /api/public/pages/{slug}/` lo consume `frontend/app/p/[slug]/page.tsx`
- `GET /api/public/resolve-domain/` lo consume `frontend/proxy.ts`
- `GET /api/sitemap/` y `GET /api/public/sitemap-data/` los consume `frontend/app/sitemap.ts`
- `POST /api/billing/webhook/` es endpoint externo, no frontend

## Llamadas rotas

- No se detectaron llamadas del frontend a endpoints inexistentes.

## Tipos inconsistentes

- `backend/accounts/serializers.py:33`
  Backend devuelve `has_google`, `ai_provider`, `has_ai_key`.
  `frontend/lib/api.ts:106-112` no los tipa en `ApiUser`.

- `backend/pages/views.py:47-50`
  Backend añade `show_watermark` a la página pública.
  `frontend/lib/api.ts:148-159` no lo incluye en `ApiPage`.
  Resultado: el frontend define un `ApiPage` paralelo en `frontend/app/p/[slug]/PublicPageClient.tsx:41-51`.

- `backend/pages/views.py:182-193`
  El endpoint de colaboradores puede ocultar emails si el requester no es owner.
  `frontend/lib/api.ts:309-313` asume `email` siempre presente.

## Manejo de errores

- `frontend/lib/api.ts:85-88`
  El frontend lanza `Error("API {status}: {text}")`, obligando a parseos por string.

- `frontend/app/dashboard/page.tsx:105,121`
  Se detecta `403` por substring sobre el mensaje para encontrar `plan_limit`.

- `frontend/components/editor/VersionHistoryPanel.tsx:67`
  Misma heurística por substring para `plan_limit`.

Conclusión:

- `401`: sí hay refresh automático en `fetchWithRetry`.
- `403`: manejo frágil por parseo de strings.
- `404`: se trata de forma inconsistente según pantalla.
- `500`: no hay experiencia unificada más allá del global error page.

## Auth

Estado:

- Las requests autenticadas usan `credentials: 'include'` en `frontend/lib/api.ts:99`.
- Hay refresh automático en `frontend/lib/api.ts:76-83`.
- Backend valida firma JWT en `backend/accounts/authentication.py:24`.

Problemas:

- `frontend/hooks/useAuth.ts:15-19`
  Cookie auth no funciona como first-class citizen porque el guard exige token en localStorage.

- `frontend/hooks/useCollaboration.ts:202-213`
  WS depende de token en localStorage y query string.

- Quick Edit Mode
  Usa el mismo mecanismo de auth que el resto porque vive dentro de `/editor/[pageId]`.

## Top problemas

1. Cookie auth del backend no está realmente reflejada en el guard del frontend.
2. Contrato de errores no es estable; el frontend parsea strings.
3. Hay contratos TypeScript duplicados o incompletos para `ApiUser`, `ApiPage` pública y colaboradores.
4. Existen endpoints/helpers desconectados (`ai-settings`, `domains.get`, `domains.update`).
5. WS collaboration sigue anclado a localStorage/query string.

---

## Tarea 5 — Auditoría de preparación para deploy

## Backend — Ready

| Check | Estado | Nota |
|---|---|---|
| `DEBUG=False` configurable | ✅ | `backend/config/settings.py:26` |
| `SECRET_KEY` desde env | ✅ | `backend/config/settings.py:15-24` |
| `ALLOWED_HOSTS` desde env | ✅ | `backend/config/settings.py:28` |
| `DATABASE_URL` soportado | ✅ | `backend/config/settings.py:99-112` |
| `CORS` configurable | ✅ | `backend/config/settings.py:199-205` |
| Middleware de seguridad | ✅ | `backend/config/settings.py:58-67` |
| HSTS / cookies seguras prod | ✅ | `backend/config/settings.py:207-217` |
| `STATIC_ROOT` configurado | ❌ | no existe en settings |
| S3 / `django-storages` | ❌ | no hay `storages`, `boto3` ni settings AWS del proyecto |
| Gunicorn / entrypoint prod | ❌ | `backend/requirements.txt` no incluye `gunicorn`; no hay `Procfile` ni manifest |
| Daphne presente | ⚠️ | dependencia existe, pero no hay manifest de ejecución |
| Redis prod | ⚠️ | soportado si `REDIS_URL`; no hay deploy manifest |
| Seed commands | ✅ | existen `seed`, `seed_plans` |
| Branding viejo en config | ⚠️ | defaults BuilderPro aún presentes |

## Frontend — Ready

| Check | Estado | Nota |
|---|---|---|
| `npm run build` | ✅ | pasa con Node `20.19.0` |
| Node version fijada | ✅ | `frontend/package.json:5-7` |
| Typecheck | ❌ | 1 error en test utils |
| ESLint | ⚠️ | 45 warnings |
| Config backend URL | ✅ | `NEXT_PUBLIC_API_URL` |
| SSR routes públicas | ✅ | `/p/[slug]` y metadata funcionan |
| `next.config.ts` | ❌ | vacía |
| `vercel.json` o equivalente | ❌ | no existe |
| SEO metadata básica | ✅ | `frontend/app/layout.tsx:16-19` |
| `favicon` | ✅ | `frontend/app/favicon.ico` |
| `sitemap` | ✅ | `frontend/app/sitemap.ts` |
| `robots.txt` | ❌ | no existe |
| `next/image` adopción | ⚠️ | múltiples `<img>` |
| Fonts optimizadas | ⚠️ | depende de `next/font/google`; build requiere acceso de red a fonts |
| Bundle size | ⚠️ | un chunk JS de `582,615` bytes |

## Variables de entorno completas

| Nombre | Servicio | Obligatoria | Descripción |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Frontend | Sí | URL base de la API |
| `NEXT_PUBLIC_SITE_URL` | Frontend | Sí | URL canónica del sitio para sitemap/SEO |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Frontend | Condicional | Google OAuth web |
| `NEXT_PUBLIC_WS_URL` | Frontend | Condicional | WebSocket backend/collab |
| `DJANGO_SECRET_KEY` | Backend | Sí | Secret de Django |
| `DJANGO_DEBUG` | Backend | Sí | Debe ser `False` en prod |
| `DJANGO_ALLOWED_HOSTS` | Backend | Sí | Hosts permitidos |
| `DATABASE_URL` | Backend | Sí | PostgreSQL en producción |
| `CORS_ALLOWED_ORIGINS` | Backend | Sí | Origins frontend permitidos |
| `FRONTEND_URL` | Backend | Sí | URL pública del frontend |
| `GOOGLE_CLIENT_ID` | Backend | Condicional | Validación Google OAuth |
| `DEFAULT_FROM_EMAIL` | Backend | Recomendado | Remitente de emails |
| `EMAIL_BACKEND` | Backend | Condicional | SMTP/servicio real para magic links |
| `EMAIL_HOST` | Backend | Condicional | SMTP host |
| `EMAIL_PORT` | Backend | Condicional | SMTP port |
| `EMAIL_HOST_USER` | Backend | Condicional | SMTP user |
| `EMAIL_HOST_PASSWORD` | Backend | Condicional | SMTP password |
| `EMAIL_USE_TLS` | Backend | Condicional | SMTP TLS |
| `ANTHROPIC_API_KEY` | Backend | Condicional | Fallback IA Anthropic |
| `GOOGLE_AI_KEY` | Backend | Condicional | Fallback IA Gemini |
| `STRIPE_SECRET_KEY` | Backend | Condicional | Billing prod |
| `STRIPE_WEBHOOK_SECRET` | Backend | Condicional | Verificación webhooks |
| `STRIPE_PRO_PRICE_MONTHLY` | Backend | Condicional | Price ID mensual |
| `STRIPE_PRO_PRICE_YEARLY` | Backend | Condicional | Price ID anual |
| `REDIS_URL` | Backend | Condicional | Channels/cache en prod |

## Tests

- Backend: `148/148` pasan
- Frontend: `95/95` pasan
- `tsc --noEmit`: `1` error
- `eslint`: `0` errores, `45` warnings

Error de typecheck:

- `frontend/__tests__/mobile-editor/test-utils.tsx:119`
  `TS2540: Cannot assign to 'matches' because it is a read-only property.`

## Bloqueadores de deploy

1. `tsc --noEmit` no pasa.
2. No hay manifest de deploy (`Procfile`, `railway.json`, `fly.toml`, `vercel.json`, `Dockerfile`).
3. Backend no define `STATIC_ROOT`.
4. No hay configuración S3/`django-storages` pese a estar identificado como evolución necesaria.
5. `next.config.ts` está vacía.
6. No existe `robots.txt`.
7. Persisten referencias de BuilderPro en código, emails e infraestructura.

## Recomendaciones

1. Arreglar el typecheck y dejar CI verde con Node `20.19.0`.
2. Hacer cookie auth first-class y dejar `localStorage` solo como fallback real.
3. Corregir la preview autenticada para que sea responsive.
4. Estabilizar contrato de errores backend y dejar de parsear strings en frontend.
5. Añadir deploy manifests mínimos para frontend y backend.
6. Definir `STATIC_ROOT`, estrategia de static/media y plan real de storage.
7. Limpiar branding viejo antes de publicar.
8. Añadir `robots.txt`, headers frontend y CSP básica.

## Pasos de deploy sugeridos

1. Fijar runtime a Node `20.19.0` y Python compatible con Django actual.
2. Corregir `frontend/__tests__/mobile-editor/test-utils.tsx:119`.
3. Cerrar warnings críticos de lint relacionados con `<img>` y hooks.
4. Añadir manifest de despliegue y comando de arranque backend.
5. Configurar variables de entorno productivas.
6. Ejecutar migraciones y seeds de planes.
7. Verificar build con fonts accesibles o self-hosted.
8. Repetir smoke test de auth, dashboard, editor, preview pública y billing settings.

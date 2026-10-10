# DECISIONS.md — Paxl

Registro de decisiones arquitectónicas (ADR ligero). Toda decisión que afecte stack, dependencias o patrones debe documentarse aquí ANTES de implementarse.

Formato: Título, Fecha, Contexto, Decisión, Consecuencias.

---

## ADR-001: Zustand sobre Redux para estado del editor

- **Fecha**: 2025 (inferido del código existente)
- **Contexto**: El editor necesita estado global complejo (bloques, historial, viewport, DnD, colaboración). Redux añade boilerplate significativo con actions/reducers/selectors.
- **Decisión**: Usar Zustand con `subscribeWithSelector` como store centralizado.
- **Consecuencias**: Menos boilerplate, API más directa. Todo el estado del editor vive en un solo store (`editor-store.ts`). Los componentes acceden al store directamente, sin prop drilling. El middleware `subscribeWithSelector` permite suscripciones granulares para auto-save y sincronización.

---

## ADR-002: Next.js App Router sobre Pages Router

- **Fecha**: 2025 (inferido)
- **Contexto**: El proyecto necesita SSR para páginas públicas (SEO), rutas dinámicas para el editor, y layouts compartidos.
- **Decisión**: Usar Next.js App Router con Server Components donde aplique.
- **Consecuencias**: Layouts anidados nativos. Server Components para páginas públicas (`/p/[slug]`). Client Components para el editor. Metadata API para SEO.

---

## ADR-003: Django + DRF como backend monolítico

- **Fecha**: 2025 (inferido)
- **Contexto**: Se necesita API REST, auth JWT, ORM robusto, admin panel, y WebSocket support.
- **Decisión**: Django monolítico con DRF para la API, SimpleJWT para auth, Channels para WebSockets.
- **Consecuencias**: Un solo proceso backend. Admin de Django disponible para debugging. Migraciones gestionadas por Django. El monolito es suficiente para la escala actual; se puede extraer servicios si crece.

---

## ADR-004: Bloques tipados atómicos sobre editor libre

- **Fecha**: 2025 (inferido)
- **Contexto**: Modelos como Elementor permiten composición libre (section > row > column > widget), pero aumentan la complejidad y dificultan la generación por IA.
- **Decisión**: Cada bloque es una unidad atómica con schema definido en `block-registry.ts`. No hay composición libre de elementos dentro de un bloque.
- **Consecuencias**: Mayor coherencia visual. Más fácil de generar con IA. Menor flexibilidad para el usuario. Los 15 tipos de bloque cubren los casos de uso principales de landing pages. La evolución a layout slots está documentada como futuro.

---

## ADR-005: Design Tokens y temas sobre estilos por bloque

- **Fecha**: 2025 (inferido)
- **Contexto**: Permitir colores libres por bloque genera inconsistencia visual y dificulta cambios de tema globales.
- **Decisión**: Los colores, tipografía y spacing se definen en Design Tokens a nivel de página. Los bloques consumen tokens vía CSS variables (`var(--theme-*)`), no valores directos.
- **Consecuencias**: Cambiar el tema afecta toda la página instantáneamente. Los bloques no necesitan color pickers individuales. Los roles semánticos (`primary`, `background`, `surface`) permiten que las plantillas funcionen con cualquier paleta.

---

## ADR-006: Tailwind CSS v4 para estilos

- **Fecha**: 2025 (inferido)
- **Contexto**: Se necesita un sistema de estilos que permita prototipado rápido y consistencia con el design system Paxl.
- **Decisión**: Tailwind CSS v4 con arbitrary values para los tokens de diseño específicos de Paxl.
- **Consecuencias**: Clases utilitarias en JSX. Arbitrary values (`bg-[#0A0F1A]`) para colores del design system. `clsx()` para clases condicionales. No hay CSS modules ni styled-components.

---

## ADR-007: Vitest sobre Jest para testing frontend

- **Fecha**: 2025 (inferido)
- **Contexto**: El proyecto usa Vite (vía Next.js). Jest requiere configuración adicional para ESM y TypeScript.
- **Decisión**: Vitest con jsdom para testing unitario e integración del frontend.
- **Consecuencias**: Configuración mínima, compatibilidad nativa con el toolchain. Testing Library para queries de componentes. Setup global en `vitest.setup.ts`.

---

## ADR-008: JWT solo en cookies httpOnly, con comprobación de Origin

- **Fecha**: 2025 (inferido); reescrito el 2026-10-08 para reflejar el código
- **Contexto**: Un token guardado donde JavaScript puede leerlo (localStorage) lo roba cualquier XSS. La versión anterior de este ADR decía que los tokens iban en cookies httpOnly y que Django protegía de CSRF, pero no era cierto: el login devolvía los tokens también en el JSON, el frontend los copiaba en localStorage y las vistas de DRF no pasan por el CSRF de Django.
- **Decisión**:
  - El access token (1 h) y el refresh token (7 días, con rotación y lista negra) viajan **solo** en cookies `httpOnly`, `SameSite=Lax` y `Secure` en producción. Ninguna respuesta los incluye en el cuerpo y el frontend no los guarda.
  - El refresh lee solo la cookie. El logout añade el refresh token a la lista negra, así que una cookie robada deja de servir.
  - El cliente reintenta una vez tras un 401, y las peticiones simultáneas comparten un único refresh.
  - CSRF: `SameSite=Lax` ya evita que la mayoría de peticiones de otros sitios lleven las cookies. Además, `accounts.middleware.OriginCheckMiddleware` rechaza con 403 cualquier POST/PUT/PATCH/DELETE a `/api/` que lleve las cookies de sesión (o vaya a `/api/auth/`) si su `Origin` (o `Referer`) no está en `CSRF_TRUSTED_ORIGINS`. Si no hay ninguna de las dos cabeceras, la petición viene de un cliente que no es un navegador, y se permite.
- **Alternativas**: Token CSRF de doble envío (cookie más cabecera), que exige más código en el cliente y no aporta más que la comprobación de Origin con navegadores actuales. Sesiones de Django en vez de JWT, que obligarían a rehacer la autenticación de WebSocket y de la API.
- **Consecuencias**: Un XSS ya no puede robar los tokens, aunque sí puede hacer peticiones desde la página mientras esté abierta, así que sanear el contenido sigue siendo imprescindible. Tras el logout, el access token sigue siendo válido hasta que caduca (máximo 1 h), porque se valida sin estado. Para que las cookies funcionen, el frontend y la API deben ser el mismo sitio: en local lo son (localhost); en producción se servirá la API a través de un rewrite del frontend.

---

## ADR-009: Implementación nativa de DnD sobre librerías

- **Fecha**: 2025 (inferido)
- **Contexto**: El editor necesita drag & drop para reordenar bloques. Librerías como `react-dnd` o `dnd-kit` añaden peso y complejidad.
- **Decisión**: Implementación custom con Pointer Events API y estado en Zustand (`useDragManager` hook).
- **Consecuencias**: Sin dependencias adicionales. Control total sobre el comportamiento. Mayor esfuerzo de mantenimiento, pero el DnD del editor tiene requisitos específicos (canvas con zoom, drop zones entre bloques) que hacen que una librería genérica no encaje bien.

---

## ADR-010: Autenticación del WebSocket con la cookie de sesión

- **Fecha**: 2026-03-26; reescrito el 2026-10-08
- **Contexto**: La primera versión enviaba el JWT en la query string (`?token=`), sacándolo de localStorage, con el riesgo de que acabara en logs y en el historial. Al pasar a cookies httpOnly (ADR-008), JavaScript ya no tiene el token.
- **Decisión**: `collaboration.middleware.JWTAuthMiddleware` lee la cookie `bp_access` del handshake con el parser de cookies de Django. `channels.security.websocket.OriginValidator` rechaza handshakes cuyo `Origin` no esté en `CSRF_TRUSTED_ORIGINS`: como la cookie autentica el socket, sin esta comprobación otra web podría abrir uno con la sesión del usuario (*cross-site WebSocket hijacking*).
- **Ticket para dominios distintos**: En producción el WebSocket va a otro dominio (Render) que el frontend (Vercel), y el navegador no envía la cookie. Antes de cada conexión, el cliente pide `POST /api/auth/ws-ticket/` (autenticado con la cookie a través del rewrite) y conecta con `?ticket=`. El ticket es aleatorio, vale 30 segundos y se consume al usarlo, así que aunque quede en un log no sirve para nada. Si no hay ticket, el middleware usa la cookie.
- **Consecuencias**: Los tickets viven en la caché de Django: con un solo proceso basta la caché en memoria; con varios procesos hace falta una caché compartida (Redis).

---

## ADR-011: Lockfile de Python generado con uv

- **Fecha**: 2026-10-08
- **Contexto**: `requirements.txt` solo tenía rangos (`djangorestframework>=3.15,<4.0`). Cada instalación limpia podía traer versiones distintas: en local había DRF 3.16.1 y una instalación nueva traía 3.18.3, que cambia el formato de los errores de validación en listas y rompía 2 tests. Sin versiones fijas, "en mi máquina funciona" no garantiza nada en CI ni en producción.
- **Decisión**: Separar intención y resultado. `backend/requirements.in` contiene los rangos que se editan a mano. `backend/requirements.txt` es el lockfile: lo genera `uv pip compile` con versiones exactas, resolución universal (vale para macOS y Linux) y hashes. `pip install -r requirements.txt` sigue funcionando, así que Render y el CI no necesitan uv para instalar; uv solo hace falta para regenerar el lock (`make lock`). La versión de Python se fija en `backend/.python-version` (3.13).
- **Alternativas**: `pip-tools` (`pip-compile`) hace lo mismo pero es más lento; `pip freeze` mezcla dependencias directas y transitivas y no deja claro qué se pidió a propósito.
- **Consecuencias**: Instalaciones reproducibles y verificadas por hash. Actualizar una dependencia es explícito: se edita `requirements.in` (o se ejecuta `make lock-upgrade`) y el diff del lock se revisa en el commit. Las dependencias de test siguen en el mismo fichero que las de producción; separarlas queda pendiente si el tamaño de la imagen de producción importa.

---

## ADR-012: Tokens de la interfaz registrados como tema de Tailwind

- **Fecha**: 2026-10-08
- **Contexto**: Los colores de la interfaz del editor (superficies, bordes, textos, azul primario) se definían como variables `--bp-*` en `:root` y `[data-theme="light"]`, y cada clase (`.bg-surface-card`, `.border-subtle\/80`…) se escribía a mano dentro de `@layer utilities`. En Tailwind v4 esas clases son fijas: no generan variantes ni modificadores, así que `hover:bg-surface-card`, `focus-visible:ring-primary` o `bg-surface-card/50` no producían CSS. Había 109 clases muertas en el código, sin hover ni foco visible, y el interruptor del inspector apagado era invisible. Además, 202 usos escribían `\/` en el JSX, lo que deja una barra invertida literal en el nombre de la clase.
- **Decisión**: Las variables `--bp-*` siguen siendo la fuente de los valores y el modo claro/oscuro sigue cambiándolas con `data-theme`. Encima se registran como tema con `@theme inline`: `--color-*` para los nombres compartidos (primary, surface, success…) y espacios por utilidad (`--text-color-primary`, `--border-color-default`, `--background-color-default`) para los nombres ambiguos. Así se mantiene el significado de clases existentes como `text-primary` (texto principal) frente a `bg-primary` (azul). `scripts/check-classes.mjs` usa el escáner y el design system de Tailwind para fallar en CI si alguna clase de color no genera CSS.
- **Alternativas**: Renombrar todas las clases a una única escala `--color-*` (miles de cambios y riesgo de choques de significado); seguir escribiendo variantes a mano en `@layer` (no escala y es justo lo que falló).
- **Consecuencias**: Cualquier variante u opacidad de un token funciona sin tocar CSS. El modo oscuro se verificó con un diff de píxeles antes y después: idéntico salvo los bordes y fondos que antes no se pintaban. Los colores de los bloques de la página del usuario no cambian: siguen el sistema de temas de ADR-005.

---

## ADR-013: Next 16.4 y plugin de hooks fijado temporalmente

- **Fecha**: 2026-10-08
- **Contexto**: `npm audit` marcaba una vulnerabilidad crítica en Next.js 16.2 (denegación de servicio en Server Components) y un *open redirect* en next-intl, además de varias altas en dependencias de desarrollo. Al aplicar `npm audit fix`, `eslint-plugin-react-hooks` pasaba de 7.0.1 a 7.1.1, cuya regla `set-state-in-effect` es más estricta: marca 8 componentes que cargan datos llamando a una función `async` desde un `useEffect`.
- **Decisión**: Subir `next` a 16.4.0 y aplicar `npm audit fix` sin cambios incompatibles. Fijar `eslint-plugin-react-hooks` en 7.0.1 con `overrides` en `package.json` hasta mover esa carga de datos a hooks (`useSubscription` y `usePlans` ya siguen ese patrón). `eslint-config-next` se queda en 16.2.1.
- **Consecuencias**: Quedan 5 avisos altos, todos en la cadena de `eslint-config-next` (`fast-glob` → `micromatch` → `braces`). Es una herramienta de desarrollo que no llega al código desplegado, y npm solo ofrece "arreglarlo" bajando a la versión 14. El `override` debe quitarse cuando los 8 componentes usen hooks de datos; entonces la regla nueva pasará sin cambios.
- **Seguimiento (2026-10-10)**: el `override` se ha quitado. Los ocho componentes (más el aviso de invitado caducado de `/login`) cargan ahora sus datos con hooks (`usePageList`, `useBillingOverview`, `useAnalytics`, `useCollaborators`, `useVersionHistory`, `useAssets`, `useDomainSettings`, `useGuestExpiredNotice`), todos sobre `useAsyncData`, que solo toca el estado desde los callbacks de la promesa. `eslint-plugin-react-hooks` se resuelve a 7.1.1 y `npm run lint` da 0 errores y los mismos 37 avisos de antes.

---

## ADR-014: IDs de bloque generados en el cliente

- **Fecha**: 2026-10-08
- **Contexto**: El cliente creaba los bloques con IDs temporales (`blk_<timestamp>_<random>`). El servidor los descartaba y generaba UUIDs nuevos, y tras cada guardado el cliente copiaba los IDs del servidor emparejando bloques por posición. Si el usuario añadía, movía o borraba un bloque mientras el guardado estaba en vuelo, los IDs se cruzaban: en un test, añadir un bloque arriba durante un guardado dejaba dos bloques con el mismo ID, y el siguiente guardado sobrescribía uno con otro.
- **Decisión**: El cliente genera UUID v4 (`newBlockId()`, con alternativa a `crypto.getRandomValues` fuera de contextos seguros) y el servidor los conserva. `PageDetailSerializer.validate_blocks` rechaza con 400 los IDs que no son UUID, los repetidos en el mismo envío y los que pertenecen a otra página. Tras guardar ya no hay reconciliación: la respuesta del servidor no modifica el estado local, y la página solo se marca como guardada si no cambió mientras la petición estaba en vuelo.
- **Alternativas**: Reconciliar por un ID temporal enviado junto al bloque (sigue habiendo dos IDs por bloque y lógica de mapeo); bloquear la edición durante el guardado (empeora la experiencia y no evita el problema con colaboración).
- **Consecuencias**: Guardar es idempotente: reenviar la misma página produce el mismo estado. El servidor debe validar los IDs que recibe, porque un cliente podría enviar el ID de un bloque ajeno; está cubierto con tests. Las copias de seguridad locales antiguas con IDs `blk_` se migran al leerlas.

---

## ADR-015: Servidor ASGI con Daphne, whitenoise y modo sin Redis

- **Fecha**: 2026-10-08
- **Contexto**: El `Procfile` arrancaba gunicorn con WSGI, que no habla WebSocket: en producción la colaboración no habría funcionado. Además, el hosting gratuito previsto tiene disco efímero, ningún servidor de estáticos y no incluye Redis, del que dependían la capa de canales y los bloqueos por bloque.
- **Decisión**:
  - Un único proceso Daphne (ASGI) sirve HTTP y WebSocket (`daphne -b 0.0.0.0 -p $PORT config.asgi:application`); gunicorn sale de las dependencias.
  - whitenoise sirve los estáticos de Django (el admin) desde la propia app, con nombres con hash en producción.
  - Sin `REDIS_URL`, `REDIS_ENABLED` es falso: capa de canales en memoria e `InMemoryLockManager`, con la misma interfaz y TTL que la versión de Redis.
  - Detrás del proxy del hosting, `SECURE_PROXY_SSL_HEADER`; sin `SECURE_SSL_REDIRECT`, porque la plataforma ya redirige y su chequeo de salud llega por HTTP.
  - `DATABASE_URL` admite parámetros como `?sslmode=require`.
  - `/healthz` responde sin consultar la base de datos, para que los pings no impidan que una base de datos serverless se duerma.
- **Consecuencias**: Funciona con un solo proceso. Escalar a varios procesos exige definir `REDIS_URL`, y entonces todo pasa a Redis sin tocar código. Los bloqueos en memoria se pierden al reiniciar, lo cual es aceptable porque caducan a los 30 segundos.

---

## ADR-016: Contenido de usuario: una sola validación y HTML aislado

- **Fecha**: 2026-10-08
- **Contexto**: El contenido de los bloques llega por dos caminos: el guardado REST y la edición en tiempo real por WebSocket. El REST saneaba, pero el WebSocket reenviaba los datos tal cual a los demás editores, y el bloque Custom HTML se inyectaba con `dangerouslySetInnerHTML`. Un colaborador podía ejecutar código en el editor del dueño y, mientras los tokens estaban en localStorage, robarle la sesión. Además, el validador aceptaba claves desconocidas (`buttonLink: "javascript:..."`) y tipos de bloque inexistentes.
- **Decisión**: Defensa en dos capas.
  - **Servidor**: `clean_block_data()` es la única puerta de entrada del contenido, tanto para el REST como para el WebSocket. Exige un tipo conocido, impone un límite de tamaño, sanea el HTML con bleach por campo y aplica una lista blanca: los campos sin regla se descartan. El WebSocket obtiene el tipo real del bloque de la base de datos, comprueba que es de esa página y solo reenvía datos limpios y estilos primitivos.
  - **Navegador**: Custom HTML se pinta en un `<iframe sandbox>` sin `allow-scripts`, de modo que nada de ese bloque puede ejecutar JavaScript aunque el saneado fallara. `allow-same-origin` sin scripts es seguro y permite medir la altura del contenido.
  - Las subidas se aceptan por la firma de los bytes, no por el `Content-Type` declarado, y se guardan con un nombre aleatorio y la extensión del tipo detectado.
- **Consecuencias**: Añadir un campo a un bloque exige añadir su regla en `block_validators.py`; si no, se descarta al guardar (lo vigila la comparación entre registro y reglas). El HTML personalizado no hereda las fuentes ni los colores del tema de la página.

---

## ADR-017: Publicar es congelar una copia

- **Fecha**: 2026-10-09
- **Contexto**: "Publicada" era solo un estado de la página. La página pública leía los bloques en vivo, así que cada autosave cambiaba la web que veían los visitantes mientras el dueño aún estaba editando, y un `PUT` del autosave podía publicar o despublicar.
- **Decisión**: Publicar (`POST /api/pages/{id}/publish/`) crea una `PageVersion` con los bloques, el tema, los tokens y el SEO, y `Page.published_version` apunta a ella. La página pública y los sitemaps sirven esa copia. El estado ya no se puede cambiar por `PUT`: solo con publicar y despublicar (`/unpublish/`). `has_unpublished_changes` (la última edición es posterior a `published_at`) permite al editor mostrar "Cambios sin publicar" y "Publicar cambios". La limpieza de versiones por plan nunca borra la versión publicada.
- **Alternativas**: Duplicar las tablas en "borrador" y "publicado" (más esquema y más código de sincronización); un campo JSON con la copia dentro de `Page` (pierde el historial y la posibilidad de restaurar lo que estaba publicado).
- **Consecuencias**: Editar es seguro: nada llega al público hasta pulsar Publicar. Reutilizar `PageVersion` hace que cada publicación quede en el historial y se pueda restaurar. Una migración de datos congeló el contenido de las páginas que ya estaban publicadas. El render en servidor de la página pública (S7) leerá esta misma copia.

---

## ADR-018: Demostrar el email se queda con la cuenta

- **Fecha**: 2026-10-09
- **Contexto**: El registro con contraseña no verifica el email, así que alguien puede registrar el email de otra persona antes que ella (apropiación previa de la cuenta). El enlace mágico y Google sí demuestran que quien entra controla el email. Antes, Google respondía 409 en ese caso y el enlace mágico simplemente dejaba entrar.
- **Decisión**: `User.email_verified` se marca cuando alguien entra con enlace mágico o Google. Si la cuenta tenía una contraseña sin confirmar, `confirm_email_owner()` desactiva esa contraseña, cierra todas las sesiones y deja de compartir las páginas. Para cerrar sesiones, `User.sessions_revoked_at` hace que se rechacen los access tokens emitidos antes (en la API y en el WebSocket), y los refresh tokens pasan a la lista negra. La respuesta lleva `password_disabled: true` y el frontend explica lo ocurrido.
- **Alternativas**: Quitar el enlace mágico y Google de la demo (resuelve el riesgo pero pierde dos formas de entrar); verificar el email en el registro con un correo de confirmación (es lo ideal, pero necesita un envío de correo fiable que la demo gratuita no tiene garantizado).
- **Consecuencias**: Quien se registró con contraseña de buena fe y después entra con enlace mágico pierde la contraseña y sigue entrando sin ella; la pantalla de aviso se lo explica. Si más adelante hay un correo de confirmación al registrarse, las cuentas confirmadas no se verán afectadas (`email_verified` ya existe). La migración marca como verificadas las cuentas sin contraseña o con Google.

---

## ADR-019: La página publicada se renderiza en el servidor

- **Fecha**: 2026-10-09
- **Contexto**: `/p/[slug]` devolvía un `<div>` vacío desde el servidor y lo pintaba todo en el navegador. El diseño de móvil o escritorio se elegía en JavaScript con `window.innerWidth`, cada visita consultaba a Django sin caché y las fuentes del tema no se cargaban (el CSS pedía "Inter" por su nombre y solo funcionaba si el visitante la tenía instalada).
- **Decisión**:
  - Un renderer compartido (`components/renderer/PageRenderer.tsx`) para la página pública y la vista previa, sin nada que dependa de `window`. El HTML del servidor trae la página completa.
  - Los bloques eligen su diseño con container queries de Tailwind v4 (`@tablet:` desde 640 px y `@desktop:` desde 1024 px, los mismos cortes que el editor) en lugar de las props `isMobile`/`isTablet`. La raíz de cada superficie es un contenedor, así que el mismo CSS sirve en la página real y en los marcos de 375, 768 y 1200 px del editor.
  - El espaciado y el fondo por dispositivo de cada bloque se convierten en una hoja de estilos (`lib/block-styles-css.ts`) con una regla por dispositivo. Como acaba dentro de un `<style>`, solo deja pasar números, colores con sintaxis simple e ids validados.
  - Los datos de la página publicada se guardan en la caché de datos de Next, etiquetados por slug. Al publicar, despublicar o borrar, Django llama a `POST /revalidate` con un secreto compartido (`REVALIDATE_SECRET`) y la siguiente visita ya trae la copia nueva. Los 60 segundos de caducidad solo sirven si ese aviso se pierde.
  - Las 20 fuentes del tema se autoalojan con `next/font` (`lib/page-fonts.ts`): se descargan al compilar y se sirven desde el propio dominio, sin precarga. El navegador solo baja las que la página usa y nunca contacta con Google.
- **Alternativas**: Media queries (miden la ventana, no el marco del editor, así que el editor dejaría de mostrar el móvil fielmente); ISR de la página entera (los textos de Paxl en la página, como la marca de agua, dependen del idioma del visitante); Google Fonts por CSS (envía la IP de cada visitante a Google, lo contrario de la analítica sin cookies); revalidar desde el navegador del dueño tras publicar (no cubre despublicar ni borrar desde el dashboard, y cualquiera podría llamar a esa acción).
- **Consecuencias**: `curl` de `/p/slug` devuelve todo el contenido y los buscadores lo leen sin ejecutar JavaScript. Las visitas repetidas no llegan a Django. Las fuentes añaden unos 6,5 KB comprimidos de CSS (`@font-face`) a todas las páginas. El canvas del editor sigue resolviendo los overrides por dispositivo en JavaScript, porque sabe qué dispositivo muestra. Se quitó `app/loading.tsx`, que envolvía también la página pública y convertía sus 404 en 200.

---

## ADR-020: Un solo sistema de tema: design tokens

- **Fecha**: 2026-10-09
- **Contexto**: Cada página tenía dos temas. El heredado (`theme_id` + `custom_theme`, 8 paletas fijas en `lib/themes.ts`) y los design tokens (`design_tokens`, `{}` si no había). Ninguna pantalla elegía ya el heredado, pero seguían usándolo las plantillas, el alta de páginas y las páginas antiguas. Tener dos daba un bug (la primera edición de un token en una página con tema `dark` la volvía clara, porque el panel partía de los tokens por defecto) y obligaba a `pageThemeVars` a resolver dos caminos. Además los tokens emitían `--bp-color-*`, el mismo espacio de nombres que la interfaz del editor (`globals.css`, ADR-012), así que el editor dentro del lienzo se pintaba con los colores de la página. Y el servidor no validaba nada de lo que acabaría dentro de un atributo `style`.
- **Decisión**:
  - El tema de una página son sus `design_tokens` y nada más. Las 8 paletas heredadas son presets (con los mismos ids) en la lista única `tokenPresets`, junto a los 6 que ya existían. `textOnPrimary` es blanco si alcanza 4,5:1 sobre el primario, y si no el de mayor contraste entre blanco y casi negro; éxito y error son los valores por defecto. `defaultDesignTokens` es el preset `default`, que se ve igual que el tema por defecto de antes.
  - La migración `0015_design_tokens_only` da a toda página sin tokens los equivalentes a su tema, hace lo mismo con el `page_metadata` de cada `PageVersion` (las copias publicadas incluidas), completa los tokens parciales con los valores por defecto de entonces, quita los colores a medio escribir y elimina `theme_id` y `custom_theme`. Lleva copia propia de las paletas, para que nada la cambie después. Una prueba comprueba que cada tema se renderiza con las mismas variables `--theme-*` que antes.
  - `pageThemeVars(tokens)` tiene un solo camino. Los colores salen como `--theme-*` (lo que leen los bloques) y ya no como `--bp-color-*`; la tipografía, el espaciado y los bordes siguen como `--bp-*`, que no chocan con el editor.
  - El serializador valida `design_tokens`: solo grupos y claves conocidos (el resto se descarta), colores `#rgb`/`#rrggbb`/`#rrggbbaa`, fuentes de la lista de `googleFonts` (copia en `pages/design_tokens.py`, vigilada por una prueba del frontend), números en rango, escala tipográfica de la lista y medidas CSS simples. Lo inválido responde 400 con `{error, code, details}`.
  - Los clientes que aún envíen `theme_id` o `custom_theme` no fallan: DRF ignora los campos que no conoce.
- **Alternativas**: Dejar `theme_id` como alias de un preset (un segundo sitio donde mirar el tema, justo lo que se quería quitar); convertir los temas al cargar la página en el cliente (las copias publicadas seguirían dependiendo de código que acabaría borrándose); rechazar los tokens parciales (rompería las copias ya guardadas).
- **Consecuencias**: El tema de una página no se puede volver a perder por una edición. Las páginas antiguas conservan su aspecto, salvo los colores que ya eran inválidos, que pasan al valor por defecto. Marcha atrás de la migración: recrea las columnas con sus valores por defecto y el código anterior usa los tokens, que ahora existen siempre. Una copia local (localStorage) de antes del cambio no tiene tokens y se abre con los de por defecto. Los bloques no consumen `textOnPrimary` todavía.

---

## ADR-021: Las listas de los bloques son arrays tipados

- **Fecha**: 2026-10-09
- **Contexto**: Los elementos repetidos de un bloque eran claves numeradas (`feature1Title`, `q2`, `plan2Price`, `link3Url`). No se podía añadir una tercera característica ni quitar una pregunta, el número de elementos lo fijaba el código del componente, y cada sitio que conocía esos nombres (bloques, inspector, validadores, sanitizadores, esquemas de IA, plantillas, traducciones) tenía que mantenerlos a mano. Los componentes leían `data` sin tipos, con unos cien `as string`.
- **Decisión**:
  - Cada lista es un array de objetos con forma fija (`features: [{title, description}]`, `plans: [{name, price, features, buttonText, buttonLink, highlighted}]`...) y un máximo por bloque. La tabla está en CLAUDE.md, sección 6.
  - Frontend: `Block` es una unión discriminada por `type` y cada componente recibe sus datos tipados, sin casts. `normalizeBlockData` es la frontera: lo que llega de la API, del WebSocket o de la IA se convierte al tipo del bloque, con los huecos rellenos y sin lanzar nunca. El inspector y el editor móvil comparten un campo `list` (añadir, quitar, mover, con etiquetas por posición y foco que sigue a la acción). La edición en línea direcciona por ruta (`['features', 2, 'title']`). Añadir, quitar y mover son pasos de deshacer propios; escribir en un mismo campo se agrupa.
  - Backend: `clean_block_data` valida las listas con reglas por elemento (enlaces, URLs de imagen y texto enriquecido igual que los campos sueltos de antes) y es el único camino: REST, WebSocket, IA y restauración de versiones.
  - La migración `0014_block_lists_to_arrays` convierte los bloques y todas las versiones, las publicadas incluidas. Quita los elementos que el bloque ya ocultaba, para que la página se vea igual.
- **Alternativas**: Convertir al leer en el cliente (las copias publicadas y el backend seguirían con los dos formatos para siempre); un modelo `BlockItem` en base de datos (más tablas y consultas para algo que siempre se lee y escribe junto con su bloque); listas de cadenas sueltas (las características de un plan siguen siendo texto con una por línea, porque editar una lista dentro de otra no compensa en el inspector).
- **Consecuencias**: Las cuatro plantillas, la página con los 15 bloques y la de ejemplo se ven idénticas píxel a píxel tras migrar datos reales (24 capturas a 375, 768 y 1440 px y en el editor). El HTML de cada bloque con sus datos por defecto también es idéntico byte a byte. Dos ediciones simultáneas de la misma lista por WebSocket: gana la última, igual que con cualquier campo del bloque.

---

## ADR-022: Modo invitado temporal para probar sin registrarse

- **Fecha**: 2026-10-09
- **Contexto**: Quien evalúa la demo pública (reclutadores, sobre todo) debe poder probar el editor en un clic, pero el alojamiento gratuito (una instancia, sin cron, Postgres pequeño) no aguanta que se abuse de él.
- **Decisión**:
  - `POST /api/auth/guest/` crea un usuario temporal (`User.is_guest`, nombre `invitado-xxxxxxxx`, contraseña inutilizable, email `@guest.invalid`, un dominio reservado que nunca puede ser real) con su espacio de trabajo en un plan Pro activo sin Stripe, e inicia sesión con las mismas cookies httpOnly (ADR-008). Dura 24 h (`GUEST_LIFETIME_HOURS`) desde `created_at`.
  - Sin cron: cada invitado nuevo borra antes un lote (50) de los caducados, y `manage.py cleanup_guests` hace lo mismo a demanda. El borrado cae en cascada (páginas, bloques, versiones, mensajes, analítica, suscripción) y se encarga además de los ficheros subidos y de los refresh tokens. Se pide al frontend que descarte la copia en caché de sus páginas publicadas (ADR-019). La autenticación y el refresh rechazan con `GUEST_EXPIRED` a un invitado pasadas las 24 h aunque su JWT siga vigente.
  - Límites: 5 invitados por hora y por IP (`GUEST_CREATION_RATE`, con `NUM_PROXIES`), 200 invitados vivos a la vez (`GUEST_MAX_ACTIVE`, si no `503 GUEST_CAPACITY`), 5 páginas (`GUEST_MAX_PAGES`, `403 GUEST_PAGE_LIMIT`), 10 versiones por página. Sin subir ficheros, sin facturación, sin dominios propios y sin compartir páginas (enviaría correos): `403 GUEST_NOT_ALLOWED`.
  - Sus páginas publicadas siempre son `noindex`, con marca de agua (aunque el plan Pro la quite) y fuera de los dos sitemaps.
  - `POST /api/auth/guest/claim/` convierte al invitado en cuenta normal con los mismos campos y validación que el registro: conserva todas sus páginas, pasa al plan Free (las páginas que superen su límite se quedan, pero no se pueden crear más), cierra la sesión anterior (refresh token en lista negra) y entrega cookies nuevas. El email queda sin verificar, como en el registro con contraseña (ADR-018).
  - Frontend: botón "Probar sin registrarse" en la portada, el login y el registro. Si el navegador ya tiene una sesión, lleva al panel en vez de crear un invitado, para no pisar las cookies de una cuenta real. Un aviso permanente en el editor y el panel dice que la sesión es temporal y abre el formulario para crear la cuenta.
  - Una página publicada por un invitado no sirve para phishing en este dominio: lleva un aviso visible de página de prueba, no muestra bloques de HTML personalizado y su formulario de contacto no envía (el servidor responde 403 `GUEST_PAGE` y el formulario lo explica).
- **Alternativas**: Una cuenta de demostración compartida (todos verían y borrarían el trabajo de los demás); invitados sin límite de vida hasta que se llene la base de datos; un cron externo (no hay).
- **Consecuencias**: Un invitado es un usuario real en la tabla durante 24 h, así que toda comprobación de permisos pasa por `user.is_guest` en lugar de por el plan, que es Pro. Un mismo atacante con muchas IP puede llenar los 200 huecos durante 24 h; el tope protege la base de datos, no la disponibilidad de la prueba.

## ADR-023: La IA de la demo no cuesta nada y lo dice

- **Fecha**: 2026-10-09
- **Contexto**: La demo pública no puede gastar una clave de IA de pago ni depender de la cuota gratuita de un tercero, pero la generación con IA es una de las partes que más enseña. Hasta ahora, con una clave de servidor, cualquier usuario podía agotarla; sin ella, la IA fallaba. Además, la edición de un bloque sustituía `block.data` por los campos del esquema de la IA y perdía el resto (`hero.buttonLink`, `badgeText`, `plans[].buttonLink`, los placeholders del contacto...), y los ids de los modelos estaban fijos en el código.
- **Decisión**: Tres capas, en este orden de decisión (`choose_route` en `ai_generation/views.py`).
  - **Clave propia**: si la petición trae proveedor y clave, se llama a ese proveedor aunque la demo esté activa. No consume la cuota del plan ni los límites diarios (no es nuestra cuota), y la clave ni se guarda ni se registra. La comprobación del plan va después de elegir la clave.
  - **Modo demo** (`AI_DEMO_MODE`, activo por defecto): nunca se usa la clave del servidor. Generar sirve una de las diez páginas guardadas en `ai_generation/demo_fixtures/*.json` (prompt, idioma, palabras clave en ES y EN y bloques), elegida por palabras clave con un respaldo determinista (`demo.match_fixture`). Editar un bloque devuelve una variante guardada del mismo tipo y no sigue la instrucción; si el tipo no tiene variante, responde `DEMO_NO_VARIANT`. La respuesta tarda `AI_DEMO_DELAY_SECONDS` (2,5 s) y lleva `source: "demo"`. Pasa por el mismo camino que una real: `finalize_blocks`, la instantánea previa de la página y `AIGenerationLog` con `source=demo` y coste 0. El frontend ofrece los prompts como chips, escribe en la pantalla que es una respuesta guardada y, en el editor, que la edición no sigue la instrucción.
  - **Clave del servidor** (solo con `AI_DEMO_MODE=False` y una clave): tope global (`AI_LIVE_DAILY_LIMIT`, 30) y por usuario (`AI_LIVE_USER_DAILY_LIMIT`, 2) por día UTC, contados desde `AIGenerationLog` con `source=live`. Pasado un tope, o si el proveedor responde 402/429 (cuota agotada), se sirve una respuesta guardada y el motivo (`daily_limit`, `provider_quota`) llega al frontend, que lo explica. El límite por hora del plan sigue aplicándose a esta clave y solo cuenta las llamadas `live`.
  - `generate_ai_fixtures` genera las páginas con la misma tubería que el servidor (`ai_generation/pipeline.py`: prompt, proveedor, parseo, `finalize_blocks`, un reintento), con tope de llamadas, parada en el primer fallo y la clave leída de un `.env` sin mostrarla. Cada página pasa una revisión (5 a 12 bloques, navbar primero y footer último, sin textos obligatorios vacíos) antes de escribirse.
  - La edición de un bloque del mismo tipo mezcla el resultado sobre los datos actuales (`ai_generation/merge.py`): solo mandan las claves que la IA devolvió, las listas siguen la longitud de la IA y cada elemento se mezcla con el de su posición, así que los campos fuera del esquema sobreviven. Una imagen vacía nunca borra una existente.
  - Los ids de modelo salen de `GEMINI_MODEL` y `ANTHROPIC_MODEL` (settings y `.env.example`) y no aparecen en ningún otro sitio.
- **Alternativas**: Dejar la clave del servidor abierta con un límite por hora (cualquiera puede agotar la cuota gratuita y la demo se rompe); desactivar la IA sin clave propia (se pierde lo que más enseña); simular la IA con plantillas escritas a mano en el código (no sería IA y obligaría a mantener otro camino de código).
- **Consecuencias**: La demo funciona sin ninguna clave y sin coste. Las páginas guardadas hay que regenerarlas a mano si cambian los bloques o el prompt (`generate_ai_fixtures --force`); una prueba comprueba que siguen pasando la validación. `AIGenerationLog.used_own_key` se sustituye por `source` (la migración convierte los registros anteriores). El tope diario cuenta llamadas, no tokens. Las páginas guardadas de ahora están escritas a mano (`"origin": "placeholder"`): la clave disponible pertenecía a un proyecto de pago sin crédito y no se generaron. La respuesta lleva `demo.origin` y la interfaz solo dice "generada una vez con IA" cuando todas son `generated`; mientras tanto dice que es una página de ejemplo escrita a mano y que no se ha usado IA. `generate_ai_fixtures --force` con una clave gratuita las sustituye.

---

## ADR-024: Colaboración segura: versión de página, fusión y presencia por conexión

- **Fecha**: 2026-10-09
- **Contexto**: Cada autoguardado era un PUT completo sin comprobar nada, así que dos editores se pisaban (gana el último), un `{**viejo, **nuevo}` por bloque impedía borrar claves, la presencia y los bloqueos se guardaban por usuario (dos pestañas del mismo usuario se confundían y cerrar una soltaba los bloqueos de la otra) y una conexión rechazada emitía `user_left`.
- **Decisión**:
  - El servidor es la fuente de verdad. `Page.version` (empieza en 1) sube con cada escritura que cambia la página: guardar (`save`), restaurar (`restore`), publicar y despublicar (`publish`), generar o editar con IA (`ai`). `PUT/PATCH /api/pages/{id}/` exige `version`: sin ella, `400 VERSION_REQUIRED`; si no coincide, `409 VERSION_CONFLICT` con la página actual completa para que el cliente fusione. La comprobación y la subida son un único `UPDATE ... WHERE version = N` (`pages/sync.py`), la primera sentencia de la transacción: de dos guardados simultáneos con la misma versión pasa uno.
  - `data` de un bloque se reemplaza (ya no se mezcla): una clave quitada desaparece de verdad. Es seguro porque un cliente con datos viejos recibe 409 antes de llegar ahí.
  - Tras cada escritura, el servidor envía al grupo `page_updated {version, reason, by, connection_id}`. El cliente puede mandar `X-Connection-Id` (su `connection_id`) para que el socket de origen reconozca su eco. Un fallo al emitir se registra y no hace fallar la escritura. `page_restored` desaparece.
  - WebSocket: cada conexión es un participante (`connection_id` generado por el servidor). La presencia (`user_id`, `username`) y los bloqueos pertenecen a la conexión; al cerrarse una pestaña solo se liberan sus bloqueos. `connected` trae `connection_id`, usuarios, bloqueos (con su titular) y `version`. Una conexión rechazada no emite nada. Se admite al propietario o a un colaborador siempre que el plan del PROPIETARIO tenga colaboración. `lock_acquire` exige que el bloque sea de la página; los cursores deben ser números finitos y se acotan. Al dejar de compartir una página, el servidor envía `access_revoked` y cierra con 4003 los sockets de ese usuario.
  - Enlaces de invitación: `POST /api/pages/{id}/invite/` (solo el propietario, invitados incluidos, porque no envía correo) crea un `PageInvite` (token aleatorio, 24 h, 5 usos). `POST /api/auth/join/` lo canjea: un usuario con sesión pasa a colaborador; sin sesión se crea un invitado igual que en `/guest/` (mismo límite por IP y de capacidad, mismas cookies) y pasa a colaborador. Caducado, agotado o desconocido dan la misma respuesta, `404 INVITE_INVALID`. El uso se toma con un `UPDATE` condicional dentro de la misma transacción que crea el invitado.
  - Cliente (`lib/page-merge.ts`, `lib/page-sync.ts`): fusión en tres vías entre lo último que tenía el servidor (`base`), lo local y lo remoto. Los campos de página y cada hoja de los tokens toman lo local si cambió, y si no lo remoto. Los bloques se cruzan por id y nunca se pierde una edición (borrado contra edición conserva la edición). Una sola petición de escritura en vuelo, reintento tras 409 con la versión devuelta, y autoguardado a 800 ms cuando hay otra conexión en la página.
- **Alternativas**: Un protocolo de operaciones por WebSocket (añadir, mover, borrar...) o CRDT (más código, más casos y una segunda fuente de verdad junto al REST que ya existía); bloquear la página entera mientras alguien edita (seguro, pero ya no sería edición a la vez); "gana el último" con avisos (es justo lo que perdía datos).
- **Consecuencias**: Presencia y bloqueos siguen siendo de un solo proceso (ADR-015); con Redis los bloqueos se comparten pero la lista de presencia no. Un bloqueo que caduca por TTL no se anuncia hasta que alguien lo pide. Los clientes deben fusionar en 409 y reintentar con la versión devuelta.

---

## ADR-025: El contenido que crea la app sigue el idioma de la interfaz

- **Fecha**: 2026-10-10
- **Contexto**: La interfaz estaba traducida (next-intl) pero el contenido que la app escribe por el usuario no: un bloque nuevo, la página de inicio del editor y las cuatro plantillas salían siempre en español, la barra de cada bloque mostraba el nombre en inglés del registro, y los errores de la IA llegaban en el español del servidor.
- **Decisión**:
  - El registro de bloques (`block-registry.ts`) solo guarda la estructura (campos, componente, icono). Las palabras viven en `lib/block-defaults.ts`: contenido de ejemplo de cada bloque y del elemento nuevo de cada lista, en `es` y `en`, con el mismo tipo que el esquema. No depende de next-intl: quien crea el bloque pasa el idioma (`getBlockDefaults(type, locale)`). El store tampoco lo necesita; `addBlock` recibe los datos ya localizados.
  - Las plantillas (`lib/template-content/`) llevan nombre, descripción, categoría y bloques en los dos idiomas; el selector las muestra en el idioma de la interfaz y `buildPagePayload(id, nombre, locale)` crea la página en ese idioma. Los enlaces e imágenes son los mismos.
  - Solo se elige idioma al crear. El contenido que ya existe no se traduce nunca, ni al cambiar de idioma la interfaz.
  - Los nombres de bloque que ve el usuario salen de `blocks.<tipo>` en los mensajes, por tipo; `block.name` queda como valor interno.
  - Los errores de la IA se traducen por su `code` (`lib/ai.ts`). Un código desconocido muestra el mensaje genérico, nunca el texto del servidor. Una prueba lee los códigos de `ai_generation/views.py` y falla si falta alguno.
  - En modo demo, sin clave propia, el popover de edición con IA no ofrece las sugerencias rápidas ("tradúcelo al inglés"): la demo devuelve una variante guardada y no puede seguirlas.
- **Alternativas**: Traducir en el servidor según `Accept-Language` (el texto de los bloques es del cliente y las plantillas también); un diccionario de mensajes por clave para el contenido de ejemplo (más indirección y perdería el tipado de ADR-021); mantener `initialData` en el registro con una función por idioma (mezcla estructura y palabras).
- **Consecuencias**: Un bloque o una plantilla nuevos exigen texto en los dos idiomas (las pruebas comprueban que ambos tienen la misma forma y que el inglés no contiene español). Añadir un tercer idioma es añadir una clave en `ContentLocale` y rellenar las mismas tablas. `AI_PLAN_LIMIT` cubre dos casos (plan sin IA y límite por hora) y se muestra con un solo mensaje.

## ADR-026: Teclado en el lienzo: una sola parada de tabulación y flechas entre bloques

- **Fecha**: 2026-10-10
- **Contexto**: Los bloques del lienzo solo se podían seleccionar con el ratón (WCAG 2.1.1). Además, los botones, enlaces y campos de dentro de los bloques (que en el editor no hacen nada: tienen `pointer-events: none`) eran paradas de tabulación, y la tecla Espacio, reservada para desplazar el lienzo, impedía activar cualquier botón con el teclado.
- **Decisión**:
  - Cada bloque es un `role="group"` enfocable con nombre "Bloque Hero, 2 de 8" (más "seleccionado" o "bloqueado, lo está editando X"). Elegimos tabindex itinerante (patrón de lista): el lienzo es una sola parada de tabulación (el último bloque enfocado, o el primero) y las flechas, Inicio y Fin mueven el foco. Así una página larga no obliga a tabular decenas de veces para llegar al inspector. El contenido de los bloques sale del orden de tabulación (`useRemoveFromTabOrder`); se edita desde el inspector.
  - Teclas, solo con el bloque mismo enfocado (nunca desde un campo, un botón de la barra o un texto en edición): Enter o Espacio seleccionan; Escape quita la selección y deja el foco en el bloque; Alt con flecha arriba o abajo mueve el bloque; Ctrl o Cmd con D lo duplica; Supr o Retroceso piden confirmación para eliminarlo (actúa sobre el bloque enfocado, no sobre el seleccionado). Los atajos globales (deshacer, copiar, pegar) siguen igual. Se documentan en el panel del inspector cuando no hay nada seleccionado y como descripción del lienzo para lectores de pantalla.
  - Un bloque bloqueado por otra persona se puede enfocar pero no operar; el ratón y el teclado se rechazan igual y se anuncia "no se puede seleccionar: lo está editando X". Mover, duplicar, seleccionar y anunciar usan una región `role="status"` por bloque.
  - Espacio solo mueve el lienzo cuando el foco no está en un campo, botón, enlace o interruptor, ni en un bloque al que se llegó con el teclado.
  - El anillo de foco se dibuja dentro del bloque (el marco del lienzo recorta lo que queda fuera).
- **Alternativas**: Todos los bloques en el orden de tabulación (más simple, pero cada bloque suma una parada y la edición del inspector queda lejos); `aria-activedescendant` desde el contenedor (no mueve el foco real ni sirve con el desplazamiento del lienzo); un `role="listbox"` (los bloques contienen texto y controles que un `option` no permite).
- **Consecuencias**: La edición de texto en el propio lienzo sigue siendo con doble clic; con teclado se edita el mismo campo en el inspector. Mover un bloque con teclado depende de Alt más flechas, que algunos lectores de pantalla en modo exploración pueden interceptar. Las paletas predefinidas de color pasan AA para texto principal, secundario (sobre fondo y superficie) y texto sobre el color primario; las páginas ya creadas conservan los colores que guardaron.

## ADR-027: Los dominios personalizados son una función que se activa por entorno

- **Fecha**: 2026-10-10
- **Contexto**: Un dominio propio necesita verificar DNS y emitir un certificado SSL, y el hosting gratuito de la demo no permite ninguna de las dos cosas: la pantalla existía, aceptaba dominios y no podía hacer que funcionaran. El código además nombraba `builderpro.com` (nombre del proyecto anterior) en el destino del CNAME, en los dominios reservados y en el Caddyfile.
- **Decisión**:
  - `CUSTOM_DOMAINS_ENABLED` (variable de entorno, `False` por defecto). Apagada, `/api/domains/**` y `/api/public/resolve-domain/` responden `404 {"error", "code": "FEATURE_DISABLED"}` (incluso sin sesión, antes de comprobar plan o permisos), `check_domains` no hace nada y el frontend lo oculta todo: la tarjeta del hub de ajustes, la página `/settings/domains` (`notFound()`) y la línea "Dominio personalizado" de las listas de planes.
  - `GET /api/features/` (público, sin base de datos) devuelve `{"custom_domains": bool}`; el frontend lo lee con `useFeatures`. Mientras no responde, o si falla, la función se considera apagada. Cada función opcional futura entra en el mismo objeto.
  - El destino del CNAME, la IP del registro A y los dominios reservados salen de `CUSTOM_DOMAINS_CNAME_TARGET`, `CUSTOM_DOMAINS_A_RECORD` y `CUSTOM_DOMAINS_RESERVED`, con valores neutros (`tu-dominio.com`). `builderpro.com` ya no aparece en el código ni en la infraestructura (queda en el informe de auditoría de marzo, que es histórico).
- **Alternativas**: Borrar el módulo (se perdería lo ya hecho para cuando haya hosting con SSL); ocultarlo solo en el frontend (la API seguiría aceptando dominios que nunca funcionarán).
- **Consecuencias**: Encender la función en un despliegue con Caddy o similar requiere tres variables y los registros DNS reales. La verificación de DNS sigue siendo la del MVP (cualquier dominio que resuelva cuenta como verificado cuando falla el CNAME); antes de activarla en serio hay que endurecerla.

---

## ADR-028: Borrado de cuenta por la propia persona

- **Fecha**: 2026-10-10
- **Contexto**: La política de privacidad decía que no había forma de borrar la cuenta y que había que escribir al autor. Ya existía el borrado de invitados caducados, con la misma lista de cosas por limpiar.
- **Decisión**:
  - `DELETE /api/auth/me/` (autenticado, no para invitados, limitado como un login). Pide `password` si la cuenta tiene contraseña y, si no la tiene (enlace mágico, Google), `confirm_username` con el nombre de usuario exacto (`/api/auth/me/` informa de `has_password`). Un fallo da `400 INVALID_PASSWORD` o `400 CONFIRMATION_MISMATCH` y no borra nada.
  - Borra el usuario y todo lo suyo: las cascadas de la base de datos se llevan workspaces, suscripción y pagos, páginas con bloques, versiones, mensajes y analítica, invitaciones, dominios, activos y registros de IA; el código (`accounts/deletion.py`, compartido con la limpieza de invitados) borra además los refresh tokens, los archivos subidos, la caché de las páginas publicadas (`revalidate_public_pages`) y el sitemap. Las páginas ajenas donde era colaborador no se tocan. La respuesta es 204 y limpia las cookies de sesión. El registro solo lleva recuentos, sin nombre, email ni id.
  - Stripe: no hay ninguna función para cancelar suscripciones, así que, mientras exista una suscripción de pago que seguiría cobrando (activa, de prueba o con pago pendiente y sin cancelación programada), la petición se rechaza con `409 ACTIVE_SUBSCRIPTION` y la interfaz lleva a Facturación (portal de Stripe). Nunca se llama a Stripe desde el borrado.
  - Frontend: sección "Zona de peligro" en ajustes con diálogo accesible (`useDialogFocus`, `aria-modal`, campo etiquetado, error con `role="alert"`), y redirección a la portada al terminar.
- **Consecuencias**: Es irreversible y no hay periodo de gracia. El cliente de Stripe de quien borra su cuenta sigue existiendo en Stripe (con datos de prueba en esta demo). Una conexión WebSocket abierta de la cuenta borrada no se cierra de forma explícita al borrarla.

---

## ADR-029: Cada campo de un bloque se sanea una sola vez y el saneado es idempotente

- **Fecha**: 2026-10-10
- **Contexto**: `clean_block_data` pasaba primero por `sanitize_block_data` (tablas por tipo de bloque) y después por las reglas de cada campo, que volvían a sanear. Los campos de texto del primer nivel se saneaban dos veces, y `sanitize_plain_text` decodificaba las entidades que había escrito la persona, de modo que un literal `&amp;lt;` pasaba a `&lt;` y luego a `<`: cada guardado lo degradaba.
- **Decisión**: Se elimina `sanitize_block_data` y sus tablas; la regla de cada campo (`FieldRule`) valida y sanea una vez. `sanitize_plain_text` escapa todos los `&` antes de pasar por bleach y decodifica una sola vez, así que solo deshace lo que añade el propio bleach; repite hasta que quitar etiquetas no cambia nada (quitar una puede unir el texto en otra: `<<b>script>`). El texto que escribe la persona se guarda tal cual, `&lt;` incluido.
- **Consecuencias**: Guardar los mismos datos dos veces da el mismo valor almacenado; hay pruebas con `&lt;`, `&amp;lt;`, `<b>`, `a & b`, `5 < 6` y marcado aleatorio. Cambia un caso: un `5 &lt; 6` escrito literalmente ya no se guarda como `5 < 6`. La longitud máxima se comprueba sobre el texto recibido, antes de quitar etiquetas. Los valores ya degradados en la base de datos no se corrigen.
- **Seguimiento (2026-10-10, ronda 1 de QA, QA-001 / D6)**: los campos de texto largo (subtítulos, descripciones, citas, respuestas, características de un plan) se guardaban todavía como HTML saneado (`sanitize_text` de bleach conservaba `<strong>`, `<a>`... y escribía `&` como `&amp;`), pero todos los bloques los pintan como texto de React y el editor no tiene ninguna opción de formato: la gente veía `Q&amp;A` en el editor, en el inspector y en la página publicada. Ahora esos campos son **texto plano** como los demás (`sanitize_text` desaparece; usan `sanitize_plain_text`, idempotente). La migración `pages/0018` quita las etiquetas y decodifica las entidades una sola vez en cada `Block` y en **todos** los `PageVersion.snapshot` (los publicados incluidos, que son lo que sirve la página pública), sin tocar `updated_at`. Un `&amp;lt;` literal que escribió alguien queda como `&lt;`. Custom HTML sigue siendo la única excepción (HTML saneado, dentro de un iframe aislado).

---

## ADR-030: Pruebas de extremo a extremo con Playwright contra el stack real

- **Fecha**: 2026-10-10
- **Contexto**: Las pruebas unitarias y de API no detectan fallos que solo aparecen al juntar piezas: la reescritura de `/api` en Next, las cookies de sesión, el WebSocket de colaboración, el autosave o la caché de la página pública (ADR-019).
- **Decisión**:
  - Única dependencia nueva: `@playwright/test` (versión exacta, solo desarrollo, solo Chromium). Las pruebas viven en `frontend/e2e/` y no las recoge Vitest (que solo lee `__tests__/`).
  - Se prueba el stack real, no mocks: Django con Daphne (ASGI) sobre una base SQLite desechable con las migraciones aplicadas (`SQLITE_PATH`, variable opcional nueva) y Next.js compilado (`next build` + `next start`) en modo reescritura, con `REVALIDATE_SECRET` en ambos lados. `playwright.config.ts` arranca los dos servidores con `frontend/e2e/scripts/` (puertos 3100/8101 para no chocar con `make dev`).
  - La IA sigue en modo demo y los límites de creación de invitados (`GUEST_CREATION_RATE`) y de registro, invitaciones y renovación de sesión (`AUTH_RATE`, nueva variable opcional) se suben solo en esta ejecución, sin tocar los valores por defecto: todas las pruebas salen de una IP y el camino completo ya gastaba 7 de las 10 peticiones por minuto.
  - Cubren el camino principal: invitado que edita y publica (con el HTML del servidor sin JavaScript), registro, plantilla, bloque, publicar y volver a entrar, colaboración con enlace de invitación y navegación por teclado del lienzo. Los selectores son roles y nombres accesibles.
  - CI: un trabajo `e2e` aparte, con navegadores en caché; sube el informe y las trazas solo si falla.
- **Consecuencias**: El trabajo tarda más que los demás (compila el frontend). Las pruebas dependen de los textos en español (cookie `paxl-locale=es` explícita). Se ejecutan en serie y con una sola IP, así que cuentan contra los límites de peticiones.

## ADR-031: La facturación es una función que existe solo con una clave de prueba de Stripe

- **Fecha**: 2026-10-10
- **Contexto**: "Mejorar a Pro" y "Gestionar suscripción" terminaban en `API 500: {"error":"STRIPE_SECRET_KEY not configured"}`: la demo se despliega sin cuenta de Stripe y el código trataba la falta de clave como un fallo del servidor. Además, una demo pública no debe poder cobrar nunca dinero real.
- **Decisión**:
  - `GET /api/features/` devuelve también `billing`. Es `true` solo si `STRIPE_SECRET_KEY` empieza por `sk_test_` o `rk_test_`. Sin clave está apagada; con una clave real (`sk_live_`, `rk_live_`) también: se registra un error y el system check `paxl.E002` impide `manage.py check`, `migrate` y el arranque de Daphne.
  - Apagada, checkout, portal y webhook responden `503 {"error", "code": "FEATURE_DISABLED"}` (la clase `BillingEnabled` va primera en `permission_classes`, como `CustomDomainsEnabled`). Planes, suscripción e historial siguen funcionando para que los límites se vean. Un precio sin configurar es `503 BILLING_NOT_CONFIGURED`; un fallo de Stripe, `502 BILLING_PROVIDER_ERROR` sin el texto de Stripe.
  - El frontend lee `billing` con `useBillingEnabled`. Apagada: la página de facturación dice "Los pagos no están activos en esta demo" y no ofrece mejorar, el panel y los avisos de plan no llevan a un callejón sin salida (`UpgradePrompt` lo explica), precios y términos no prometen pagos de prueba. Encendida: la página avisa de que es modo de prueba y da la tarjeta 4242 4242 4242 4242. Los mensajes se traducen por `code` o por estado (`lib/account-errors.ts`), nunca se muestra el texto del servidor.
  - Webhooks idempotentes: el registro del evento se bloquea con `select_for_update` mientras corre su manejador, así que un duplicado simultáneo espera y lo encuentra procesado. Si el manejador falla se deshacen sus cambios, el evento queda sin procesar con el error guardado y la respuesta es 500 para que Stripe reintente (antes respondía 200 y el evento se perdía). Un pago es una fila por factura (`update_or_create`): una factura fallida que luego se paga actualiza su fila.
  - `GET /api/billing/subscription/` añade `usage` (páginas propias, visibles, publicadas y bloques) para el panel.
- **Alternativas**: Dejar el 500 y esconder el botón (el endpoint seguiría roto); borrar la facturación (se perdería lo hecho); aceptar claves reales con un aviso (una demo pública cobrando por error es el peor caso).
- **Consecuencias**: Para encender los pagos de prueba basta una clave `sk_test_`, `STRIPE_WEBHOOK_SECRET` y los ids de precio. Pasar a pagos reales exigiría quitar la guarda a propósito y revisar términos y privacidad.

## ADR-032: Email y nombre de usuario son únicos sin distinguir mayúsculas

- **Fecha**: 2026-10-10
- **Contexto**: `Demo@x.com` y `demo@x.com` eran dos cuentas distintas, y un enlace mágico pedido con otra capitalización creaba una cuenta vacía en vez de entrar en la existente. Lo mismo con `DEMO` y `demo`.
- **Decisión**:
  - El email se guarda en minúsculas (`User.save`, los serializadores de registro y enlace mágico, Google). Restricciones únicas sobre `Lower(email)` y `Lower(username)`. Las búsquedas por email usan `iexact`. El inicio de sesión ignora las mayúsculas del usuario (`accounts.backends.CaseInsensitiveModelBackend`).
  - La migración `accounts/0009` se detiene con un `RuntimeError` que lista las cuentas que solo se diferencian por mayúsculas (email y usuario) antes de crear las restricciones; fusionar dos cuentas es decisión de una persona. Con los datos limpios pone en minúsculas los emails de usuarios y de enlaces mágicos pendientes.
  - Los mensajes de validación y el email del enlace mágico siguen `Accept-Language` (`LocaleMiddleware`, `es` por defecto y `en`); el cliente envía el idioma de la interfaz (`<html lang>`). Los mensajes propios están en `accounts/messages.py`.
- **Consecuencias**: Antes del primer despliegue hay que borrar o renombrar los duplicados que ya existan en bases de pruebas (la migración dice cuáles). El nombre de usuario conserva las mayúsculas con las que se escribió; solo se compara sin ellas.

## ADR-033: Ajustes de producción que se comprueban al arrancar, y política de contenido del frontend

- **Fecha**: 2026-10-10
- **Contexto**: Detrás de un proxy la dirección de conexión es la del proxy: con `NUM_PROXIES=0` todos los visitantes compartían el mismo cupo de límites (cinco invitados por hora, cinco mensajes de contacto por minuto, el hash de visitante de la analítica). Subirlo a ciegas deja falsear la IP con `X-Forwarded-For`. Tampoco había política de contenido, y el panel de Django estaba en `/admin/` sin límite de intentos.
- **Decisión**:
  - `config/checks.py` registra system checks: `paxl.E001` (con `DEBUG` apagado, `NUM_PROXIES` no puede ser 0), `paxl.E002` (clave real de Stripe) y, con `check --deploy`, avisos para `ALLOWED_HOSTS='*'`, orígenes de confianza solo locales, `REVALIDATE_SECRET` vacío y el panel en la ruta por defecto. `config/asgi.py` ejecuta `check` al arrancar con `DEBUG` apagado, porque Daphne no lo hace. El valor correcto se mide en el despliegue (registro temporal de `REMOTE_ADDR` y `X-Forwarded-For`); la variable está documentada en los dos `.env.example`.
  - El panel de Django está apagado salvo `ADMIN_ENABLED=True` (activo con `DJANGO_DEBUG`), se sirve en `ADMIN_URL_PATH` y limita los intentos de acceso por IP (`ADMIN_LOGIN_RATE`, 10/minuto).
  - Frontend: `poweredByHeader: false`, `Strict-Transport-Security` y una `Content-Security-Policy` construida en `lib/content-security-policy.ts`. Las páginas publicadas (`/p/…`) llevan la política estricta, sin ningún tercero (tampoco Google); el resto, la misma más el script, el marco y los estilos de Google solo si hay `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Se aplica solo en builds de producción: el servidor de desarrollo necesita `eval` y un socket de recarga. Los scripts incluyen `'unsafe-inline'` porque Next escribe en línea los datos de hidratación y un `nonce` obligaría a renderizar cada página publicada en cada petición. Sigue bloqueando scripts de otros orígenes, `eval`, plugins, marcos de otros sitios y un `<base>` cambiado.
- **Alternativas**: `nonce` por petición desde el proxy de Next (CSP más estricta, pero deja de cachearse la página publicada); documentar `NUM_PROXIES` sin comprobarlo (es lo que ya había y falló).
- **Consecuencias**: Un despliegue sin `NUM_PROXIES` no arranca y el mensaje dice qué hacer. En dominios propios (ADR-027) la página de inicio de un dominio llega reescrita a `/p/…` pero la política se elige por la ruta pedida, así que recibe la de la aplicación.

## ADR-034: Visitar una página no guarda nada ni contacta con Google; la cookie de idioma solo nace al cambiar de idioma

- **Fecha**: 2026-10-10
- **Contexto**: Cada visita a cualquier ruta, también a una página publicada, cargaba el script de Google y escribía durante un año la cookie `paxl-locale`, mientras la política de privacidad decía lo contrario.
- **Decisión**:
  - El proveedor de Google (`GoogleOAuthWrapper`) se monta solo dentro de `GoogleSignIn`, que usan `/login` y `/register`, y solo si hay `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. El botón sale en el idioma de la interfaz, con el tema de la página y del ancho del formulario.
  - `paxl-locale` se escribe solo en `setLocale`, es decir, cuando la persona usa el selector (y entonces se refresca la parte servida por el servidor: título y `<html lang>`). Sin cookie el servidor usa `Accept-Language`.
  - Las páginas publicadas no ponen cookies ni usan el almacenamiento del dispositivo: una prueba de extremo a extremo con un contexto limpio lo comprueba. La página de privacidad se reescribió en español e inglés (cookies, almacenamiento local sin la "copia de la sesión" que ya no existe, Google, pagos desactivados).
- **Consecuencias**: Quien ya tenía la cookie la conserva hasta que caduque. Cambiar de idioma sigue recordándose; quedarse con el idioma del navegador no.

---

## ADR-031: Guardar sin perder nada: un campo rechazado no bloquea el resto, reintentos y copia local con su base

- **Fecha**: 2026-10-10
- **Contexto**: La ronda 1 de QA encontró tres formas de perder lo escrito sin aviso (QA-003, QA-004, QA-008): salir del editor durante los 3 s de espera del autoguardado; un solo valor que el servidor rechazaba (un enlace escrito como `example.com`) hacía fallar todos los guardados siguientes con el mensaje "Sin conexión", y al recargar se perdía todo; y un guardado fallido no se reintentaba nunca, ni al volver la conexión, mientras la copia local solo se usaba si la página no cargaba.
- **Decisión**:
  - Todo sigue pasando por `PageSyncController` (ADR-024: un PUT en vuelo, versión, fusión en 409). El controlador pone `autoSaveStatus` y `saveIssue` en el store en todos los caminos de guardado (autoguardado, botón, fusión, publicar, móvil).
  - `saveIssue` distingue "sin respuesta" (`failed` con `offline`), un error del servidor (`failed` con el tipo: sesión, permiso, no existe, servidor...) y campos rechazados (`rejected`). "Sin conexión" solo se muestra para el primero. Los textos salen del tipo de error (`lib/api-errors.ts`), nunca del cuerpo de la respuesta, que está en español.
  - Un 400 con `details` se traduce a campos concretos (bloque por índice, ruta dentro de `data`, o campo de página). Esos campos se dejan fuera de los PUT siguientes (se envía el valor que tiene el servidor) mientras conserven el valor rechazado; el resto de la página se guarda. En pantalla el valor se queda, con el mensaje de la regla en el propio campo y un aviso con "Ir al campo". En cuanto la persona lo cambia, se vuelve a enviar.
  - Sin respuesta, error 5xx o 429: se reintenta a los 2, 5, 15 y luego cada 30 s, al volver `online` y al reconectar el WebSocket aunque la versión no haya cambiado. Un 4xx no se reintenta solo.
  - Al salir: el logo espera a que se guarde (`flushPendingSave`, `lib/save-flush.ts`) y, si falla, pregunta; al ocultar o cerrar la pestaña se envía el cambio con `fetch(..., { keepalive: true })` (hasta 60 KB; si no cabe o hay otra petición en vuelo, el navegador pregunta antes de cerrar). "Guardar versión" y "Editar con IA" también guardan antes, porque trabajan sobre la copia del servidor.
  - La copia local (`lib/page-backup.ts`) se escribe en cada edición y guarda la página, la base (página y versión del servidor sobre la que se editó) y si tiene cambios sin confirmar. Al cargar, si los tiene, se fusionan en tres vías sobre la página del servidor como un paso de deshacer, se guardan y se avisa. Las copias antiguas, sin base, no se fusionan. Si la persona pierde el acceso a la página, su copia se borra.
  - `lib/field-limits.ts` copia los límites de `block_validators.py` y de `Page` para que los campos del inspector se paren en el límite y los enlaces se completen (`example.com` → `https://example.com`); una prueba lee los ficheros de Python y falla si las dos copias se separan.
  - Publicar y despublicar son del propietario (D1): con `is_owner: false` en la página, el botón queda `aria-disabled` y explica por qué. Sin el campo (servidor antiguo) se muestra como antes y decide el servidor.
- **Alternativas**: Rechazar en el cliente cualquier valor no válido antes de guardar (no evita valores que vienen de la IA, de otra persona o de datos antiguos, y el servidor seguiría bloqueando); guardar por bloque o por campo (otra API y otra fusión, cuando la de página ya existe); `navigator.sendBeacon` (no permite PUT ni cabeceras); una pregunta en cada cierre de pestaña (molesta y Chrome la ignora sin interacción previa).
- **Consecuencias**: Mientras quede un campo rechazado, publicar falla con "antes hay que guardar todos los cambios" y "Guardar versión" no se hace. La copia local ocupa el doble (página y base) y se escribe en cada pulsación. Los mensajes del servidor se clasifican por su texto (`ruleMessage`); una prueba comprueba que los textos de `block_validators.py` y `block_sanitizers.py` siguen ahí. La edición en el lienzo (`EditableText`) y el editor móvil aún no usan `field-limits`; el servidor sigue siendo la barrera.

## ADR-032: Qué hace cada persona en una página compartida

- **Fecha**: 2026-10-10
- **Contexto**: `PageViewSet` filtra por propietario *o* colaborador en todas las acciones y solo `destroy`, `share`, `unshare` e `invite` comprobaban al propietario. Una persona invitada (también una sesión de invitado, ADR-022) podía publicar, despublicar, duplicar la página del propietario, regenerarla entera con IA o borrar la versión que veía el público, y la barra del propietario cambiaba a "Publicada" sin explicación (QA-023, QA-013). La regla de ADR-017 ("nada llega al público hasta que el propietario publica") solo valía mientras nadie más pudiera publicar.
- **Decisión**: Dos niveles, aplicados en el servidor (`pages/permissions.py`: `require_page_owner`) y reflejados en la interfaz.
  - **Solo el propietario**: publicar, despublicar, duplicar, eliminar la página, eliminar versiones, regenerar la página entera con IA (`POST /generate/`), compartir, dejar de compartir e invitar. Cualquier otra persona con acceso recibe `403 {"error", "code": "NOT_OWNER"}`; quien no tiene acceso sigue recibiendo 404 (no se revela que la página existe).
  - **Propietario y colaboradores**: editar contenido, tema y SEO, editar un bloque con IA, ver, crear y restaurar versiones, ver analítica y mensajes. Restaurar queda abierto porque crea antes una versión automática y se puede deshacer.
  - `GET|PUT /api/pages/{id}/` devuelve `is_owner` (solo lectura) para que la interfaz oculte o desactive las acciones del propietario con una explicación.
  - Aparte, la versión publicada no se puede eliminar para nadie (`400 PUBLISHED_VERSION`): hacerlo dejaba la página pública en 404 con la página aún "publicada".
- **Consecuencias**: Las personas invitadas pierden publicar/duplicar, que antes podían. No hay roles intermedios (editor/publicador); si hicieran falta, `require_page_owner` es el único punto que cambiar. Compartir por correo sigue añadiendo a la persona sin paso de aceptación (decisión pendiente). El texto del correo escapa el nombre de la página y el del usuario (QA-027) y las búsquedas por correo ignoran mayúsculas.

---

## ADR-033: Idioma de cada página

- **Fecha**: 2026-10-10
- **Contexto**: La página publicada declaraba `<html lang>` según el idioma del visitante, no el del contenido (WCAG 3.1.1) y no había dónde guardar el idioma en que está escrita (QA-091, D12).
- **Decisión**: `Page.language` (etiqueta BCP 47 sencilla: `es`, `en`, `pt-BR`; validada con una expresión regular, máximo 12 caracteres, valor por defecto `es`). Se expone en las respuestas de lista y detalle y se acepta al crear y al editar; la interfaz propone el idioma de la UI al crear y lo deja editar en el panel SEO. Entra en `page_metadata` de cada versión, así que la copia publicada (ADR-017) congela también el idioma y `GET /api/public/pages/{slug}/` lo sirve. Restaurar una versión con metadatos lo devuelve; un valor inválido de una versión antigua cae a `es`. La migración `pages/0017` pone `es` a todas las páginas existentes y la `0018` lo añade a los metadatos de todas las versiones.
- **Consecuencias**: Cambiar el idioma de una página no cambia su contenido ni se aplica a lo ya publicado hasta que se vuelva a publicar. La lista de idiomas que ofrece la interfaz es decisión de la interfaz; el servidor acepta cualquier etiqueta con forma válida.

---

## ADR-034: URLs de imagen estrictas y escrituras de página entera en serie

- **Fecha**: 2026-10-10
- **Contexto**: Dos familias de fallos de la ronda 1 de QA. (1) Una URL de imagen acaba dentro de CSS (`background-image: url(...)`) y `validate_safe_url` solo miraba el esquema: `https://x.test/a.png);position:fixed;...` cerraba el `url(`, añadía declaraciones y tapaba la página entera, incluido el aviso de página de prueba (ADR-022) (QA-005). (2) Restaurar una versión, generar con IA y crear instantáneas borraban y recreaban bloques sin bloquear la página: dos a la vez entrelazaban bloques o chocaban en `version_number` (500), restaurar daba ids nuevos a los bloques (el cliente que editaba uno lo conservaba junto a la copia) y la edición de un bloque con IA pisaba lo que otra persona guardó mientras el modelo respondía (QA-012, QA-029, QA-030).
- **Decisión**:
  - **URLs de imagen** (`validate_safe_image_url`, para todo campo `URL_RULE` y para `og_image`): `http(s)://host/...` o una ruta del sitio que empiece por una sola `/`. Se rechazan espacios, caracteres de control, `\`, comillas, paréntesis, `;`, llaves, `<`, `>` y comillas invertidas (codificables como `%28`...). La migración `0018` vacía en los datos guardados (bloques, instantáneas y `og_image`) las que no pasan, para que ninguna página se quede sin poder guardarse. El frontend, además, cita el valor al pintarlo (otro lote).
  - **URL de los archivos subidos relativa al sitio** (`/media/assets/...`) en vez de absoluta al host de la API; Next reenvía `/media` al backend como hace con `/api`.
  - **Escrituras de página entera** (restaurar, generar con IA, instantáneas): dentro de `transaction.atomic()` y con la fila de la página bloqueada (`lock_page`, `SELECT ... FOR UPDATE`; en SQLite el propio motor serializa a los escritores). `version_number` se calcula con el bloqueo tomado y un choque con la restricción única se reintenta. Restaurar conserva los ids de los bloques de la instantánea (nuevos solo si otra página los usa, se repiten o están mal formados).
  - **Editar un bloque con IA** solo se aplica si, tras la llamada al modelo y con el bloqueo tomado, el bloque sigue como estaba al empezar; si cambió responde `409 BLOCK_CHANGED` sin escribir nada. Si otra conexión tiene bloqueado el bloque (`X-Connection-Id` distinto del titular), `409 BLOCK_LOCKED`.
  - Los endpoints públicos de solo lectura (`/api/public/pages/{slug}/`, sitemap, resolución de dominio) no tienen límite de peticiones: su único cliente es el servidor de Next (una IP) y un robot podía agotar los 60/min y dejar todas las páginas publicadas en 500. La recogida de analítica tiene su propio cubo (`scope = 'analytics'`).
  - Una página admite como máximo 100 bloques, y la lista del panel solo carga los 4 primeros bloques de cada página (con el total anotado).
- **Consecuencias**: Se pierde alguna URL de imagen con paréntesis sin codificar al migrar (se vacía). Un editor al que le llega `BLOCK_CHANGED` debe ofrecer reintentar. El bloqueo de fila solo ordena de verdad en PostgreSQL; el test con hilos corre en el trabajo de CI de PostgreSQL. Sin límite de peticiones en lo público, la protección contra abusos pasa a la caché de Next y al proveedor de hosting.

## ADR-035: Colaboración, ronda 1 de QA: bloqueos en el store, texto en directo que no es tuyo, deshacer que no resucita

- **Fecha**: 2026-10-10
- **Contexto**: La ronda 1 de QA encontró que el bloqueo de un bloque solo se respetaba en el lienzo (desde Capas, el teclado o el móvil se podía editar y borrar lo que otra persona tenía), que el texto que llega en directo de otra persona se trataba como guardado (se colaba en el guardado de otro aunque su autor cerrara sin guardar, y vaciaba el historial de deshacer), que deshacer podía devolver un bloque que otra persona había borrado, que un bloqueo caducado seguía mostrándose a los demás, que tras una caída larga el editor dejaba de reconectar y que restaurar una versión cambiaba el id de todos los bloques (y la fusión duplicaba el que alguien estaba editando).
- **Decisión**:
  - El store aplica los bloqueos: `selectBlock` devuelve `boolean` y rechaza un bloque cuyo bloqueo es de otra conexión (otra persona u otra pestaña tuya); `requestDeleteBlock` también, y `confirmDeleteBlock` vuelve a mirarlo. Las acciones que cambian un bloque (campos, listas, estilos, borrar) no hacen nada sobre un bloque ajeno. Un rechazo queda en `lockRefusal`; `useCollaboration` lo anuncia con un aviso y pregunta al servidor (`lock_acquire`): si el bloqueo había caducado sin que nadie lo supiera, lo obtiene y selecciona el bloque. `lock_rejected` (dos clics casi a la vez) quita la selección.
  - El texto que llega por `block_updated` se guarda como `relayedEdits` (solo los campos que cambian respecto a lo que hay en pantalla), no en la base de sincronización. Se escribe en la página y en los pasos de deshacer solo en esos campos, así que deshacer sigue revirtiendo tus cambios. Al guardar y al fusionar, esos campos llevan el valor del servidor (`withoutRelayedEdits`): el texto es de quien lo escribe, que lo guarda él. Si su autor se va sin guardar, desaparece; tras una fusión se mantiene en pantalla mientras su autor siga con el bloque.
  - Los pasos de deshacer se rebasan con `rebaseSnapshot`: un bloque que otra persona borró desaparece también de la historia. "Una edición no se pierde ante un borrado" sigue valiendo para la página en pantalla, no para estados antiguos.
  - Restaurar una versión recrea los bloques con los ids guardados en la instantánea (salvo que falten, se repitan o ya los use otra página). Así un editor con un cambio sin guardar en ese bloque lo fusiona en el mismo bloque.
  - Una renovación de bloqueo que llega tarde (el bloqueo caducó) vuelve a tomarlo y lo anuncia a todos; si otra conexión lo tomó entretanto, solo quien llegó tarde recibe `lock_rejected`. El cliente vuelve a pedir el bloqueo de su bloque seleccionado si el servidor le dice que lo ha perdido.
  - Reconexión: tras 8 intentos rápidos el editor dice "Sin tiempo real" con un botón "Reconectar", pero sigue probando cada minuto, y prueba al momento con el evento `online`, al volver a la pestaña o con el botón.
  - Si se pierde el acceso (dejan de compartir, o `access.revoked` con `reason: "page_deleted"` y sin `user_id`, que llega a todos), el editor queda en solo lectura: nada se selecciona ni se cambia y el aviso dice por qué.
  - Nombres: los invitados se muestran como "Invitado 1", "Invitado 2"… (por orden de llegada en ese editor) y sin su email de relleno; un bloque que tienes en otra pestaña dice "tu otra pestaña".
- **Alternativas**: Comprobar el bloqueo en cada componente (Capas, atajos, Quick Edit; es como se rompió); pasar el texto en directo a la base de sincronización (era el fallo); un barrido en el servidor que anuncie los bloqueos caducados (con Redis las claves caducan sin aviso y haría falta otro proceso).
- **Consecuencias**: Corrige la consecuencia de ADR-024 "un bloqueo que caduca no se anuncia hasta que alguien lo pide": ahora pedirlo es lo que hace el editor cuando la persona intenta seleccionarlo (desde el lienzo sigue bastando el aviso local). Los números de invitado pueden diferir entre editores. Dos personas que editan el mismo campo sin bloqueo siguen con "gana el último" (ADR-024).

---

## Plantilla para nuevas decisiones

```markdown
## ADR-XXX: [Título]

- **Fecha**: YYYY-MM-DD
- **Contexto**: [Por qué surge esta decisión]
- **Decisión**: [Qué se decidió]
- **Consecuencias**: [Qué implica, trade-offs]
```

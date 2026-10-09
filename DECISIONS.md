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
- **Consecuencias**: Presencia y bloqueos siguen siendo de un solo proceso (ADR-015); con Redis los bloqueos se comparten pero la lista de presencia no. Un bloqueo que caduca por TTL no se anuncia hasta que alguien lo pide. Los clientes deben fusionar en 409 y reintentar con la versión devuelta.

---

## Plantilla para nuevas decisiones

```markdown
## ADR-XXX: [Título]

- **Fecha**: YYYY-MM-DD
- **Contexto**: [Por qué surge esta decisión]
- **Decisión**: [Qué se decidió]
- **Consecuencias**: [Qué implica, trade-offs]
```

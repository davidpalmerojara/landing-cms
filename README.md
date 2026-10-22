# Paxl

[![CI](https://github.com/davidpalmerojara/landing-cms/actions/workflows/ci.yml/badge.svg)](https://github.com/davidpalmerojara/landing-cms/actions/workflows/ci.yml)

Editor visual de landing pages: montas la página con bloques, la ves en escritorio, tablet y móvil, la editas con otras personas a la vez y la publicas con su propia dirección. Frontend en Next.js, React y TypeScript; backend propio en Django, Django REST Framework y Channels.

*A visual landing-page editor with typed blocks, design tokens, server-rendered published pages, real-time collaboration and structured AI generation. Next.js + TypeScript frontend, Django + DRF + Channels backend.*

![El editor de Paxl con una página de ejemplo](frontend/public/landing/editor-es.webp)

**Vídeo de 65 segundos** grabado sobre la aplicación real: sesión de invitado, edición, diseño por dispositivo, tema, listas, otra persona editando a la vez y publicación. El vídeo y las capturas son anteriores a los últimos retoques de la interfaz (barra superior, panel «Bloques», modo claro), así que algunos botones y textos han cambiado; el comportamiento es el mismo.

[![Recorrido por Paxl en vídeo](docs/video/paxl-demo-poster.webp)](docs/video/paxl-demo.mp4)

## Qué se puede hacer

- **Editar con bloques.** 15 tipos de bloque (hero, características, precios, FAQ, galería, equipo, formulario de contacto…) con contenido tipado. Las listas se añaden, quitan y reordenan, y deshacer revierte cada cambio como un paso.
- **Diseñar con un tema, no bloque a bloque.** Colores, tipografía, espaciado y bordes son *design tokens* de la página; hay paletas de partida y aviso de contraste WCAG.
- **Verla en cualquier pantalla.** Los bloques eligen su diseño con *container queries*, así que el mismo CSS sirve en la página real y en los marcos de móvil y tablet del editor.
- **Publicar sin miedo.** Publicar congela una copia: lo que editas no llega a los visitantes hasta que vuelves a publicar. La página pública se renderiza en el servidor y se cachea hasta la siguiente publicación.
- **Recibir contactos y medir visitas.** Formulario de contacto con los mensajes en el editor, y analítica sin cookies ni nada guardado en el dispositivo del visitante.
- **Editar a la vez con otras personas.** Presencia, bloqueo por bloque, cursores y una fusión en tres vías que no pierde los cambios de nadie. Un enlace de invitación permite probarlo con una segunda ventana.
- **Generar con IA.** La IA devuelve bloques que pasan por la misma validación que el editor. En la demo no gasta nada: sirve páginas guardadas y lo dice; con tu propia clave genera de verdad.
- **Probar sin registrarse.** Sesión de invitado de 24 horas, con límites contra abusos. En la demo todas las cuentas tienen las funciones Pro (colaboración, analítica) porque los pagos están apagados.
- **En español e inglés**, interfaz y contenido. Accesible con teclado (WCAG 2.2 AA como objetivo).

| Móvil | Página publicada |
|---|---|
| <img src="frontend/public/landing/mobile-es.webp" alt="Edición rápida en el móvil" width="260"> | <img src="frontend/public/landing/published-es.webp" alt="Una página publicada con Paxl" width="520"> |

## Demo desplegada

La demo se ejecuta en servicios gratuitos, todos en Fráncfort: **Vercel** (frontend), **Render** (backend, definido en [`render.yaml`](render.yaml)), **Neon** (PostgreSQL) y **Brevo** (email). Un job de GitHub Actions hace la limpieza diaria. Qué implica eso, dicho claro:

- **Arranque en frío.** Render gratis duerme el backend tras 15 minutos sin tráfico: la primera visita puede tardar entre 30 y 60 segundos. La portada avisa al servidor al cargar y el editor muestra un mensaje mientras despierta.
- **Espacio limitado.** La base gratuita es de 0,5 GB y guarda también las imágenes (recodificadas, con cuotas por cuenta y globales), así que hay topes de páginas, versiones, imágenes y analítica (ADR-049, ADR-053).
- **Los invitados duran 24 horas** y todo lo que crean se borra solo; la analítica se conserva 90 días.
- **Sin pagos reales.** La facturación solo existe con una clave de prueba de Stripe; en la demo está apagada.

Cómo se despliega y cómo se mide cada pieza está en las ADR 055 y 056.

## Arquitectura

```mermaid
flowchart LR
    subgraph Navegador
        E[Editor<br/>React + Zustand]
        V[Visitante]
    end
    subgraph Next.js
        R["Rewrite /api"]
        P["/p/[slug]<br/>render en servidor"]
        C[("Caché de datos")]
        RV["POST /revalidate"]
    end
    subgraph Django
        API[DRF<br/>REST]
        WS[Channels<br/>WebSocket]
        DB[("PostgreSQL / SQLite")]
    end
    AI[[Proveedor de IA<br/>opcional]]

    E -- "cookies httpOnly" --> R --> API
    E -- "ticket de un solo uso" --> WS
    V --> P --> C
    C -. "si caduca" .-> API
    API --> DB
    WS --> DB
    API -- "al publicar" --> RV --> C
    API -. "clave propia o modo demo" .-> AI
```

- **Un solo origen para el navegador.** Next reenvía `/api` a Django, así que las cookies de sesión (httpOnly, sin tokens en JavaScript) son del mismo sitio aunque el backend esté en otro dominio. Las escrituras comprueban la cabecera `Origin`.
- **El servidor manda.** Cada página tiene una versión; un guardado basado en una versión vieja recibe 409 y el cliente fusiona. El WebSocket solo avisa de que algo cambió (y retransmite la escritura en vivo del bloque bloqueado).
- **Una sola puerta para el contenido.** Todo lo que entra en un bloque, venga del editor, del WebSocket, de la IA o de una versión restaurada, pasa por `clean_block_data`: lista blanca de campos, enlaces y URLs seguros, texto saneado una sola vez.

## Decisiones

Están en [`DECISIONS.md`](DECISIONS.md), con su contexto, alternativas y consecuencias. Las que más explican el proyecto:

| ADR | Decisión |
|---|---|
| [004](DECISIONS.md#adr-004-bloques-tipados-atómicos-sobre-editor-libre) / [021](DECISIONS.md#adr-021-las-listas-de-los-bloques-son-arrays-tipados) | Bloques tipados en lugar de un editor libre; listas como arrays con unión discriminada en TypeScript |
| [008](DECISIONS.md#adr-008-jwt-solo-en-cookies-httponly-con-comprobación-de-origin) / [010](DECISIONS.md#adr-010-autenticación-del-websocket-con-la-cookie-de-sesión) | Sesión solo en cookies httpOnly; WebSocket con ticket de un solo uso |
| [014](DECISIONS.md#adr-014-ids-de-bloque-generados-en-el-cliente) | IDs de bloque generados en el cliente: sin remapeo tras el autoguardado |
| [017](DECISIONS.md#adr-017-publicar-es-congelar-una-copia) / [019](DECISIONS.md#adr-019-la-página-publicada-se-renderiza-en-el-servidor) | Publicar congela una copia; la página pública se renderiza en el servidor y se revalida al publicar |
| [020](DECISIONS.md#adr-020-un-solo-sistema-de-tema-design-tokens) | Un solo sistema de tema (design tokens), con migración de los temas antiguos |
| [023](DECISIONS.md#adr-023-la-ia-de-la-demo-no-cuesta-nada-y-lo-dice) | IA en tres capas: clave propia, modo demo y clave del servidor con topes |
| [024](DECISIONS.md#adr-024-colaboración-segura-versión-de-página-fusión-y-presencia-por-conexión) | Colaboración: versión de página, 409 y fusión en tres vías |
| [049](DECISIONS.md#adr-049-imágenes-subidas-en-postgresql-recodificadas-con-cuotas-y-servidas-en-las-mismas-urls-media) | Imágenes en PostgreSQL, recodificadas con Pillow (sin EXIF), con cuotas y servidas con caché inmutable |
| [052](DECISIONS.md#adr-052-una-cuenta-sin-email-verificado-publica-como-un-invitado) / [053](DECISIONS.md#adr-053-topes-de-almacenamiento-para-una-base-de-datos-de-05-gb) | Una cuenta sin email verificado publica como un invitado; topes para una base de 0,5 GB |
| [055](DECISIONS.md#adr-055-la-ip-del-visitante-detrás-de-vercel-y-render-solo-se-confía-en-x-forwarded-for-si-llega-el-secreto-del-frontend) / [056](DECISIONS.md#adr-056-arranque-de-render-gratis-migraciones-en-el-build-conexiones-sin-persistir-salud-sin-host-y-mantenimiento-por-github-actions) | IP del visitante detrás de Vercel y Render con un secreto de origen; arranque y mantenimiento en Render gratis |

[`docs/bugs-notables.md`](docs/bugs-notables.md) cuenta los fallos que se encontraron, cómo se detectaron y cómo se verificó cada arreglo.

## Calidad

- **Backend:** pytest, 2.102 tests (más uno omitido), incluidos tests del WebSocket con `WebsocketCommunicator`, una carrera real entre dos guardados y los permisos cruzados entre usuarios.
- **Frontend:** Vitest, 1.290 tests en 109 archivos, incluida la fusión de páginas con pruebas de propiedades sobre ediciones aleatorias.
- **De punta a punta:** Playwright contra el stack real (Daphne y `next start`), 63 tests: invitado, cuenta, publicación, imágenes y colaboración entre dos navegadores.
- **CI** en cada push: tests, tipos (`tsc` estricto, sin `any`), lint, una comprobación de que cada clase de Tailwind genera CSS, build y la suite de punta a punta.

## Cómo ejecutarlo

Requisitos: Python 3.13, Node 22 (`.nvmrc`) y `make`. No hace falta ningún servicio externo: en local se usa SQLite, la capa de canales en memoria, las imágenes en la propia base y el email se imprime en la consola.

```bash
make install   # crea backend/venv, instala dependencias y copia los .env de ejemplo
make migrate   # crea la base de datos SQLite y los planes Free/Pro
make dev       # arranca backend y frontend; Ctrl+C para parar los dos
```

- Frontend: http://localhost:3000
- API: http://localhost:8001/api

`make install` no sobrescribe un `backend/.env` ni un `frontend/.env.local` que ya existan. Las variables están documentadas en `backend/.env.example` y `frontend/.env.example`.

| Comando | Qué hace |
|---|---|
| `make dev` | Backend (8001) y frontend (3000) a la vez |
| `make backend` / `make frontend` | Cada parte por separado |
| `make test` | Tests de backend (pytest) y frontend (Vitest) |
| `make e2e` | Suite de punta a punta con Playwright |
| `make typecheck` / `make lint` / `make build` | Comprobaciones del frontend |
| `make check` | Los mismos pasos que el CI |
| `make lock` | Regenera el lockfile de Python desde `backend/requirements.in` (requiere [uv](https://docs.astral.sh/uv/)) |

## Limitaciones conocidas

- **Tiempo real en un solo proceso.** Sin Redis, la presencia, los bloqueos y la capa de canales viven en la memoria de un único proceso del servidor (ADR-015). Con `REDIS_URL` se comparten los bloqueos y los canales, pero la lista de presencia, los tickets del WebSocket y los límites de frecuencia siguen siendo por proceso. La demo corre con un solo proceso.
- **La IA de la demo no genera en vivo.** Sirve diez páginas de ejemplo escritas a mano y lo dice en pantalla; con tu propia clave de Gemini o Anthropic genera de verdad.
- **Email con tope diario.** En la demo desplegada los enlaces mágicos y los avisos de compartir salen por la API de Brevo (plan gratuito) con un tope de 250 correos al día en total y 5 por destinatario; si se agota o el proveedor falla, el acceso por contraseña, el modo invitado y la cuenta de demostración siguen funcionando. En local el email se imprime en la consola.
- **Pagos apagados.** No hay forma de pagar en la demo: todas las cuentas tienen las funciones Pro y los límites de la base gratuita (20 páginas por cuenta, 20 versiones por página, 5 MB de páginas y versiones por cuenta).
- **Dominios propios desactivados** (`CUSTOM_DOMAINS_ENABLED`): necesitan DNS y certificados que el hosting gratuito no ofrece.
- **Accesibilidad pendiente:** los bordes de campos y tarjetas no llegan a 3:1 de contraste y la edición de texto directamente en el lienzo solo se abre con doble clic (con teclado se edita desde el inspector).

## Estructura

```
frontend/   Next.js (App Router): app/, components/, hooks/, lib/, store/, types/
backend/    Django: accounts, pages, submissions, analytics, ai_generation, billing, collaboration
docs/       Fallos notables y su verificación, y el vídeo de la demo
render.yaml    Blueprint de Render para el backend
DECISIONS.md   Decisiones de arquitectura (ADR)
AGENTS.md      Guía del código: arquitectura, convenciones, modelo de datos y endpoints
LICENSE        Todos los derechos reservados (el código es visible para revisarlo)
```

## Licencia

Todos los derechos reservados. El código es público para que se pueda leer y revisar, pero no se concede ninguna licencia de uso, copia ni reutilización; ver [`LICENSE`](LICENSE).

## English summary

Paxl is a visual landing-page editor: you build a page from typed blocks, preview it on desktop, tablet and phone, edit it together with other people and publish it at its own address.

- **Frontend:** Next.js (App Router), React 19, TypeScript in strict mode, Zustand, Tailwind CSS 4, next-intl (Spanish and English).
- **Backend:** Django, Django REST Framework and Channels (WebSockets for collaboration), PostgreSQL (SQLite locally). Sessions live in httpOnly cookies; published pages are rendered on the server and revalidated when you publish.
- **Interesting parts:** a three-way merge for concurrent edits, per-block locks, one validation path for everything that enters a block (editor, WebSocket, AI, restored versions), design tokens with WCAG contrast guarantees, cookieless analytics, and images stored re-encoded in PostgreSQL. The reasoning behind each choice is in [`DECISIONS.md`](DECISIONS.md) (in Spanish).
- **Quality:** 2,102 backend tests, 1,290 frontend tests and 63 Playwright end-to-end tests against the real stack, run in CI.
- **The deployed demo** runs on free tiers (Vercel, Render, Neon, Brevo) in Frankfurt: the first visit after 15 idle minutes can take up to a minute while Render wakes up; guest accounts last 24 hours; AI generation serves saved responses unless you bring your own key; payments are off, so every account has the Pro features.
- **Run it locally:** `make install && make migrate && make dev` (Python 3.13, Node 22; no external services needed).
- **Licence:** all rights reserved. The source is public for review only; see [`LICENSE`](LICENSE).

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

## ADR-008: httpOnly cookies para JWT sobre localStorage

- **Fecha**: 2025 (inferido)
- **Contexto**: Almacenar JWT en localStorage lo expone a XSS. Las cookies httpOnly no son accesibles desde JavaScript.
- **Decisión**: Access token y refresh token en httpOnly cookies. Fallback a localStorage solo para compatibilidad temporal.
- **Consecuencias**: Mayor seguridad contra XSS. CSRF requiere protección adicional (Django CSRF middleware). El frontend no lee el token directamente; `lib/api.ts` envía cookies automáticamente con `credentials: 'include'`.

---

## ADR-009: Implementación nativa de DnD sobre librerías

- **Fecha**: 2025 (inferido)
- **Contexto**: El editor necesita drag & drop para reordenar bloques. Librerías como `react-dnd` o `dnd-kit` añaden peso y complejidad.
- **Decisión**: Implementación custom con Pointer Events API y estado en Zustand (`useDragManager` hook).
- **Consecuencias**: Sin dependencias adicionales. Control total sobre el comportamiento. Mayor esfuerzo de mantenimiento, pero el DnD del editor tiene requisitos específicos (canvas con zoom, drop zones entre bloques) que hacen que una librería genérica no encaje bien.

---

## ADR-010: JWT en query string para WebSocket (riesgo aceptado)

- **Fecha**: 2026-03-26
- **Contexto**: El API de WebSocket del navegador no permite enviar headers custom (`Authorization`) durante el handshake. Las alternativas son: (1) token en query string, (2) cookie auth, (3) subprotocol header hack. Cookie auth requiere que Django Channels extraiga JWT de la cookie httpOnly, lo cual necesita middleware custom en ASGI. La opción de subprotocol es frágil y no estándar.
- **Decisión**: Usar token JWT en query string (`?token=<jwt>`) para el handshake de WebSocket. Migrar a cookie auth en ASGI cuando el sistema de colaboración pase a producción completa.
- **Consecuencias**: El token puede quedar en logs del servidor y en el historial del navegador. Se mitiga porque: (a) los access tokens tienen expiración corta (1h), (b) los logs del servidor deben configurarse para no registrar query strings en producción, (c) la colaboración está en desarrollo y no expuesta a usuarios finales aún. Queda documentado como deuda técnica a resolver antes del lanzamiento de colaboración.

---

## Plantilla para nuevas decisiones

```markdown
## ADR-XXX: [Título]

- **Fecha**: YYYY-MM-DD
- **Contexto**: [Por qué surge esta decisión]
- **Decisión**: [Qué se decidió]
- **Consecuencias**: [Qué implica, trade-offs]
```

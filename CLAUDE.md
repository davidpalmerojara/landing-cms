# CLAUDE.md — Visual Landing Page Builder

> Este archivo define el producto, la arquitectura, las convenciones y el flujo de trabajo.
> Léelo completo antes de cualquier tarea.

---

## Visión del producto

Editor visual para crear landing pages, similar a Webflow, Framer o el editor de Shopify.

El usuario construye páginas mediante **bloques en flujo vertical** (no posicionamiento libre tipo Figma).
Cada bloque es una sección de la página. El orden se gestiona por índice, no por coordenadas x/y.

### Funcionalidades del editor

| Categoría      | Funcionalidades                                              |
|----------------|--------------------------------------------------------------|
| Edición        | Seleccionar, editar, duplicar, eliminar bloques              |
| Organización   | Drag & drop, reordenar por índice                            |
| Productividad  | Undo, redo, copy, paste                                      |
| Navegación     | Zoom canvas, pan canvas, centrar canvas                      |
| Visualización  | Preview mode, responsive preview (desktop / tablet / mobile) |
| Persistencia   | Local storage (fase actual), backend (fase futura)           |

---

## Decisiones arquitectónicas tomadas

### 1. Bloques en flujo vertical (NO posicionamiento libre)

Una landing es una secuencia ordenada de secciones.
Los bloques **no tienen** x, y, width, rotation.
Se reordenan por índice. Esto simplifica DnD, responsive, inspector y backend.

### 2. Estado global centralizado con Zustand

Todo el estado del editor vive en un store central (`editor-store.ts`).
No se reparte en múltiples `useState` locales para evitar prop drilling y acciones cruzadas.

El store contiene:

```typescript
// Estado del documento
page: Page

// Interacción
selectedBlockId: string | null
clipboard: Block | null
isPreviewMode: boolean
deviceMode: 'desktop' | 'tablet' | 'mobile'

// Historial
history: Page[]
historyIndex: number

// Viewport
viewportZoom: number
viewportOffset: { x: number; y: number }
```

Acciones del store:

```typescript
addBlock(type: string, afterId?: string): void
updateBlock(id: string, data: Partial<BlockData>): void
deleteBlock(id: string): void
duplicateBlock(id: string): void
moveBlock(id: string, direction: 'up' | 'down'): void
selectBlock(id: string | null): void
undo(): void
redo(): void
copy(): void
paste(): void
setZoom(zoom: number): void
centerCanvas(): void
setDeviceMode(mode: DeviceMode): void
togglePreview(): void
```

> **Nota sobre history:** El historial almacena snapshots del objeto `page` completo.
> Para páginas grandes, considerar en el futuro almacenar solo diffs (patches Immer).
> Por ahora, snapshot completo es suficiente y más simple.

---

## Stack tecnológico

### Frontend (fase actual)

- **Next.js** — framework
- **React** — UI
- **TypeScript** — tipado (obligatorio desde la migración)
- **Tailwind CSS** — estilos
- **Zustand** — estado global
- **clsx** — utilidad de clases condicionales

### DnD

- Migrar el DnD actual tal cual en la primera fase
- Evaluar **dnd-kit** más adelante si el DnD actual presenta limitaciones

### Backend (fase futura)

- Django + Django REST Framework
- PostgreSQL

---

## Estructura del proyecto

```
landing-cms/
  frontend/
    app/
      layout.tsx
      page.tsx
      editor/
        page.tsx
      preview/
        [pageId]/
          page.tsx

    components/
      editor/
        TopBar.tsx
        LeftSidebar.tsx
        CanvasViewport.tsx         # Wrapper con zoom/pan
        CanvasStage.tsx            # Stage interior del canvas
        BrowserFrame.tsx           # Marco del navegador simulado
        BlockWrapper.tsx           # Wrapper de cada bloque (selección, DnD handle)
        FloatingViewportControls.tsx

      blocks/
        HeroBlock.tsx
        FeaturesBlock.tsx
        TestimonialsBlock.tsx
        FooterBlock.tsx

      inspector/
        Inspector.tsx
        FieldRenderer.tsx          # Decide qué campo renderizar según type
        TextField.tsx
        TextAreaField.tsx
        SelectField.tsx
        ColorField.tsx

      ui/
        Button.tsx
        IconButton.tsx
        Panel.tsx
        Tabs.tsx
        Input.tsx
        Textarea.tsx

    lib/
      block-registry.ts            # Registro central de tipos de bloque
      block-factory.ts             # Crea instancias de bloque con ID y data inicial
      history.ts                   # Helpers para push/undo/redo en el store
      keyboard-shortcuts.ts        # Mapa de atajos
      viewport.ts                  # Helpers de zoom y pan
      utils.ts

    hooks/
      useEditorShortcuts.ts
      useCanvasPanZoom.ts
      useBlockDnD.ts
      useLocalPagePersistence.ts

    store/
      editor-store.ts              # Store Zustand único del editor

    types/
      blocks.ts                    # BlockType, BlockData, Block
      page.ts                      # Page
      editor.ts                    # EditorState, DeviceMode
      inspector.ts                 # FieldDefinition, FieldType

    styles/
      globals.css

  backend/
    ...

  CLAUDE.md
  README.md
  .gitignore
```

---

## Árbol de componentes del editor

```
EditorPage
 └─ EditorShell
     ├─ TopBar
     ├─ LeftSidebar
     ├─ CanvasViewport              ← gestiona zoom y pan
     │   ├─ CanvasStage
     │   │   └─ BrowserFrame
     │   │       └─ PageRenderer
     │   │           └─ BlockWrapper (×n)
     │   │               └─ BlockComponent
     │   └─ FloatingViewportControls
     └─ Inspector
```

---

## Block Registry

Registro central en `lib/block-registry.ts`. Es la fuente única de verdad sobre los tipos de bloque.

```typescript
// types/blocks.ts
export interface FieldDefinition {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'color'
  options?: { value: string; label: string }[]
}

export interface BlockDefinition {
  type: string
  label: string
  icon: LucideIcon
  initialData: Record<string, any>
  fields: FieldDefinition[]
  component: React.ComponentType<{ data: any }>
}

// lib/block-registry.ts
export const blockRegistry: Record<string, BlockDefinition> = {
  hero: {
    type: 'hero',
    label: 'Hero',
    icon: Layout,
    initialData: { title: 'Tu título aquí', subtitle: '', ctaText: 'Empezar' },
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'ctaText', label: 'Texto del botón', type: 'text' },
    ],
    component: HeroBlock,
  },
  // ...
}
```

---

## Tipos principales

```typescript
// types/page.ts
export interface Block {
  id: string
  type: string
  data: Record<string, any>
}

export interface Page {
  id: string
  name: string
  blocks: Block[]
}

// types/editor.ts
export type DeviceMode = 'desktop' | 'tablet' | 'mobile'
```

---

## Plan de migración por fases

### Fase 1 — Proyecto y estructura
- Crear proyecto Next.js con TypeScript y Tailwind
- Crear toda la estructura de carpetas vacía
- Instalar dependencias: zustand, clsx, lucide-react

### Fase 2 — Tipos, registry y bloques
- Definir todos los tipos en `types/`
- Migrar `BLOCK_REGISTRY` a `lib/block-registry.ts`
- Migrar componentes de bloque a `components/blocks/`

### Fase 3 — Shell del editor
- Migrar TopBar, LeftSidebar, Inspector a `components/editor/`
- Migrar campos del inspector a `components/inspector/`
- Crear componentes UI básicos en `components/ui/`

### Fase 4 — Store central
- Crear `store/editor-store.ts` con Zustand
- Migrar todo el estado del prototipo al store
- Conectar componentes al store

### Fase 5 — Canvas y funcionalidades
- Migrar CanvasViewport con zoom y pan
- Reintegrar drag & drop en BlockWrapper
- Reintegrar undo/redo, copy/paste
- Reintegrar preview mode y device mode

### Fase 6 — Hooks y persistencia
- Extraer lógica reactiva a hooks
- Reintegrar persistencia local con `useLocalPagePersistence`
- Migrar atajos de teclado a `useEditorShortcuts`

---

## Reglas de trabajo

### Lo más importante

1. **No reescribas el editor desde cero.** Migra y refactoriza incrementalmente.
2. **Mantén la funcionalidad existente** en cada fase. Cada fase debe resultar en un editor funcional.
3. **No cambies el diseño visual** salvo que se solicite explícitamente.

### Componentes

- Separar UI, lógica y estado
- Componentes pequeños y con responsabilidad única
- Sin prop drilling: usar el store para estado compartido

### Código

- Priorizar legibilidad sobre cleverness
- Centralizar configuración en registries
- Evitar duplicación de lógica

### Flujo de trabajo en cada tarea

1. Analizar el código afectado
2. Proponer un plan breve (2-5 pasos)
3. Ejecutar paso a paso
4. Verificar que el comportamiento anterior se mantiene

---

## Lo que NO se hace todavía

- Backend, auth, guardado remoto
- Publicación de páginas
- Theming complejo
- Media uploads
- Posicionamiento libre de elementos (tipo Figma)
- Migración a dnd-kit (solo si el DnD actual da problemas)

---

## Mockup de referencia del editor

El prototipo funcional está en `docs/mockup-editor.tsx`. **Leerlo antes de cualquier tarea de UI.**
Es la fuente de verdad del look & feel. No alterar el diseño visual sin consultarlo.

### Paleta y tokens visuales del editor

| Elemento | Valor |
|---|---|
| Fondo general / sidebars | `zinc-950` |
| Bordes | `zinc-800/80` |
| Superficie elevada | `zinc-900` |
| Texto principal | `zinc-100` |
| Texto secundario | `zinc-400 / zinc-500` |
| Acento principal | `indigo-500 / indigo-600` |
| Acento hover | `indigo-400` |
| Peligro | `red-400 / red-500` |
| Éxito | `emerald-400` |

### Layout del editor (3 columnas fijas)

```
┌─────────────────────────────────────────────────────────┐
│  TopBar (h-14, zinc-950, z-30)                          │
├──────────────┬──────────────────────────┬───────────────┤
│ LeftSidebar  │     CanvasViewport       │   Inspector   │
│   w-64       │   flex-1, bg-zinc-950    │     w-80      │
│              │   dot-grid pattern       │               │
│  [Tabs]      │   pan + zoom libre       │  (oculto en   │
│  Components  │                          │  preview)     │
│  Layers      │   ┌─ BrowserFrame ─┐    │               │
│              │   │ chrome bar h-10│    │               │
│              │   │ BlockWrapper×n │    │               │
│              │   └────────────────┘    │               │
│ (oculto en   │                          │               │
│  preview)    │  FloatingViewportCtrls  │               │
└──────────────┴──────────────────────────┴───────────────┘
```

### Comportamientos críticos implementados en el mockup

**Canvas (CanvasViewport)**
- Fondo: dot-grid `radial-gradient(#27272a 1px, transparent 1px)` que se mueve con el pan
- Pan: Space+drag, Middle-click+drag, o rueda del ratón (deltaX/deltaY)
- Zoom: Ctrl/Cmd+rueda. Rango 0.5x–2x. Pivota sobre el cursor
- El `wheel` listener usa `capture: true` para interceptar incluso durante drag
- `origin-top-left` en el contenedor transformado (no `center`)
- Transición `transform 0.1s ease-out` salvo mientras se hace pan (entonces `none`)

**BrowserFrame**
- Barra de chrome simulada (h-10, zinc-950) con 3 dots de color + URL falsa + icono de lock
- Ancho según deviceMode: `375px` mobile, `768px` tablet, `1024–1200px` desktop
- `rounded-xl`, sombra `shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)]`

**BlockWrapper**
- Outline `2px offset-3px` — `indigo-500` si selected, `indigo-400/40` en hover
- Tooltip flotante centrado en `-top-3.5`: nombre del bloque + grip + botones Duplicar/Eliminar
- El tooltip aparece en hover Y en selección (`opacity-0 → opacity-100 scale-100`)
- Indicador de drop: línea `h-[2px] bg-indigo-500` con dot central, `shadow glow`
- Durante Space/pan: `pointer-events-none` en el contenido del canvas

**LeftSidebar**
- Tabs: `Components` (grid de bloques arrastrables) y `Layers` (lista reordenable)
- Cada bloque en Components: icono + label + GripVertical que aparece en hover
- Layers: ítem seleccionado en `indigo-500/10` con borde `indigo-500/30`
- Indicador de drop en Layers: `border-t-indigo-500`

**Inspector**
- Estado vacío: icono centrado + texto "Nada seleccionado"
- Estado con bloque: header con icono+nombre+type, sección "Contenido" colapsable, sección "Estilos" (deshabilitada, badge "Demo")
- Inputs: `bg-zinc-900/80 border-zinc-800`, focus `border-indigo-500 ring-1 ring-indigo-500`
- Textarea: `h-24 resize-none`
- Footer del inspector: botones Duplicar + Eliminar

**TopBar**
- Logo gradiente `from-indigo-600 to-violet-500`
- Device switcher centrado en pill `bg-zinc-900/80`
- Botón activo del switcher: `bg-zinc-800 text-zinc-100 shadow-sm`
- Guardar muestra `CheckCircle2 text-emerald-400` durante 2s tras guardar
- Preview toggle: si activo `bg-indigo-500/10 text-indigo-400`

**Drag Ghost**
- Elemento `div#drag-ghost` fijo fuera de pantalla (`-top-[1000px]`)
- Se usa como `setDragImage` en `dragstart` para mostrar pill personalizada

**FloatingViewportControls**
- `absolute bottom-6`, se desplaza con la sidebar: `right-6` en preview, `right-[340px]` en edit
- Pill oscura con `-` / `%` / `+` / separador / botón center (icono Focus)

### Atajos de teclado implementados

| Atajo | Acción |
|---|---|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + Y` | Redo |
| `Cmd/Ctrl + C` | Copy bloque seleccionado |
| `Cmd/Ctrl + V` | Paste después del bloque seleccionado |
| `Delete / Backspace` | Eliminar bloque seleccionado |
| `Space + drag` | Pan del canvas |
| `Middle-click + drag` | Pan del canvas |

> Los atajos no se activan si el foco está en `INPUT` o `TEXTAREA`

### AutoScroll

Hook `useAutoScroll` con `requestAnimationFrame`. Activo durante drag en sidebar y canvas.
Velocidad proporcional a la proximidad del borde (threshold 100px, maxSpeed 30px/frame).

### Historial (undo/redo)

- Arrays `past[]` y `future[]` de snapshots completos de `page`
- Límite de 50 estados en `past`
- `setPageWithHistory` hace push a `past` y limpia `future`
- El historial NO se persiste en localStorage (solo `page` se persiste)

### Scrollbar personalizada

```css
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: #09090b; border-left: 1px solid #18181b; }
::-webkit-scrollbar-thumb { background-color: #3f3f46; border-radius: 8px; border: 2px solid #09090b; }
::-webkit-scrollbar-thumb:hover { background-color: #52525b; }
```

---

## Mockup de referencia — Landing page de marketing

El prototipo está en `docs/mockup-landing.tsx`. Es la página pública del producto (marketing site), **no el editor**.

### Diferencias clave respecto al editor

| Aspecto | Editor | Landing |
|---|---|---|
| Fondo base | `zinc-950` sólido | `zinc-950` + efectos radial/blur |
| Logo icono | `Sparkles` | `Layers` |
| Nombre del producto | sin nombre fijo | **BuilderPro** |
| Nav | TopBar fija h-14 | `fixed` h-16 con `backdrop-blur-md` |

### Secciones de la landing (en orden)

1. **Nav** — fija `z-50`, `bg-zinc-950/80 backdrop-blur-md`, logo + links + CTA pill
2. **Hero** — gradiente radial + blur glow `indigo-600/20 blur-[120px]`, headline con `bg-clip-text` gradient `from-indigo-400 to-violet-400`, dos CTAs (blanco + zinc-900)
3. **Hero mockup** — simulación del editor: browser chrome + 3 columnas (sidebar / canvas / inspector), con `isHovered` state que muestra el selection box `border-indigo-500`
4. **Features** — grid 3 columnas, cards con icono en `bg-{color}-500/10 border-{color}-500/20`, tres colores: indigo / emerald / pink
5. **Social proof** — logos simulados en texto, `opacity-50 grayscale`
6. **CTA final** — `bg-indigo-600/10` de fondo, botón con `hover:scale-105`
7. **Footer** — 4 columnas (brand + social / Producto / Recursos), copyright

### Tokens específicos de la landing

- Headline hero: `text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.1]`
- Gradient texto: `text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400`
- Glow de fondo: `bg-indigo-600/20 blur-[120px] rounded-full` centrado con `-translate-x/y-1/2`
- Shadow del hero mockup: `shadow-[0_0_50px_-12px_rgba(99,102,241,0.3)]`
- Cards features: `rounded-2xl` (los bloques de la landing builder usan `rounded-3xl` — no confundir)
- Links footer en hover: `hover:text-indigo-400`

### Browser chrome simulado (hero mockup de la landing)

Comparte diseño con el `BrowserFrame` del editor real, pero con diferencias:

| Detalle | Editor real | Hero mockup landing |
|---|---|---|
| Altura | `h-10` | `h-12` |
| Dots | hover con color rojo/amber/verde | estáticos `bg-zinc-700` sin hover |
| URL | con `LockIcon` + `text-[11px]` | `font-mono text-xs` sin icono |
| Fondo barra | `zinc-950/95` | `zinc-900/50` |

> Mantener esta distinción al migrar: el editor real y la landing usan chrome similar pero no idéntico.

---

## Estado actual

Existe un prototipo funcional en un solo archivo React con:

- Block registry
- Drag & drop de bloques
- Inspector de propiedades
- Renderizado de bloques
- Preview básico
- Zoom y pan del canvas
- Duplicar / eliminar bloques
- Undo / redo
- Copy / paste
- Persistencia local

**Objetivo inmediato:** migrar este prototipo a la arquitectura descrita arriba, comenzando por la Fase 1.

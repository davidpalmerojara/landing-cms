/**
 * Centralized UI labels — single source of truth for user-facing text.
 * All UI text in Spanish. Import from here to avoid language inconsistencies.
 */

export const UI_LABELS = {
  // Product
  brand: 'Paxl',

  // Navigation
  nav: {
    projects: 'Proyectos',
    templates: 'Plantillas',
    assets: 'Recursos',
    settings: 'Configuración',
    dashboard: 'Panel',
    back: 'Volver',
    backToDashboard: 'Volver al dashboard',
  },

  // Page status
  status: {
    published: 'Publicada',
    draft: 'Borrador',
    publishedShort: 'P',
    draftShort: 'B',
  },

  // Save states
  save: {
    saving: 'Guardando...',
    saved: 'Guardado',
    error: 'Error al guardar',
    manualSave: 'Guardado manual',
    retry: 'Reintentar',
  },

  // Actions
  actions: {
    create: 'Crear',
    edit: 'Editar',
    delete: 'Eliminar',
    duplicate: 'Duplicar',
    publish: 'Publicar',
    preview: 'Vista previa',
    save: 'Guardar',
    cancel: 'Cancelar',
    close: 'Cerrar',
    search: 'Buscar',
    moveUp: 'Mover arriba',
    moveDown: 'Mover abajo',
    confirm: 'Confirmar',
    addBlock: 'Añadir bloque',
  },

  // Editor
  editor: {
    design: 'Diseño',
    styles: 'Estilos',
    seo: 'SEO',
    analytics: 'Analítica',
    content: 'Contenido',
    components: 'Componentes',
    layers: 'Capas',
    searchComponents: 'Buscar componentes...',
    emptyPage: 'Tu página está vacía',
    emptyPageHint: 'Arrastra un componente desde el panel izquierdo',
  },

  // Pages
  pages: {
    myPages: 'Mis páginas',
    newPage: 'Nueva página',
    searchPages: 'Buscar páginas...',
    noPages: 'No tienes páginas aún',
    page: 'página',
    pages: 'páginas',
  },

  // Connection
  connection: {
    offline: 'Sin conexión',
    reconnecting: 'Reconectando...',
    synced: 'Cambios sincronizados',
  },
} as const;

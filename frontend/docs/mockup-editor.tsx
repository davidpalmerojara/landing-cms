import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Monitor, Smartphone, Tablet, 
  Play, Save, Plus, 
  Layout, BoxSelect, MousePointer2, 
  AlignLeft, AlignCenter, AlignRight, Palette,
  Trash2, Settings, Type, Eye, EyeOff, RotateCcw,
  ChevronDown, CheckCircle2, GripVertical, Layers, Sparkles,
  MessageSquare, PanelBottom, Quote, Minus, Focus, Copy
} from 'lucide-react';

// ==========================================
// 1. COMPONENTES DE BLOQUES (DISEÑO)
// ==========================================

const HeroBlock = ({ data, isMobile, isTablet, isPreviewMode }) => (
  <div className={`bg-white flex flex-col items-center justify-center transition-all ${isPreviewMode ? '' : 'pointer-events-none'} ${isMobile ? 'py-16 px-6' : 'py-32 px-8'}`}>
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 text-zinc-600 text-sm font-medium mb-8">
      <Sparkles className="w-4 h-4" /> Nuevo Editor UI
    </div>
    <h1 className={`font-bold tracking-tight text-zinc-900 mb-8 max-w-4xl leading-tight transition-all text-center ${isMobile ? 'text-4xl' : isTablet ? 'text-5xl' : 'text-7xl'}`}>
      {data.title}
    </h1>
    <p className={`text-zinc-500 max-w-2xl mx-auto mb-12 leading-relaxed text-center transition-all ${isMobile ? 'text-lg' : 'text-xl'}`}>
      {data.subtitle}
    </p>
    <div className={s`flex gap-4 w-full justify-center transition-all ${isMobile ? 'flex-col px-4' : 'flex-row items-center'}`}>
      <button className={`bg-zinc-900 text-white rounded-full font-medium shadow-xl shadow-zinc-900/20 hover:bg-zinc-800 transition-all ${isMobile ? 'w-full py-4 text-lg' : 'px-8 py-4'}`}>
        {data.buttonText}
      </button>
      <button className={`bg-white text-zinc-900 rounded-full font-medium border border-zinc-200 hover:bg-zinc-50 transition-all ${isMobile ? 'w-full py-4 text-lg' : 'px-8 py-4'}`}>
        Saber más
      </button>
    </div>
  </div>
);

const FeaturesBlock = ({ data, isMobile, isPreviewMode }) => (
  <div className={`bg-zinc-50 transition-all ${isPreviewMode ? '' : 'pointer-events-none'} ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}>
    <h2 className={`font-bold text-center text-zinc-900 mb-12 transition-all ${isMobile ? 'text-3xl' : 'text-4xl mb-16'}`}>
      {data.title}
    </h2>
    <div className={`grid gap-6 max-w-5xl mx-auto transition-all ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
      <div className={`bg-white rounded-3xl shadow-sm border border-zinc-100 hover:shadow-md transition-all ${isMobile ? 'p-6' : 'p-10'}`}>
        <div className={`w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 ${isMobile ? 'mb-6 w-12 h-12' : 'mb-8'}`}>
          <Smartphone className={isMobile ? "w-6 h-6" : "w-7 h-7"} />
        </div>
        <h3 className={`font-semibold mb-3 text-zinc-900 ${isMobile ? 'text-lg' : 'text-xl mb-4'}`}>{data.feature1Title}</h3>
        <p className={`text-zinc-500 leading-relaxed ${isMobile ? 'text-base' : 'text-lg'}`}>{data.feature1Desc}</p>
      </div>
      <div className={`bg-white rounded-3xl shadow-sm border border-zinc-100 hover:shadow-md transition-all ${isMobile ? 'p-6' : 'p-10'}`}>
        <div className={`w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 ${isMobile ? 'mb-6 w-12 h-12' : 'mb-8'}`}>
          <Monitor className={isMobile ? "w-6 h-6" : "w-7 h-7"} />
        </div>
        <h3 className={`font-semibold mb-3 text-zinc-900 ${isMobile ? 'text-lg' : 'text-xl mb-4'}`}>{data.feature2Title}</h3>
        <p className={`text-zinc-500 leading-relaxed ${isMobile ? 'text-base' : 'text-lg'}`}>{data.feature2Desc}</p>
      </div>
    </div>
  </div>
);

const TestimonialsBlock = ({ data, isMobile, isPreviewMode }) => (
  <div className={`bg-white transition-all ${isPreviewMode ? '' : 'pointer-events-none'} ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}>
    <h2 className={`font-bold text-center text-zinc-900 mb-12 transition-all ${isMobile ? 'text-3xl' : 'text-4xl mb-16'}`}>
      {data.title}
    </h2>
    <div className={`grid gap-6 max-w-5xl mx-auto transition-all ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {[1, 2].map((num) => (
        <div key={num} className={`bg-zinc-50 p-8 rounded-3xl border border-zinc-100 relative hover:shadow-md transition-shadow`}>
          <Quote className="w-8 h-8 text-indigo-200 mb-4" />
          <p className={`text-zinc-600 mb-8 leading-relaxed italic ${isMobile ? 'text-base' : 'text-lg'}`}>
            &quot;{data[`quote${num}`]}&quot;
          </p>
          <div className="flex items-center gap-4 mt-auto">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl shrink-0">
              {data[`author${num}`]?.charAt(0) || '?'}
            </div>
            <div>
              <h4 className="font-semibold text-zinc-900">{data[`author${num}`]}</h4>
              <p className="text-sm text-zinc-500">{data[`role${num}`]}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const CtaBlock = ({ data, isMobile, isPreviewMode }) => (
  <div className={`bg-indigo-600 text-center transition-all ${isPreviewMode ? '' : 'pointer-events-none'} ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}>
    <div className="max-w-3xl mx-auto">
      <h2 className={`font-bold text-white mb-8 leading-tight transition-all ${isMobile ? 'text-3xl' : 'text-4xl md:text-5xl'}`}>
        {data.title}
      </h2>
      <button className={`bg-white text-indigo-600 rounded-full font-bold shadow-xl shadow-black/10 transition-transform ${isMobile ? 'w-full py-4 text-base' : 'px-10 py-4 text-lg hover:scale-105'}`}>
        {data.buttonText}
      </button>
    </div>
  </div>
);

const FooterBlock = ({ data, isMobile, isPreviewMode }) => (
  <footer className={`bg-zinc-950 text-zinc-400 transition-all ${isPreviewMode ? '' : 'pointer-events-none'} ${isMobile ? 'py-12 px-6' : 'py-16 px-8'}`}>
    <div className={`max-w-5xl mx-auto flex transition-all ${isMobile ? 'flex-col gap-8 text-center' : 'flex-row justify-between items-center'} mb-12`}>
      <div className={isMobile ? 'w-full' : 'max-w-sm'}>
        <div className="flex items-center justify-center md:justify-start gap-2 mb-4">
          <div className="w-6 h-6 rounded bg-indigo-500 flex items-center justify-center text-white">
            <Sparkles className="w-3 h-3" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-wide">{data.brandName}</h3>
        </div>
        <p className="text-zinc-500 leading-relaxed text-sm">{data.description}</p>
      </div>
      <div className={`flex gap-6 ${isMobile ? 'justify-center w-full flex-wrap' : ''}`}>
        <span className="hover:text-white cursor-pointer transition-colors text-sm font-medium">{data.link1Label}</span>
        <span className="hover:text-white cursor-pointer transition-colors text-sm font-medium">{data.link2Label}</span>
        <span className="hover:text-white cursor-pointer transition-colors text-sm font-medium">{data.link3Label}</span>
      </div>
    </div>
    <div className="max-w-5xl mx-auto pt-8 border-t border-zinc-800/50 text-sm text-center text-zinc-600">
      {data.copyright}
    </div>
  </footer>
);

// ==========================================
// 2. REGISTRO DE BLOQUES Y UTILIDADES
// ==========================================

const BLOCK_REGISTRY = {
  hero: {
    type: 'hero', label: 'Hero Section', icon: Layout,
    initialData: { title: 'Tu Nueva Sección', subtitle: 'Añade una descripción cautivadora aquí.', buttonText: 'Acción Principal' },
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'buttonText', label: 'Texto del Botón', type: 'text' }
    ],
    component: HeroBlock
  },
  features: {
    type: 'features', label: 'Features Grid', icon: BoxSelect,
    initialData: { title: 'Descubre las ventajas', feature1Title: 'Característica 1', feature1Desc: 'Descripción breve de esta característica increíble.', feature2Title: 'Característica 2', feature2Desc: 'Descripción breve de esta característica increíble.' },
    fields: [
      { key: 'title', label: 'Título de Sección', type: 'textarea' },
      { key: 'feature1Title', label: 'Título C1', type: 'text' },
      { key: 'feature1Desc', label: 'Descripción C1', type: 'textarea' },
      { key: 'feature2Title', label: 'Título C2', type: 'text' },
      { key: 'feature2Desc', label: 'Descripción C2', type: 'textarea' }
    ],
    component: FeaturesBlock
  },
  testimonials: {
    type: 'testimonials', label: 'Testimonials', icon: MessageSquare,
    initialData: {
      title: 'Lo que dicen de nosotros', quote1: 'Este producto ha cambiado por completo la forma en que trabajamos. Simplemente brillante.', author1: 'María García', role1: 'Product Manager en TechCorp', quote2: 'La mejor decisión que tomamos este año. El soporte es increíble y los resultados inmediatos.', author2: 'Carlos Ruiz', role2: 'CTO en Startup.io'
    },
    fields: [
      { key: 'title', label: 'Título de Sección', type: 'textarea' },
      { key: 'quote1', label: 'Testimonio 1', type: 'textarea' },
      { key: 'author1', label: 'Autor 1', type: 'text' },
      { key: 'role1', label: 'Rol 1', type: 'text' },
      { key: 'quote2', label: 'Testimonio 2', type: 'textarea' },
      { key: 'author2', label: 'Autor 2', type: 'text' },
      { key: 'role2', label: 'Rol 2', type: 'text' }
    ],
    component: TestimonialsBlock
  },
  cta: {
    type: 'cta', label: 'Call to Action', icon: MousePointer2,
    initialData: { title: 'Comienza tu viaje', buttonText: 'Suscribirse' },
    fields: [
      { key: 'title', label: 'Título Principal', type: 'textarea' },
      { key: 'buttonText', label: 'Texto del Botón', type: 'text' }
    ],
    component: CtaBlock
  },
  footer: {
    type: 'footer', label: 'Footer Simple', icon: PanelBottom,
    initialData: {
      brandName: 'Acme Corp', description: 'Construyendo el futuro de la web, un bloque a la vez. Únete a nuestra revolución digital.', copyright: '© 2026 Acme Corporation. Todos los derechos reservados.', link1Label: 'Producto', link2Label: 'Precios', link3Label: 'Contacto'
    },
    fields: [
      { key: 'brandName', label: 'Nombre de Marca', type: 'text' },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      { key: 'link1Label', label: 'Enlace 1', type: 'text' },
      { key: 'link2Label', label: 'Enlace 2', type: 'text' },
      { key: 'link3Label', label: 'Enlace 3', type: 'text' },
      { key: 'copyright', label: 'Copyright', type: 'textarea' }
    ],
    component: FooterBlock
  }
};

const getAvailableBlocks = () => Object.values(BLOCK_REGISTRY).map(b => ({ type: b.type, label: b.label, icon: b.icon }));

const getDefaultPage = () => ({
  id: `page_${Date.now()}`,
  name: "Acme Landing",
  status: "draft",
  slug: "acme-landing",
  blocks: [
    { id: `blk_${Date.now()}_1`, type: 'hero', name: 'Hero Section', data: { ...BLOCK_REGISTRY.hero.initialData, title: 'Crea landing pages increíbles.', subtitle: 'Un editor visual de próxima generación diseñado para equipos ambiciosos.', buttonText: 'Comenzar gratis' } },
    { id: `blk_${Date.now()}_2`, type: 'features', name: 'Features Grid', data: { ...BLOCK_REGISTRY.features.initialData } },
    { id: `blk_${Date.now()}_3`, type: 'testimonials', name: 'Testimonials', data: { ...BLOCK_REGISTRY.testimonials.initialData } },
    { id: `blk_${Date.now()}_4`, type: 'cta', name: 'Call to Action', data: { ...BLOCK_REGISTRY.cta.initialData } },
    { id: `blk_${Date.now()}_5`, type: 'footer', name: 'Footer Simple', data: { ...BLOCK_REGISTRY.footer.initialData } }
  ]
});

const generateId = (prefix = 'blk') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const screenToWorld = (clientX, clientY, viewportRect, viewportState) => {
  return {
    x: (clientX - viewportRect.left - viewportState.x) / viewportState.zoom,
    y: (clientY - viewportRect.top - viewportState.y) / viewportState.zoom
  };
};

// ==========================================
// 3. CUSTOM HOOKS (AutoScroll Mejorado)
// ==========================================

function useAutoScroll(setViewportState) {
  const autoScrollState = useRef({ direction: 0, speed: 0, container: null, isCanvas: false });
  const rafRef = useRef(null);

  const scrollLoop = () => {
    const state = autoScrollState.current;
    if (state.direction !== 0 && state.container) {
      if (state.isCanvas && setViewportState) {
        setViewportState(prev => ({ ...prev, y: prev.y - state.direction * state.speed }));
      } else {
        state.container.scrollTop += state.direction * state.speed;
      }
      rafRef.current = requestAnimationFrame(scrollLoop);
    } else {
      rafRef.current = null;
    }
  };

  const handleAutoScroll = (e, containerRef, isCanvas = false) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const scrollThreshold = 100;
    const rect = container.getBoundingClientRect();
    
    // Si las coordenadas son 0 (Bug ocasional de Chrome durante el drag), evitamos saltos raros.
    if (e.clientX === 0 && e.clientY === 0) return;

    const distanceToTop = e.clientY - rect.top;
    const distanceToBottom = rect.bottom - e.clientY;

    let newDir = 0;
    let speed = 0;
    const maxSpeed = 30; // Velocidad máxima del scroll por proximidad

    // Calculamos una velocidad proporcional: más rápido cuanto más cerca del borde
    if (distanceToTop >= 0 && distanceToTop < scrollThreshold) {
      newDir = -1;
      speed = maxSpeed * (1 - distanceToTop / scrollThreshold);
    } else if (distanceToBottom >= 0 && distanceToBottom < scrollThreshold) {
      newDir = 1;
      speed = maxSpeed * (1 - distanceToBottom / scrollThreshold);
    }

    if (newDir !== 0) {
      autoScrollState.current = { direction: newDir, speed: Math.max(speed, 5), container, isCanvas };
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(scrollLoop);
      }
    } else {
      stopAutoScroll();
    }
  };

  const stopAutoScroll = () => {
    autoScrollState.current.direction = 0;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  useEffect(() => {
    const handleMouseUp = () => stopAutoScroll();
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  return { handleAutoScroll, stopAutoScroll };
}

// ==========================================
// 4. COMPONENTES UI REUTILIZABLES
// ==========================================

const TopBar = ({ page, deviceMode, setDeviceMode, isSaved, handleSave, isPreviewMode, setIsPreviewMode, handleResetDemo }) => (
  <header className="h-14 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between px-4 shrink-0 z-30">
    <div className="flex items-center gap-4 w-1/3">
      <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-zinc-100 tracking-wide">{page.name}</span>
          <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-widest">{page.status}</span>
          <button onClick={handleResetDemo} className="ml-2 text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-800/50 transition-colors" title="Resetear a Demo Inicial">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <div className="flex items-center bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/80 p-1 rounded-full w-auto justify-center shadow-inner">
      <button onClick={() => setDeviceMode('desktop')} className={`p-1.5 rounded-full transition-all duration-200 ${deviceMode === 'desktop' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}><Monitor className="w-4 h-4" /></button>
      <button onClick={() => setDeviceMode('tablet')} className={`p-1.5 rounded-full transition-all duration-200 ${deviceMode === 'tablet' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}><Tablet className="w-4 h-4" /></button>
      <button onClick={() => setDeviceMode('mobile')} className={`p-1.5 rounded-full transition-all duration-200 ${deviceMode === 'mobile' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}><Smartphone className="w-4 h-4" /></button>
    </div>

    <div className="flex items-center justify-end gap-3 w-1/3">
      <button onClick={() => setIsPreviewMode(!isPreviewMode)} className={`text-sm font-medium flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${isPreviewMode ? 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'}`}>
        {isPreviewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {isPreviewMode ? 'Exit Preview' : 'Preview'}
      </button>
      <button onClick={handleSave} className="text-sm font-medium text-zinc-400 hover:text-zinc-100 flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-zinc-800/50 transition-colors">
        {isSaved ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />} {isSaved ? 'Guardado' : 'Guardar'}
      </button>
      <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-1.5 rounded-md shadow-lg shadow-indigo-600/20 transition-all active:scale-95">Publicar</button>
    </div>
  </header>
);

const LeftSidebar = ({ 
  leftTab, setLeftTab, page, availableBlocks, dragOverIndex, selectedBlockId, sidebarScrollRef,
  handleAddBlock, onDragStartGlobal, onDragEndGlobal, setDragOverIndex, handleLayerDrop, handleSelectBlock,
  handleAutoScroll, stopAutoScroll
}) => (
  <aside className="w-64 bg-zinc-950 border-r border-zinc-800/80 flex flex-col shrink-0 z-20">
    <div className="p-4 border-b border-zinc-800/80 shrink-0">
      <div className="flex bg-zinc-900/80 p-1 rounded-lg border border-zinc-800/50 shadow-inner">
        <button onClick={() => setLeftTab('components')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${leftTab === 'components' ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 border border-transparent'}`}><BoxSelect className="w-3.5 h-3.5" /> Componentes</button>
        <button onClick={() => setLeftTab('layers')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${leftTab === 'layers' ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 border border-transparent'}`}><Layers className="w-3.5 h-3.5" /> Capas</button>
      </div>
    </div>

    <div ref={sidebarScrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-5" onDragOver={(e) => { e.preventDefault(); handleAutoScroll(e, sidebarScrollRef); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) stopAutoScroll(); }}>
      {leftTab === 'components' && (
        <div className="animate-in fade-in duration-200">
          <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">Arrastra los componentes al lienzo para construir tu landing page.</p>
          <div className="grid gap-2.5">
            {availableBlocks.map((b, idx) => {
              const IconComponent = b.icon;
              return (
                <button key={idx} draggable onDragStart={(e) => { onDragStartGlobal(); e.dataTransfer.setData('action', 'add'); e.dataTransfer.setData('type', b.type); e.dataTransfer.setData('label', b.label); }} onDragEnd={() => { onDragEndGlobal(); stopAutoScroll(); }} onClick={() => handleAddBlock(b.type, b.label)} className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800/50 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all group text-left cursor-grab active:cursor-grabbing">
                  <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors"><IconComponent className="w-4 h-4" /></div>
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100">{b.label}</span>
                  <GripVertical className="w-4 h-4 ml-auto text-zinc-600 group-hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {leftTab === 'layers' && (
        <div className="space-y-0.5 animate-in fade-in duration-200">
          {page.blocks.map((block, index) => {
            const isDragOver = dragOverIndex === index;
            const BlockIcon = BLOCK_REGISTRY[block.type]?.icon || Layout;
            return (
              <div 
                key={block.id} 
                draggable 
                onDragStart={(e) => {
                  onDragStartGlobal(index);
                  e.dataTransfer.setData('action', 'reorder');
                  setTimeout(() => { e.target.style.opacity = '0.3'; }, 0);
                }} 
                onDragEnd={(e) => {
                  onDragEndGlobal();
                  e.target.style.opacity = '1';
                  stopAutoScroll();
                }} 
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }} 
                onDragLeave={() => setDragOverIndex(null)} 
                onDrop={(e) => handleLayerDrop(e, index)} 
                onClick={() => handleSelectBlock(block.id)} 
                className={`flex items-center gap-2.5 p-2 rounded-md cursor-grab active:cursor-grabbing text-sm border transition-all ${selectedBlockId === block.id ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'} ${isDragOver ? 'border-t-indigo-500 bg-indigo-500/5' : ''}`}>
                <GripVertical className={`w-3.5 h-3.5 ${selectedBlockId === block.id ? 'text-indigo-400/70' : 'text-zinc-600'}`} />
                <BlockIcon className="w-3.5 h-3.5 opacity-70" />
                <span className="truncate flex-1 select-none font-medium text-[13px]">{block.name}</span>
              </div>
            );
          })}
          {page.blocks.length > 0 && <div className={`h-4 rounded-md transition-colors border-2 border-dashed mt-2 ${dragOverIndex === page.blocks.length ? 'border-indigo-500 bg-indigo-500/10' : 'border-transparent'}`} onDragOver={(e) => { e.preventDefault(); setDragOverIndex(page.blocks.length); }} onDragLeave={() => setDragOverIndex(null)} onDrop={(e) => handleLayerDrop(e, page.blocks.length)}></div>}
        </div>
      )}
    </div>
  </aside>
);

const BlockWrapper = ({ 
  block, index, selectedBlockId, canvasDropIndex, blocksLength, isPreviewMode, interactionState,
  handleBlockDragOver, handleCanvasDrop, onDragStartGlobal, onDragEndGlobal, stopAutoScroll, 
  handleSelectBlock, handleRemoveBlock, handleDuplicateBlock, children 
}) => {
  if (isPreviewMode) return <div id={`block-wrapper-${block.id}`} className="relative w-full">{children}</div>;

  const isSelected = selectedBlockId === block.id;
  const wrapperClasses = `
    group relative outline outline-2 outline-offset-[3px] transition-all duration-200 rounded-sm
    ${isSelected ? 'outline-indigo-500 z-10' : 'outline-transparent hover:outline-indigo-400/40 hover:z-0'}
    ${interactionState.isSpacePressed ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
  `;

  return (
    <div id={`block-wrapper-${block.id}`} className="relative w-full" onDragOver={(e) => handleBlockDragOver(e, index)} onDrop={handleCanvasDrop}>
      {canvasDropIndex === index && <div className="absolute top-0 left-0 right-0 h-[2px] bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)] z-50"><div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,1)]"></div></div>}
      {canvasDropIndex === blocksLength && index === blocksLength - 1 && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)] z-50"><div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,1)]"></div></div>}

      <div 
        className={wrapperClasses}
        draggable={!interactionState.isSpacePressed}
        onDragStart={(e) => {
          if (interactionState.isSpacePressed) { e.preventDefault(); return; }
          e.dataTransfer.setData('action', 'reorder');
          onDragStartGlobal(index);
          
          const ghost = document.getElementById('drag-ghost');
          const ghostText = document.getElementById('drag-ghost-text');
          if (ghost && ghostText) {
            ghostText.textContent = `Moviendo ${block.name}`;
            e.dataTransfer.setDragImage(ghost, 20, 20);
          }
        }}
        onDragEnd={() => { onDragEndGlobal(); stopAutoScroll(); }}
        onClick={(e) => { e.stopPropagation(); if (!interactionState.isSpacePressed) handleSelectBlock(block.id); }}
      >
        <div className={`absolute left-1/2 -translate-x-1/2 -top-3.5 h-7 bg-indigo-600 text-white text-[11px] font-medium rounded-full shadow-lg z-30 flex items-center transition-all duration-200 ${isSelected && !interactionState.isSpacePressed ? 'opacity-100 scale-100' : 'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100'}`}>
          <div className="px-3 h-full flex items-center gap-1.5 hover:bg-indigo-700 rounded-l-full transition-colors cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3.5 h-3.5 opacity-60" />
            <span className="tracking-wide">{block.name}</span>
          </div>
          {isSelected && (
            <div className="h-full py-1.5 flex items-center">
              <div className="w-[1px] h-full bg-indigo-500/50"></div>
              <button onClick={(e) => { e.stopPropagation(); handleDuplicateBlock(block.id); }} className="px-2.5 h-full hover:text-indigo-200 transition-colors flex items-center justify-center cursor-pointer border-r border-indigo-500/50" title="Duplicar bloque"><Copy className="w-3.5 h-3.5" /></button>
              <button onClick={(e) => { e.stopPropagation(); handleRemoveBlock(block.id); }} className="px-2.5 h-full hover:text-red-300 transition-colors flex items-center justify-center cursor-pointer rounded-r-full" title="Eliminar bloque" onMouseDown={(e) => e.stopPropagation()}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
        <div className={isSelected ? 'opacity-100' : 'opacity-95 group-hover:opacity-100 transition-opacity'}>{children}</div>
      </div>
    </div>
  );
};

const Inspector = ({ selectedBlock, inspectorSections, toggleInspectorSection, handleUpdateBlockData, handleRemoveBlock, handleDuplicateBlock }) => {
  if (!selectedBlock) {
    return (
      <aside className="w-80 bg-zinc-950 border-l border-zinc-800/80 flex flex-col shrink-0 z-20">
        <div className="h-14 flex items-center px-5 border-b border-zinc-800/80 shrink-0"><h2 className="text-[13px] font-semibold text-zinc-100 flex items-center gap-2 tracking-wide"><Settings className="w-4 h-4 text-zinc-500" /> Inspector</h2></div>
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8 text-center space-y-4"><div className="w-16 h-16 rounded-full bg-zinc-900/50 flex items-center justify-center border border-zinc-800/50"><Settings className="w-6 h-6 text-zinc-600" /></div><div><p className="font-medium text-zinc-300 mb-1">Nada seleccionado</p><p className="text-[12px] leading-relaxed">Haz clic en un componente del lienzo para inspeccionar sus propiedades.</p></div></div>
      </aside>
    );
  }

  const blockConfig = BLOCK_REGISTRY[selectedBlock.type];
  const blockFields = blockConfig ? blockConfig.fields : [];
  const BlockIcon = blockConfig?.icon || Layout;

  return (
    <aside className="w-80 bg-zinc-950 border-l border-zinc-800/80 flex flex-col shrink-0 z-20">
      <div className="h-14 flex items-center px-5 border-b border-zinc-800/80 shrink-0"><h2 className="text-[13px] font-semibold text-zinc-100 flex items-center gap-2 tracking-wide"><Settings className="w-4 h-4 text-zinc-500" /> Inspector</h2></div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="pb-10">
          <div className="p-5 border-b border-zinc-800/50 bg-zinc-900/20"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-md bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20"><BlockIcon className="w-4 h-4 text-indigo-400" /></div><div><span className="font-medium text-[13px] text-zinc-100 block">{selectedBlock.name}</span><span className="text-[10px] text-zinc-500 uppercase tracking-widest">{selectedBlock.type}</span></div></div></div>
          {!blockConfig ? (
             <div className="p-8 text-center text-zinc-500 text-[12px]"><div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">La configuración y esquema de este bloque no se encuentran disponibles en el registro.</div></div>
          ) : (
            <>
              <div className="border-b border-zinc-800/50">
                <button onClick={() => toggleInspectorSection('content')} className="w-full flex items-center justify-between p-5 hover:bg-zinc-900/30 transition-colors"><div className="flex items-center gap-2 text-zinc-300"><Type className="w-4 h-4 text-zinc-500" /><span className="text-[12px] font-medium tracking-wide">Contenido</span></div><ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${inspectorSections.content ? '' : '-rotate-90'}`} /></button>
                {inspectorSections.content && (
                  <div className="px-5 pb-6 space-y-6">
                    {blockFields.map((field) => (
                      <div key={field.key} className="space-y-2.5">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex justify-between">{field.label}</label>
                        {field.type === 'textarea' ? (
                          <textarea value={selectedBlock.data[field.key] || ''} onChange={(e) => handleUpdateBlockData(selectedBlock.id, field.key, e.target.value)} className="w-full text-[13px] p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none h-24 shadow-inner" />
                        ) : (
                          <input type="text" value={selectedBlock.data[field.key] || ''} onChange={(e) => handleUpdateBlockData(selectedBlock.id, field.key, e.target.value)} className="w-full text-[13px] px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-inner" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-b border-zinc-800/50">
                <button onClick={() => toggleInspectorSection('styles')} className="w-full flex items-center justify-between p-5 hover:bg-zinc-900/30 transition-colors"><div className="flex items-center gap-2 text-zinc-300"><Palette className="w-4 h-4 text-zinc-500" /><span className="text-[12px] font-medium tracking-wide flex items-center gap-2">Estilos<span className="bg-indigo-500/20 text-indigo-300 text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider">Demo</span></span></div><ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${inspectorSections.styles ? '' : '-rotate-90'}`} /></button>
                {inspectorSections.styles && (
                  <div className="px-5 pb-6 space-y-6 opacity-60 pointer-events-none">
                    <div className="space-y-2.5"><label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Alineación</label><div className="flex bg-zinc-900/80 p-1 rounded-lg border border-zinc-800 shadow-inner"><button className="flex-1 flex items-center justify-center py-1.5 rounded-md bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50"><AlignLeft className="w-4 h-4" /></button><button className="flex-1 flex items-center justify-center py-1.5 rounded-md text-zinc-500"><AlignCenter className="w-4 h-4" /></button><button className="flex-1 flex items-center justify-center py-1.5 rounded-md text-zinc-500"><AlignRight className="w-4 h-4" /></button></div></div>
                    <div className="space-y-2.5"><label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Colores</label><div className="space-y-2"><div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50 cursor-pointer"><div className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-white border border-zinc-300 shadow-sm"></div><span className="text-[12px] font-medium text-zinc-300">Fondo</span></div><span className="text-[11px] text-zinc-500 font-mono">#FFFFFF</span></div><div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50 cursor-pointer"><div className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 shadow-sm"></div><span className="text-[12px] font-medium text-zinc-300">Texto</span></div><span className="text-[11px] text-zinc-500 font-mono">#09090B</span></div></div></div>
                  </div>
                )}
              </div>
            </>
          )}
          <div className="p-5 mt-2 flex gap-2">
            <button onClick={() => handleDuplicateBlock(selectedBlock.id)} className="flex-1 py-2.5 px-2 bg-zinc-900/50 border border-zinc-800/50 text-zinc-300 rounded-lg text-[11px] font-medium hover:bg-zinc-800 hover:text-zinc-100 transition-all flex items-center justify-center gap-1.5"><Copy className="w-3.5 h-3.5" /> Duplicar</button>
            <button onClick={() => handleRemoveBlock(selectedBlock.id)} className="flex-1 py-2.5 px-2 bg-transparent border border-red-900/30 text-red-400 rounded-lg text-[11px] font-medium hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300 transition-all flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Eliminar</button>
          </div>
        </div>
      </div>
    </aside>
  );
};

function LockIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

// ==========================================
// 5. APP (ORQUESTADOR PRINCIPAL)
// ==========================================

export default function App() {
  const [deviceMode, setDeviceMode] = useState('desktop');
  const [selectedBlockId, setSelectedBlockId] = useState('blk_1');
  const [isSaved, setIsSaved] = useState(false);
  const [leftTab, setLeftTab] = useState('components'); 
  const [inspectorSections, setInspectorSections] = useState({ content: true, styles: true });
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // --- MOTOR DE CANVAS (PAN & ZOOM) ---
  const [viewportState, setViewportState] = useState({ zoom: 1, x: 0, y: 0 });
  const [interactionState, setInteractionState] = useState({ isPanning: false, isSpacePressed: false, isMiddleClickPanning: false });
  const lastMousePos = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  // --- HISTORIAL (UNDO/REDO) Y CLIPBOARD ---
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const clipboardRef = useRef(null);

  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null); 
  const [canvasDropIndex, setCanvasDropIndex] = useState(null); 

  // Refs
  const viewportRef = useRef(null);
  const browserFrameRef = useRef(null);
  const sidebarScrollRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  
  const { handleAutoScroll, stopAutoScroll } = useAutoScroll(setViewportState);

  const getCanvasWidthNumber = useCallback(() => {
    if (deviceMode === 'mobile') return 375;
    if (deviceMode === 'tablet') return 768;
    return 1024; 
  }, [deviceMode]);

  const handleCenterCanvas = useCallback(() => {
    if (!viewportRef.current) return;
    const viewport = viewportRef.current.getBoundingClientRect();
    const frameWidth = browserFrameRef.current ? browserFrameRef.current.offsetWidth : getCanvasWidthNumber();
    const newX = (viewport.width - frameWidth) / 2;
    const newY = 60; 
    setViewportState({ zoom: 1, x: newX, y: newY });
  }, [getCanvasWidthNumber]);

  useEffect(() => { handleCenterCanvas(); }, [deviceMode, handleCenterCanvas]);

  // Keyboard Listeners para Pan (Space)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setInteractionState(prev => ({ ...prev, isSpacePressed: true }));
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') setInteractionState({ isSpacePressed: false, isPanning: false, isMiddleClickPanning: false });
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Zoom y Pan con Rueda del Ratón (Global con capture: true)
  useEffect(() => {
    const handleWheel = (e) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const isOverViewport = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

      // El evento wheel durante el drag no tiene coordenadas válidas en algunos motores, 
      // pero isDraggingRef nos dice si estamos dentro del flujo.
      if (isOverViewport || isDraggingRef.current) {
        e.preventDefault(); 
        if (e.ctrlKey || e.metaKey) {
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          setViewportState(prev => {
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newZoom = Math.min(Math.max(Math.round((prev.zoom + delta) * 10) / 10, 0.5), 2);
            if (newZoom === prev.zoom) return prev;
            const scaleRatio = newZoom / prev.zoom;
            const newX = cx - (cx - prev.x) * scaleRatio;
            const newY = cy - (cy - prev.y) * scaleRatio;
            return { zoom: newZoom, x: newX, y: newY };
          });
        } else {
          setViewportState(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
        }
      }
    };
    
    // ATENCIÓN: El uso de 'capture: true' intercepta el evento ANTES de que el 
    // motor HTML5 Drag & Drop lo elimine, permitiendo el scroll incluso arrastrando bloques.
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);

  const handlePanStart = (e) => {
    if (!interactionState.isSpacePressed && e.button !== 1) return;
    if (e.button === 1) e.preventDefault(); 
    setInteractionState(prev => ({ ...prev, isPanning: true, isMiddleClickPanning: e.button === 1 }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePanMove = (e) => {
    if (!interactionState.isPanning) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setViewportState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePanEnd = () => {
    if (interactionState.isPanning) setInteractionState(prev => ({ ...prev, isPanning: false, isMiddleClickPanning: false }));
  };

  // State Management
  const [page, setPage] = useState(() => {
    try {
      const savedPage = localStorage.getItem('landing_builder_page');
      if (savedPage) {
        const parsed = JSON.parse(savedPage);
        if (parsed && parsed.blocks) return parsed;
      }
    } catch {}
    return getDefaultPage();
  });

  useEffect(() => { localStorage.setItem('landing_builder_page', JSON.stringify(page)); }, [page]);
  useEffect(() => { return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }; }, []);

  const availableBlocks = getAvailableBlocks();
  const selectedBlock = page.blocks.find(b => b.id === selectedBlockId);

  // --- ACTIONS WITH HISTORY ---
  const setPageWithHistory = useCallback((updater) => {
    setPage(prev => {
      const newPage = typeof updater === 'function' ? updater(prev) : updater;
      if (newPage === prev) return prev;
      setPast(p => [...p, prev].slice(-50)); 
      setFuture([]);
      return newPage;
    });
    setIsSaved(false);
  }, []);

  const handleSelectBlock = useCallback((id) => {
    if(!isPreviewMode && !interactionState.isSpacePressed && !interactionState.isMiddleClickPanning) setSelectedBlockId(id);
  }, [isPreviewMode, interactionState]);
  
  const handleResetDemo = useCallback(() => {
    if (window.confirm("¿Restaurar la página a su estado por defecto?")) {
      localStorage.removeItem('landing_builder_page');
      setPageWithHistory(getDefaultPage());
      setSelectedBlockId(null);
      setPast([]);
      setFuture([]);
      handleCenterCanvas();
    }
  }, [setPageWithHistory, handleCenterCanvas]);

  const handleUpdateBlockData = useCallback((id, key, value) => {
    setPageWithHistory(prev => ({
      ...prev,
      blocks: prev.blocks.map(block => block.id === id ? { ...block, data: { ...block.data, [key]: value } } : block)
    }));
  }, [setPageWithHistory]);

  const handleAddBlock = useCallback((type, label, index = null) => {
    const config = BLOCK_REGISTRY[type];
    const newId = generateId();
    const newBlock = { id: newId, type, name: label, data: { ...config.initialData } };
    setPageWithHistory(prev => {
      const newBlocks = [...prev.blocks];
      if (index !== null) newBlocks.splice(index, 0, newBlock);
      else newBlocks.push(newBlock);
      return { ...prev, blocks: newBlocks };
    });
    setSelectedBlockId(newId);
  }, [setPageWithHistory]);

  const handleRemoveBlock = useCallback((id) => {
    setPageWithHistory(prev => {
      const removedIndex = prev.blocks.findIndex(b => b.id === id);
      if (removedIndex === -1) return prev;
      const remainingBlocks = prev.blocks.filter(b => b.id !== id);
      
      if (selectedBlockId === id) {
        if (remainingBlocks.length > 0) {
           setSelectedBlockId((remainingBlocks[removedIndex] || remainingBlocks[removedIndex - 1]).id);
        } else {
           setSelectedBlockId(null);
        }
      }
      return { ...prev, blocks: remainingBlocks };
    });
  }, [selectedBlockId, setPageWithHistory]);

  const handleDuplicateBlock = useCallback((id) => {
    const newId = generateId();
    setPageWithHistory(prev => {
      const index = prev.blocks.findIndex(b => b.id === id);
      if (index === -1) return prev;
      const newBlock = JSON.parse(JSON.stringify(prev.blocks[index]));
      newBlock.id = newId;
      const newBlocks = [...prev.blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      return { ...prev, blocks: newBlocks };
    });
    setSelectedBlockId(newId);
  }, [setPageWithHistory]);

  const handleSave = useCallback(() => {
    setIsSaved(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => setIsSaved(false), 2000);
  }, []);

  const performDrop = useCallback((action, type, label, sourceIndex, targetIndex) => {
    if (action === 'reorder' && sourceIndex !== null) {
      if (sourceIndex === targetIndex) return;
      setPageWithHistory(prev => {
        const newBlocks = [...prev.blocks];
        const [draggedItem] = newBlocks.splice(sourceIndex, 1);
        let finalIndex = targetIndex;
        if (sourceIndex < targetIndex) finalIndex--; 
        newBlocks.splice(finalIndex, 0, draggedItem);
        return { ...prev, blocks: newBlocks };
      });
    } else if (action === 'add') {
      handleAddBlock(type, label, targetIndex);
    }
  }, [setPageWithHistory, handleAddBlock]);

  // Drag & Drop Handlers Globales
  const onDragStartGlobal = useCallback((index = null) => { 
    isDraggingRef.current = true; 
    if (index !== null) setDraggedIndex(index);
  }, []);

  const onDragEndGlobal = useCallback(() => { 
    isDraggingRef.current = false; 
    setDraggedIndex(null); 
    setCanvasDropIndex(null); 
    setDragOverIndex(null);
  }, []);

  const handleLayerDrop = (e, dropIndex) => { 
    e.preventDefault(); 
    performDrop(e.dataTransfer.getData('action'), e.dataTransfer.getData('type'), e.dataTransfer.getData('label'), draggedIndex, dropIndex); 
    onDragEndGlobal(); 
    stopAutoScroll(); 
  };
  
  const handleBlockDragOver = (e, index) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    const rect = e.currentTarget.getBoundingClientRect(); 
    if (e.clientY < (rect.top + rect.height / 2)) setCanvasDropIndex(index); 
    else setCanvasDropIndex(index + 1); 
  };
  
  const handleCanvasDrop = (e) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    const targetIndex = canvasDropIndex !== null ? canvasDropIndex : page.blocks.length; 
    performDrop(e.dataTransfer.getData('action'), e.dataTransfer.getData('type'), e.dataTransfer.getData('label'), draggedIndex, targetIndex); 
    onDragEndGlobal(); 
    stopAutoScroll(); 
  };

  // --- KEYBOARD SHORTCUTS INTERCEPTOR ---
  useEffect(() => {
    if (isPreviewMode) return;
    const handleGlobalKeyDown = (e) => {
      const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const isShift = e.shiftKey;

      if (cmdOrCtrl && !isTyping) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (isShift) {
            setFuture(prevFuture => {
              if (prevFuture.length === 0) return prevFuture;
              const nextState = prevFuture[0];
              setPage(curr => { setPast(p => [...p, curr]); return nextState; });
              return prevFuture.slice(1);
            });
          } else {
            setPast(prevPast => {
              if (prevPast.length === 0) return prevPast;
              const prevState = prevPast[prevPast.length - 1];
              setPage(curr => { setFuture(f => [curr, ...f]); return prevState; });
              return prevPast.slice(0, -1);
            });
          }
          return;
        }
        if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          setFuture(prevFuture => {
            if (prevFuture.length === 0) return prevFuture;
            const nextState = prevFuture[0];
            setPage(curr => { setPast(p => [...p, curr]); return nextState; });
            return prevFuture.slice(1);
          });
          return;
        }
        if (e.key.toLowerCase() === 'c') {
          e.preventDefault();
          if (selectedBlockId) {
            const blockToCopy = page.blocks.find(b => b.id === selectedBlockId);
            if (blockToCopy) clipboardRef.current = JSON.parse(JSON.stringify(blockToCopy));
          }
          return;
        }
        if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          if (!clipboardRef.current) return;
          const newId = generateId();
          setPageWithHistory(prev => {
            const newBlock = JSON.parse(JSON.stringify(clipboardRef.current));
            newBlock.id = newId;
            const newBlocks = [...prev.blocks];
            if (selectedBlockId) {
              const index = newBlocks.findIndex(b => b.id === selectedBlockId);
              if (index !== -1) newBlocks.splice(index + 1, 0, newBlock);
              else newBlocks.push(newBlock);
            } else {
              newBlocks.push(newBlock);
            }
            return { ...prev, blocks: newBlocks };
          });
          setSelectedBlockId(newId);
          return;
        }
      }
      
      if (!isTyping && (e.key === 'Delete' || e.key === 'Backspace')) {
        const currSelId = selectedBlockId;
        if (currSelId) {
          e.preventDefault();
          handleRemoveBlock(currSelId);
        }
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isPreviewMode, handleRemoveBlock, page, selectedBlockId, setPageWithHistory]);

  const getCanvasWidthClass = () => {
    switch(deviceMode) {
      case 'mobile': return 'w-[375px] min-w-[375px]';
      case 'tablet': return 'w-[768px] min-w-[768px]';
      default: return 'w-full min-w-[1024px] max-w-[1200px]'; 
    }
  };

  let cursorClass = '';
  if (interactionState.isPanning) cursorClass = 'cursor-grabbing';
  else if (interactionState.isSpacePressed) cursorClass = 'cursor-grab';

  return (
    <div 
      className="flex flex-col h-screen bg-zinc-950 font-sans text-zinc-300 overflow-hidden outline-none" 
      onDragOver={(e) => e.preventDefault()} 
      onDrop={stopAutoScroll}
      tabIndex={0} 
    >
      
      <TopBar 
        page={page} deviceMode={deviceMode} setDeviceMode={setDeviceMode} 
        isSaved={isSaved} handleSave={handleSave} 
        isPreviewMode={isPreviewMode} setIsPreviewMode={setIsPreviewMode}
        handleResetDemo={handleResetDemo}
      />

      <main className="flex flex-1 overflow-hidden relative">
        {!isPreviewMode && (
          <LeftSidebar 
            leftTab={leftTab} setLeftTab={setLeftTab} 
            page={page} availableBlocks={availableBlocks}
            dragOverIndex={dragOverIndex} selectedBlockId={selectedBlockId} sidebarScrollRef={sidebarScrollRef}
            handleAddBlock={handleAddBlock} handleLayerDragDrop={handleLayerDrop} handleSelectBlock={handleSelectBlock}
            onDragStartGlobal={onDragStartGlobal} onDragEndGlobal={onDragEndGlobal}
            setDragOverIndex={setDragOverIndex} handleLayerDrop={handleLayerDrop}
            handleAutoScroll={handleAutoScroll} stopAutoScroll={stopAutoScroll}
          />
        )}

        <div 
          ref={viewportRef}
          className={`flex-1 overflow-hidden relative bg-zinc-950 ${cursorClass}`}
          style={{ 
            backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)', 
            backgroundSize: `${24 * viewportState.zoom}px ${24 * viewportState.zoom}px`,
            backgroundPosition: `${viewportState.x}px ${viewportState.y}px`
          }}
          onMouseDown={handlePanStart}
          onMouseMove={handlePanMove}
          onMouseUp={handlePanEnd}
          onMouseLeave={handlePanEnd}
          onClick={() => { if (!interactionState.isPanning) setSelectedBlockId(null); }}
          onDragOver={!isPreviewMode ? (e) => {
            e.preventDefault();
            handleAutoScroll(e, viewportRef, true);
            if (page.blocks.length === 0) setCanvasDropIndex(0);
            else if (e.target === e.currentTarget && canvasDropIndex === null) setCanvasDropIndex(page.blocks.length);
          } : undefined}
          onDragLeave={!isPreviewMode ? (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setCanvasDropIndex(null);
              stopAutoScroll();
            }
          } : undefined}
          onDrop={!isPreviewMode ? handleCanvasDrop : undefined}
        >
          
          <div 
            className="absolute origin-top-left"
            style={{
              transform: `translate(${viewportState.x}px, ${viewportState.y}px) scale(${viewportState.zoom})`,
              transition: interactionState.isPanning ? 'none' : 'transform 0.1s ease-out',
              pointerEvents: (interactionState.isSpacePressed || interactionState.isMiddleClickPanning) ? 'none' : 'auto'
            }}
          >
            <div ref={browserFrameRef} className={`${getCanvasWidthClass()} bg-white min-h-[800px] rounded-xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] border border-zinc-800/50 flex flex-col mb-20 overflow-hidden`}>
              
              <div className="h-10 bg-zinc-950/95 border-b border-zinc-800/50 flex items-center px-4 gap-4 w-full shrink-0">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-zinc-700/50 hover:bg-red-500 transition-colors"></div>
                  <div className="w-3 h-3 rounded-full bg-zinc-700/50 hover:bg-amber-500 transition-colors"></div>
                  <div className="w-3 h-3 rounded-full bg-zinc-700/50 hover:bg-green-500 transition-colors"></div>
                </div>
                <div className="mx-auto bg-zinc-900/80 h-6 rounded-md px-24 flex items-center text-[11px] font-medium text-zinc-500 border border-zinc-800/50 shadow-inner">
                  <LockIcon className="w-3 h-3 mr-2 opacity-50" /> tu-proyecto.dev
                </div>
                <div className="w-[52px]"></div> 
              </div>

              <div className="flex flex-col w-full flex-1 relative bg-white">
                {page.blocks.map((block, index) => {
                  const BlockContentComponent = BLOCK_REGISTRY[block.type]?.component;
                  if (!BlockContentComponent) return null;

                  return (
                    <BlockWrapper 
                      key={block.id} block={block} index={index}
                      selectedBlockId={selectedBlockId} canvasDropIndex={canvasDropIndex}
                      blocksLength={page.blocks.length} isPreviewMode={isPreviewMode} interactionState={interactionState}
                      handleBlockDragOver={handleBlockDragOver} handleCanvasDrop={handleCanvasDrop}
                      onDragStartGlobal={onDragStartGlobal} onDragEndGlobal={onDragEndGlobal} stopAutoScroll={stopAutoScroll} 
                      handleSelectBlock={handleSelectBlock} handleRemoveBlock={handleRemoveBlock} handleDuplicateBlock={handleDuplicateBlock}
                    >
                      <BlockContentComponent data={block.data} isMobile={deviceMode === 'mobile'} isTablet={deviceMode === 'tablet'} isPreviewMode={isPreviewMode} />
                    </BlockWrapper>
                  );
                })}
                
                {page.blocks.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center text-zinc-300 pointer-events-none mt-20">
                    <div className="w-20 h-20 rounded-3xl bg-zinc-100 flex items-center justify-center mb-6"><Plus className="w-8 h-8 text-zinc-400" /></div>
                    <p className="text-xl font-semibold text-zinc-800">Lienzo en blanco</p>
                    <p className="text-sm text-zinc-500 mt-2">{isPreviewMode ? 'Desactiva el modo preview para editar.' : 'Arrastra componentes desde la izquierda'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`absolute bottom-6 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 p-1.5 rounded-full shadow-2xl z-40 transition-all duration-300 ${isPreviewMode ? 'right-6' : 'right-[340px]'}`}>
            <button onClick={() => setViewportState(prev => ({...prev, zoom: Math.max(Math.round((prev.zoom - 0.1) * 10) / 10, 0.5)}))} className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors" title="Zoom Out">
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-medium text-zinc-300 w-10 text-center select-none cursor-default">
              {Math.round(viewportState.zoom * 100)}%
            </span>
            <button onClick={() => setViewportState(prev => ({...prev, zoom: Math.min(Math.round((prev.zoom + 0.1) * 10) / 10, 2)}))} className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors" title="Zoom In">
              <Plus className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-zinc-800 mx-1"></div>
            <button onClick={handleCenterCanvas} className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors" title="Centrar Canvas">
              <Focus className="w-4 h-4" />
            </button>
          </div>

        </div>

        {!isPreviewMode && (
          <Inspector 
            selectedBlock={selectedBlock} inspectorSections={inspectorSections} toggleInspectorSection={setInspectorSections} 
            handleUpdateBlockData={handleUpdateBlockData} handleRemoveBlock={handleRemoveBlock} handleDuplicateBlock={handleDuplicateBlock}
          />
        )}

      </main>

      {/* --- FIX: Elemento UI invisible para el fantasma del arrastre --- */}
      <div id="drag-ghost" className="fixed -top-[1000px] -left-[1000px] bg-indigo-600 text-white px-4 py-2 rounded-full shadow-2xl text-[12px] font-medium flex items-center gap-2 pointer-events-none z-[-1]">
        <Layers className="w-4 h-4 opacity-70" />
        <span id="drag-ghost-text">Moviendo bloque</span>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #09090b; border-left: 1px solid #18181b; }
        ::-webkit-scrollbar-thumb { background-color: #3f3f46; border-radius: 8px; border: 2px solid #09090b; }
        ::-webkit-scrollbar-thumb:hover { background-color: #52525b; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; border-left: none; }
      `}} />
    </div>
  );
}

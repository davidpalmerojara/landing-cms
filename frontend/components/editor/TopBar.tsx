'use client';

import { useCallback, useRef } from 'react';
import {
  Monitor, Smartphone, Tablet,
  Eye, EyeOff, Save, CheckCircle2,
  Sparkles, RotateCcw,
} from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';

export default function TopBar() {
  const page = useEditorStore((s) => s.page);
  const deviceMode = useEditorStore((s) => s.deviceMode);
  const setDeviceMode = useEditorStore((s) => s.setDeviceMode);
  const isSaved = useEditorStore((s) => s.isSaved);
  const save = useEditorStore((s) => s.save);
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  const togglePreview = useEditorStore((s) => s.togglePreview);
  const resetDemo = useEditorStore((s) => s.resetDemo);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(() => {
    save();
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      useEditorStore.setState({ isSaved: false });
    }, 2000);
  }, [save]);

  const handleResetDemo = useCallback(() => {
    if (window.confirm('¿Restaurar la página a su estado por defecto?')) {
      localStorage.removeItem('landing_builder_page');
      resetDemo();
    }
  }, [resetDemo]);

  return (
    <header className="h-14 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between px-4 shrink-0 z-30">
      <div className="flex items-center gap-4 w-1/3">
        <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-zinc-100 tracking-wide">{page.name}</span>
            <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-widest">
              {page.status}
            </span>
            <button
              onClick={handleResetDemo}
              className="ml-2 text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-800/50 transition-colors"
              title="Resetear a Demo Inicial"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/80 p-1 rounded-full w-auto justify-center shadow-inner">
        <button
          onClick={() => setDeviceMode('desktop')}
          className={`p-1.5 rounded-full transition-all duration-200 ${
            deviceMode === 'desktop'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
          }`}
        >
          <Monitor className="w-4 h-4" />
        </button>
        <button
          onClick={() => setDeviceMode('tablet')}
          className={`p-1.5 rounded-full transition-all duration-200 ${
            deviceMode === 'tablet'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
          }`}
        >
          <Tablet className="w-4 h-4" />
        </button>
        <button
          onClick={() => setDeviceMode('mobile')}
          className={`p-1.5 rounded-full transition-all duration-200 ${
            deviceMode === 'mobile'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
          }`}
        >
          <Smartphone className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-end gap-3 w-1/3">
        <button
          onClick={togglePreview}
          className={`text-sm font-medium flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
            isPreviewMode
              ? 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
          }`}
        >
          {isPreviewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {isPreviewMode ? 'Exit Preview' : 'Preview'}
        </button>
        <button
          onClick={handleSave}
          className="text-sm font-medium text-zinc-400 hover:text-zinc-100 flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-zinc-800/50 transition-colors"
        >
          {isSaved ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
          {isSaved ? 'Guardado' : 'Guardar'}
        </button>
        <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-1.5 rounded-md shadow-lg shadow-indigo-600/20 transition-all active:scale-95">
          Publicar
        </button>
      </div>
    </header>
  );
}

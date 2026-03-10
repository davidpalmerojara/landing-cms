'use client';

import {
  Settings, Type, Palette, ChevronDown, Copy, Trash2,
  AlignLeft, AlignCenter, AlignRight, Layout,
} from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry } from '@/lib/block-registry';
import FieldRenderer from './FieldRenderer';

export default function Inspector() {
  const page = useEditorStore((s) => s.page);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const inspectorSections = useEditorStore((s) => s.inspectorSections);
  const toggleInspectorSection = useEditorStore((s) => s.toggleInspectorSection);
  const updateBlock = useEditorStore((s) => s.updateBlock);
  const deleteBlock = useEditorStore((s) => s.deleteBlock);
  const duplicateBlock = useEditorStore((s) => s.duplicateBlock);

  const selectedBlock = page.blocks.find((b) => b.id === selectedBlockId);

  if (!selectedBlock) {
    return (
      <aside className="w-80 bg-zinc-950 border-l border-zinc-800/80 flex flex-col shrink-0 z-20">
        <div className="h-14 flex items-center px-5 border-b border-zinc-800/80 shrink-0">
          <h2 className="text-[13px] font-semibold text-zinc-100 flex items-center gap-2 tracking-wide">
            <Settings className="w-4 h-4 text-zinc-500" /> Inspector
          </h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-zinc-900/50 flex items-center justify-center border border-zinc-800/50">
            <Settings className="w-6 h-6 text-zinc-600" />
          </div>
          <div>
            <p className="font-medium text-zinc-300 mb-1">Nada seleccionado</p>
            <p className="text-[12px] leading-relaxed">
              Haz clic en un componente del lienzo para inspeccionar sus propiedades.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const blockConfig = blockRegistry[selectedBlock.type];
  const blockFields = blockConfig ? blockConfig.fields : [];
  const BlockIcon = blockConfig?.icon || Layout;

  return (
    <aside className="w-80 bg-zinc-950 border-l border-zinc-800/80 flex flex-col shrink-0 z-20">
      <div className="h-14 flex items-center px-5 border-b border-zinc-800/80 shrink-0">
        <h2 className="text-[13px] font-semibold text-zinc-100 flex items-center gap-2 tracking-wide">
          <Settings className="w-4 h-4 text-zinc-500" /> Inspector
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="pb-10">
          {/* Block header */}
          <div className="p-5 border-b border-zinc-800/50 bg-zinc-900/20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <BlockIcon className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <span className="font-medium text-[13px] text-zinc-100 block">{selectedBlock.name}</span>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{selectedBlock.type}</span>
              </div>
            </div>
          </div>

          {!blockConfig ? (
            <div className="p-8 text-center text-zinc-500 text-[12px]">
              <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
                La configuración y esquema de este bloque no se encuentran disponibles en el registro.
              </div>
            </div>
          ) : (
            <>
              {/* Content section */}
              <div className="border-b border-zinc-800/50">
                <button
                  onClick={() => toggleInspectorSection('content')}
                  className="w-full flex items-center justify-between p-5 hover:bg-zinc-900/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Type className="w-4 h-4 text-zinc-500" />
                    <span className="text-[12px] font-medium tracking-wide">Contenido</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${
                      inspectorSections.content ? '' : '-rotate-90'
                    }`}
                  />
                </button>
                {inspectorSections.content && (
                  <div className="px-5 pb-6 space-y-6">
                    {blockFields.map((field) => (
                      <FieldRenderer
                        key={field.key}
                        field={field}
                        value={selectedBlock.data[field.key]}
                        onChange={(value) => updateBlock(selectedBlock.id, field.key, value)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Styles section (disabled demo) */}
              <div className="border-b border-zinc-800/50">
                <button
                  onClick={() => toggleInspectorSection('styles')}
                  className="w-full flex items-center justify-between p-5 hover:bg-zinc-900/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Palette className="w-4 h-4 text-zinc-500" />
                    <span className="text-[12px] font-medium tracking-wide flex items-center gap-2">
                      Estilos
                      <span className="bg-indigo-500/20 text-indigo-300 text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                        Demo
                      </span>
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${
                      inspectorSections.styles ? '' : '-rotate-90'
                    }`}
                  />
                </button>
                {inspectorSections.styles && (
                  <div className="px-5 pb-6 space-y-6 opacity-60 pointer-events-none">
                    <div className="space-y-2.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Alineación</label>
                      <div className="flex bg-zinc-900/80 p-1 rounded-lg border border-zinc-800 shadow-inner">
                        <button className="flex-1 flex items-center justify-center py-1.5 rounded-md bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50"><AlignLeft className="w-4 h-4" /></button>
                        <button className="flex-1 flex items-center justify-center py-1.5 rounded-md text-zinc-500"><AlignCenter className="w-4 h-4" /></button>
                        <button className="flex-1 flex items-center justify-center py-1.5 rounded-md text-zinc-500"><AlignRight className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Colores</label>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50 cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-white border border-zinc-300 shadow-sm"></div>
                            <span className="text-[12px] font-medium text-zinc-300">Fondo</span>
                          </div>
                          <span className="text-[11px] text-zinc-500 font-mono">#FFFFFF</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50 cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 shadow-sm"></div>
                            <span className="text-[12px] font-medium text-zinc-300">Texto</span>
                          </div>
                          <span className="text-[11px] text-zinc-500 font-mono">#09090B</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer actions */}
          <div className="p-5 mt-2 flex gap-2">
            <button
              onClick={() => duplicateBlock(selectedBlock.id)}
              className="flex-1 py-2.5 px-2 bg-zinc-900/50 border border-zinc-800/50 text-zinc-300 rounded-lg text-[11px] font-medium hover:bg-zinc-800 hover:text-zinc-100 transition-all flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> Duplicar
            </button>
            <button
              onClick={() => deleteBlock(selectedBlock.id)}
              className="flex-1 py-2.5 px-2 bg-transparent border border-red-900/30 text-red-400 rounded-lg text-[11px] font-medium hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300 transition-all flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

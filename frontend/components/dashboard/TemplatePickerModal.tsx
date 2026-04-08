'use client';

import { useState } from 'react';
import { X, FileText, Loader2, LayoutTemplate, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { pageTemplates } from '@/lib/templates';

interface TemplatePickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with null for blank page, or template id */
  onSelect: (templateId: string | null) => void;
  onAIGenerate: () => void;
  isCreating: boolean;
}

export default function TemplatePickerModal({
  open,
  onClose,
  onSelect,
  onAIGenerate,
  isCreating,
}: TemplatePickerModalProps) {
  const t = useTranslations();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!open) return null;

  const handleCreate = () => {
    onSelect(selectedId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface border border-subtle rounded-2xl shadow-2xl shadow-black/40 w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle\/80">
          <div>
            <h2 className="text-lg font-semibold text-primary">
              {t('dashboard.createPage')}
            </h2>
            <p className="text-sm text-muted mt-0.5">
              {t('dashboard.templatePickerSubtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-secondary hover:bg-surface-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* AI Generate option */}
            <button
              onClick={() => {
                onClose();
                onAIGenerate();
              }}
              className="group text-left rounded-xl border-2 border-primary/30 hover:border-primary/60 bg-gradient-to-b from-primary/5 to-primary/5 transition-all p-4 flex flex-col"
            >
              <div className="h-28 rounded-lg bg-gradient-to-br from-primary/10 to-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                <Sparkles className="w-8 h-8 text-violet-400" />
              </div>
              <h3 className="font-medium text-sm text-violet-300">
                {t('ai.title')}
              </h3>
              <p className="text-xs text-muted mt-1">
                {t('dashboard.aiTemplateDescription')}
              </p>
            </button>

            {/* Blank page option */}
            <button
              onClick={() => setSelectedId(null)}
              className={`group text-left rounded-xl border-2 transition-all p-4 flex flex-col ${
                selectedId === null
                  ? 'border-primary bg-primary\/5'
                  : 'border-subtle hover:border-default bg-surface-elevated\/30'
              }`}
            >
              <div className="h-28 rounded-lg bg-surface-elevated border border-subtle\/50 flex items-center justify-center mb-3">
                <FileText className="w-8 h-8 text-muted" />
              </div>
              <h3 className="font-medium text-sm text-primary">
                {t('dashboard.blankPage')}
              </h3>
              <p className="text-xs text-muted mt-1">
                {t('dashboard.blankPageDescription')}
              </p>
            </button>

            {/* Template options */}
            {pageTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => setSelectedId(template.id)}
                className={`group text-left rounded-xl border-2 transition-all p-4 flex flex-col ${
                  selectedId === template.id
                    ? 'border-primary bg-primary\/5'
                    : 'border-subtle hover:border-default bg-surface-elevated\/30'
                }`}
              >
                <div className="h-28 rounded-lg bg-surface-elevated border border-subtle\/50 flex items-center justify-center mb-3 relative overflow-hidden">
                  <LayoutTemplate className="w-8 h-8 text-muted" />
                  <div className="absolute top-2 right-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-card text-secondary font-medium">
                      {t('dashboard.blocksCount', { count: template.blocks.length })}
                    </span>
                  </div>
                </div>
                <h3 className="font-medium text-sm text-primary">
                  {template.name}
                </h3>
                <p className="text-xs text-muted mt-1 line-clamp-2">
                  {template.description}
                </p>
                <span className="text-[10px] text-muted mt-2 uppercase tracking-wider font-medium">
                  {template.category}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle\/80">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="text-sm font-medium text-secondary hover:text-primary px-4 py-2 rounded-lg hover:bg-surface-card transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="flex items-center gap-2 text-white font-bold text-sm px-5 py-2 rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            {selectedId ? t('dashboard.createWithTemplate') : t('dashboard.createBlankPage')}
          </button>
        </div>
      </div>
    </div>
  );
}

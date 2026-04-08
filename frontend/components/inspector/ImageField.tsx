'use client';

import { useState } from 'react';
import { ImagePlus, Trash2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AssetPickerModal from './AssetPickerModal';
import type { ApiAsset } from '@/lib/api';

interface ImageFieldProps {
  id?: string;
  value: string;
  onChange: (value: unknown) => void;
}

export default function ImageField({ id, value, onChange }: ImageFieldProps) {
  const t = useTranslations();
  const [showPicker, setShowPicker] = useState(false);

  const handleSelect = (asset: ApiAsset) => {
    onChange(asset.url);
    setShowPicker(false);
  };

  const handleRemove = () => {
    onChange('');
  };

  return (
    <>
      {value ? (
        <div className="space-y-2">
          <div className="relative aspect-video rounded-lg overflow-hidden border border-default/10 bg-surface-elevated">
            <img
              src={value}
              alt="Selected"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPicker(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-secondary hover:text-primary active:text-primary bg-surface-elevated\/50 border border-default/10 rounded-md hover:bg-surface-card active:bg-surface-card transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              {t('common.change')}
            </button>
            <button
              onClick={handleRemove}
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-[11px] font-medium text-red-400 bg-transparent border border-red-900/30 rounded-md hover:bg-red-500/10 hover:border-red-500/40 active:bg-red-500/10 active:border-red-500/40 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-default/20 bg-surface-elevated/30 hover:bg-surface-elevated\/80 hover:border-[#2563EB]/50 active:bg-surface-elevated\/80 active:border-[#2563EB]/50 text-muted hover:text-[#2563EB] active:text-[#2563EB] transition-all cursor-pointer group"
        >
          <ImagePlus className="w-5 h-5" />
          <span className="text-[11px] font-medium">{t('inspector.selectImage')}</span>
        </button>
      )}

      {showPicker && (
        <AssetPickerModal
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

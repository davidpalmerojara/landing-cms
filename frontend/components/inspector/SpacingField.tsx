'use client';

import { useTranslations } from 'next-intl';

interface SpacingFieldProps {
  label: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  onChange: (side: string, value: number) => void;
}

export default function SpacingField({ label, top, bottom, left, right, onChange }: SpacingFieldProps) {
  const t = useTranslations('inspector');
  const handleChange = (side: string, raw: string) => {
    const num = parseInt(raw, 10);
    onChange(side, isNaN(num) ? 0 : Math.max(0, Math.min(num, 200)));
  };

  const inputClass =
    'w-full text-center text-[12px] py-1.5 rounded-md bg-surface-elevated border border-default/10 text-secondary focus:border-[#2563EB]/50 focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
        {label}
      </label>
      <div className="grid grid-cols-4 gap-1.5">
        <div className="space-y-1">
          <span className="text-[9px] text-muted uppercase text-center block">{t('top')}</span>
          <input
            type="number"
            value={top}
            onChange={(e) => handleChange('Top', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[9px] text-muted uppercase text-center block">{t('right')}</span>
          <input
            type="number"
            value={right}
            onChange={(e) => handleChange('Right', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[9px] text-muted uppercase text-center block">{t('bottom')}</span>
          <input
            type="number"
            value={bottom}
            onChange={(e) => handleChange('Bottom', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[9px] text-muted uppercase text-center block">{t('left')}</span>
          <input
            type="number"
            value={left}
            onChange={(e) => handleChange('Left', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

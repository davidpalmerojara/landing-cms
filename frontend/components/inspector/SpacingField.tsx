'use client';

import { useId } from 'react';
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
  const groupId = useId();
  const handleChange = (side: string, raw: string) => {
    const num = parseInt(raw, 10);
    onChange(side, isNaN(num) ? 0 : Math.max(0, Math.min(num, 200)));
  };

  const inputClass =
    'w-full text-center text-[12px] py-1.5 rounded-md bg-surface-elevated border border-default/10 text-secondary focus:border-primary/50 focus:ring-1 focus:ring-primary/30 outline-none transition-all shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  const sides = [
    { side: 'Top', label: t('top'), value: top },
    { side: 'Right', label: t('right'), value: right },
    { side: 'Bottom', label: t('bottom'), value: bottom },
    { side: 'Left', label: t('left'), value: left },
  ];

  return (
    <div className="space-y-2" role="group" aria-labelledby={`${groupId}-label`}>
      <span id={`${groupId}-label`} className="text-[10px] font-bold text-muted uppercase tracking-widest block">
        {label}
      </span>
      <div className="grid grid-cols-4 gap-1.5">
        {sides.map(({ side, label: sideLabel, value }) => (
          <div key={side} className="space-y-1">
            <label
              id={`${groupId}-${side}-label`}
              htmlFor={`${groupId}-${side}`}
              className="text-[9px] text-muted uppercase text-center block"
            >
              {sideLabel}
            </label>
            <input
              id={`${groupId}-${side}`}
              type="number"
              min={0}
              max={200}
              value={value}
              aria-labelledby={`${groupId}-label ${groupId}-${side}-label`}
              onChange={(e) => handleChange(side, e.target.value)}
              className={inputClass}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

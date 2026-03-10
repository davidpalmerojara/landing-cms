'use client';

import { useRef } from 'react';

interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ColorField({ value, onChange }: ColorFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors shadow-inner"
      onClick={() => inputRef.current?.click()}
    >
      <div
        className="w-7 h-7 rounded-md border border-zinc-700 shadow-sm shrink-0"
        style={{ backgroundColor: value || '#ffffff' }}
      />
      <span className="text-[12px] text-zinc-300 font-mono uppercase flex-1">
        {value || '#ffffff'}
      </span>
      <input
        ref={inputRef}
        type="color"
        value={value || '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        className="w-0 h-0 opacity-0 absolute"
      />
    </div>
  );
}

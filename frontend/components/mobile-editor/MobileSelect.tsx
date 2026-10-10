'use client';

import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

type MobileSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

/**
 * A native select drawn by us: Safari keeps its own menu list about 26 px
 * high whatever the CSS says, so the arrow is ours and the select is a plain
 * 44 px box (QA-064). The phone still opens its native picker.
 */
export default function MobileSelect({ className, invalid = false, children, ...props }: MobileSelectProps) {
  return (
    <div className="relative">
      <select
        {...props}
        className={clsx(
          'w-full min-h-11 pl-4 pr-10 py-2.5 rounded-xl bg-surface-card border text-primary text-base outline-none focus:ring-1 appearance-none transition-all',
          invalid
            ? 'border-error/70 focus:border-error focus:ring-error/30'
            : 'border-default/15 focus:border-primary/50 focus:ring-primary/30',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        size={18}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

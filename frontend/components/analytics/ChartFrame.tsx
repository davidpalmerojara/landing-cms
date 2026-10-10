'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ChartSize {
  width: number;
  height: number;
}

interface ChartFrameProps {
  /** Sets the frame's size (a height class such as `h-64`); the width comes from the layout */
  className: string;
  children: (size: ChartSize) => ReactNode;
}

/**
 * Measures its box and draws the chart only once it has a size. Recharts'
 * ResponsiveContainer renders before measuring and warns "width(-1) and
 * height(-1) of chart should be greater than 0" (QA-087).
 */
export default function ChartFrame({ className, children }: ChartFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ChartSize | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((previous) => (previous?.width === width && previous.height === height ? previous : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {size && size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}

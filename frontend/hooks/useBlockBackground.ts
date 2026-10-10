'use client';

import { useEffect, useState } from 'react';

const MAX_ELEMENTS = 60;

function toHex(color: string): string | null {
  const match = color.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : parseFloat(match[4]) / (match[4].endsWith('%') ? 100 : 1);
  if (alpha === 0) return null;
  return `#${[match[1], match[2], match[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * The background the canvas paints for a block, read from the page: the first
 * painted background inside the block's content, outermost first. Null when
 * the block is not on the canvas or paints none (the page background shows).
 */
export function readBlockBackground(blockId: string): string | null {
  const content = document.getElementById(`block-focus-${blockId}`)?.querySelector('[data-block-content]');
  if (!content) return null;
  const elements = [content, ...content.querySelectorAll('*')].slice(0, MAX_ELEMENTS);
  for (const el of elements) {
    const hex = toHex(getComputedStyle(el).backgroundColor);
    if (hex) return hex;
  }
  return null;
}

/**
 * What a block's background looks like when the block has no colour of its
 * own: the theme decides it (QA-082). `deps` are what may change it (theme,
 * the block's data). Read after the canvas has painted.
 */
export function useBlockBackground(blockId: string, deps: readonly unknown[]): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setColor(readBlockBackground(blockId)));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the caller's list
  }, [blockId, ...deps]);
  return color;
}

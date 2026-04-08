import { blockRegistry } from './block-registry';
import type { Block } from '@/types/blocks';
import { defaultBlockStyles } from '@/types/blocks';

export function generateId(prefix = 'blk') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createBlock(type: string): Block {
  const config = blockRegistry[type];
  if (!config) {
    throw new Error(`Unknown block type: ${type}`);
  }
  return {
    id: generateId(),
    type,
    name: config.label,
    data: { ...config.initialData },
    styles: { ...defaultBlockStyles },
  };
}

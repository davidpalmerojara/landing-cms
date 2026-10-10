import { blockRegistry } from './block-registry';
import { makeBlock } from './block-data';
import { getBlockDefaults } from './block-defaults';
import type { Block, BlockType } from '@/types/blocks';
import { defaultBlockStyles } from '@/types/blocks';

/**
 * Block ids are UUID v4 generated in the browser, and the server keeps them
 * (ADR-014). A block therefore has the same id before and after saving.
 */
export function newBlockId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID only exists in secure contexts (https, localhost); opening the
  // dev server from a phone over http://<LAN IP> is not one.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBlockId(id: string): boolean {
  return UUID_RE.test(id);
}

/** A new block of `type` with the sample content of `locale` (the interface language). */
export function createBlock(type: BlockType, locale: string): Block {
  const config = blockRegistry[type];
  return makeBlock({ id: newBlockId(), name: config.label, styles: { ...defaultBlockStyles } }, type, getBlockDefaults(type, locale));
}

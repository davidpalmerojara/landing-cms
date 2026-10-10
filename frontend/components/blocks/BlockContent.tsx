'use client';

import { blockRegistry } from '@/lib/block-registry';
import { isBlockType, normalizeBlockData } from '@/lib/block-data';
import type { BlockOf, BlockType } from '@/types/blocks';
import { BlockRenderProvider } from './block-render-context';

interface BlockContentProps<K extends BlockType> {
  block: Pick<BlockOf<K>, 'id' | 'type' | 'data'>;
  isPreviewMode: boolean;
}

/**
 * The component of a block's type, given that block's data. Generic over the
 * type so the registry entry and the data are checked to match.
 */
export default function BlockContent<K extends BlockType>({ block, isPreviewMode }: BlockContentProps<K>) {
  const { component: Component } = blockRegistry[block.type];
  return (
    <BlockRenderProvider value={{ editable: !isPreviewMode, blockType: block.type }}>
      {/* Long unbroken words (URLs, brand names) wrap instead of overflowing (QA-095); inherited by every text */}
      <div className="contents [overflow-wrap:anywhere]">
        <Component blockId={block.id} data={block.data} isPreviewMode={isPreviewMode} />
      </div>
    </BlockRenderProvider>
  );
}

interface UntypedBlockContentProps {
  block: { id: string; type: string; data: unknown };
  isPreviewMode: boolean;
}

/** For blocks read straight from the API (version snapshots, thumbnails): unknown types render nothing. */
export function UntypedBlockContent({ block, isPreviewMode }: UntypedBlockContentProps) {
  if (!isBlockType(block.type)) return null;
  return (
    <BlockContent
      block={{ id: block.id, type: block.type, data: normalizeBlockData(block.type, block.data) }}
      isPreviewMode={isPreviewMode}
    />
  );
}

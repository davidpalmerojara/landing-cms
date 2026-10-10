import { createContext, useContext } from 'react';
import type { BlockType } from '@/types/blocks';

export interface BlockRenderContextValue {
  /** The block is on the editor canvas and its texts can be edited inline */
  editable: boolean;
  /** Type of the block being rendered (for the server's field limits) */
  blockType: BlockType | null;
}

/**
 * How the block being rendered is shown. Set by BlockContent: only the editor
 * canvas outside preview renders editable blocks; the public page, previews
 * and thumbnails render what visitors see (empty texts render nothing).
 */
const BlockRenderContext = createContext<BlockRenderContextValue>({ editable: false, blockType: null });

export const BlockRenderProvider = BlockRenderContext.Provider;

export function useBlockRender(): BlockRenderContextValue {
  return useContext(BlockRenderContext);
}

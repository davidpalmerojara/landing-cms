import type { Block } from './blocks';

export interface Page {
  id: string;
  name: string;
  status: string;
  slug: string;
  blocks: Block[];
}

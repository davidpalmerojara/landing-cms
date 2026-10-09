/**
 * In-page anchors for published pages: the first block of each type gets the
 * type as its element id ("features", "pricing", "faq"...), so a link field
 * can point to "#pricing". Later blocks of the same type get no id, because
 * ids must be unique in the document.
 */
export function blockAnchorIds(blocks: ReadonlyArray<{ id: string; type: string }>): Map<string, string> {
  const anchors = new Map<string, string>();
  const seenTypes = new Set<string>();
  for (const block of blocks) {
    if (seenTypes.has(block.type)) continue;
    seenTypes.add(block.type);
    anchors.set(block.id, block.type);
  }
  return anchors;
}

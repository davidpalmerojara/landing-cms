/**
 * "Save what is on screen now", for actions that work on the server's copy of
 * the page (save a version, edit a block with AI, leave the editor).
 *
 * The open editor's autosave (hooks/useAutoSave) registers the flusher; there
 * is at most one editor open per tab. Without an editor, flushing has nothing
 * to do and resolves true.
 *
 *   const saved = await flushPendingSave();
 *   if (!saved) return showWhyItFailed();   // the store's saveIssue says why
 */

type SaveFlusher = () => Promise<boolean>;

let flusher: SaveFlusher | null = null;

/** Called by useAutoSave. Returns the function that unregisters it. */
export function registerSaveFlush(fn: SaveFlusher): () => void {
  flusher = fn;
  return () => {
    if (flusher === fn) flusher = null;
  };
}

/**
 * Sends right away the change the autosave is still waiting to send. Resolves
 * true when the server has everything on screen (or nothing was pending), false
 * when the save failed: offline, a field the server refused, or no access.
 */
export function flushPendingSave(): Promise<boolean> {
  return flusher ? flusher() : Promise.resolve(true);
}

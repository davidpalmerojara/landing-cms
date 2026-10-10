/**
 * Keeps the editor's page in sync with the server (S10 contract, ADR-024).
 *
 * The store holds the sync base: the page as the server last had it and its
 * version. Every PUT sends that version; a 409 brings the server's page, which
 * is merged three-way with the editor's (lib/page-merge) and saved again if the
 * merge kept local changes. Changes announced by the collaboration socket
 * (`page_updated`, or a version mismatch after reconnecting) are fetched and
 * merged the same way.
 *
 * All server work runs one task at a time (saves, resyncs, restore, publish),
 * so only one PUT is in flight and each is based on the latest known version.
 *
 * Nothing typed is lost silently (QA-003, QA-004, QA-008):
 * - every save path sets the store's `autoSaveStatus` and `saveIssue`;
 * - a save that got no answer (or a server error) is retried with backoff and
 *   as soon as the browser is back online (`retryNow`);
 * - fields the server refuses (400 with `details`) are left out of the next
 *   PUTs, so the rest of the page keeps saving, until the user changes them;
 *   `saveIssue` names each one so the editor can point at it;
 * - `saveOnLeave` sends the pending change with `keepalive` while the tab closes;
 * - the local backup (lib/page-backup) holds what the server did not confirm,
 *   and `load` merges it back in.
 *
 * Framework-free: the usePageSync hook owns one controller per page.
 */
import { api, conflictPage } from '@/lib/api';
import type { ApiPage } from '@/lib/api';
import { apiErrorKind, isRetryableError, validationErrors } from '@/lib/api-errors';
import type { ApiErrorKind } from '@/lib/api-errors';
import { getAtPath, isBlockType, makeBlock, setAtPath, withBlockData } from '@/lib/block-data';
import { apiPageToLocal, localPageToApi } from '@/lib/page-mapping';
import { deepEqual, mergePages, rebaseSnapshot, sameBlockContent, samePageContent, withoutRelayedEdits } from '@/lib/page-merge';
import { logSyncError, readBackup, writeBackup } from '@/lib/page-backup';
import { useEditorStore } from '@/store/editor-store';
import type { BlockType, DataPath } from '@/types/block-data';
import type { Block } from '@/types/blocks';
import type { Page } from '@/types/page';

/** Merges and retries after a 409 before giving up on a save. */
export const MAX_CONFLICT_RETRIES = 3;
/** Rounds of "leave out the refused fields and send again" within one save. */
const MAX_REJECTION_ROUNDS = 3;
/** Waits before retrying a save that got no answer: 2 s, 5 s, 15 s, then every 30 s. */
export const SAVE_RETRY_DELAYS = [2000, 5000, 15000, 30000] as const;
/** How long "Guardado" stays before the status goes back to idle. */
const SAVED_STATUS_MS = 2000;

export type PageChangeReason = 'save' | 'restore' | 'publish' | 'ai';

/** A newer version announced by the server. */
export interface RemotePageChange {
  version: number;
  /** `reconnect`: the socket came back and the server is at another version */
  reason: PageChangeReason | 'reconnect';
  by: { userId: string; username: string } | null;
  /** The socket whose request made the change; ours is ignored */
  connectionId: string | null;
}

/** A field the server refused. The rest of the page keeps saving without it. */
export interface RejectedField {
  /** null: a page field (name, SEO, design tokens) */
  blockId: string | null;
  blockType: BlockType | null;
  /**
   * In a block: the path in its data (`['links', 0, 'url']`), `[]` for the
   * whole block. A page field: its path in the editor's Page (`['seo', 'seoTitle']`).
   */
  path: DataPath;
  /** The value that was refused; the message no longer applies once the field holds another one */
  value: unknown;
  /** The server's message (Spanish): show it through `ruleMessageText` (lib/api-errors) */
  message: string;
}

/**
 * Why the editor's page is not all on the server.
 * `failed`: the last save did not go through (`error` says why; `retrying`: it
 * is sent again by itself). `rejected`: the server refused some fields; the
 * rest of the page is saved.
 */
export type SaveIssue =
  | { kind: 'failed'; error: ApiErrorKind; retrying: boolean }
  | { kind: 'rejected'; fields: RejectedField[] };

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface PageSyncCallbacks {
  /** A change made elsewhere was merged into the editor. */
  onRemoteMerged?: (change: RemotePageChange) => void;
  /** A save failed: `conflict` after MAX_CONFLICT_RETRIES merges, `request` for any other error. */
  onSaveFailed?: (kind: 'conflict' | 'request', error: unknown) => void;
  /** Changes kept in this browser that never reached the server were put back into the page. */
  onLocalChangesRecovered?: () => void;
}

export interface SaveOptions {
  /** The request may outlive the tab (sent while leaving the page). */
  keepalive?: boolean;
}

/** A block the server already wrote outside a save (an AI edit), and the page version that write made. */
export interface ServerBlockWrite {
  block: { id: string; type: string; data: unknown };
  /** The page version right after the write; null when the response did not say */
  pageVersion: number | null;
}

const store = () => useEditorStore.getState();

/** Controllers of the open editor (one per tab; the latest started wins), for writes made through other endpoints. */
const startedControllers = new Set<PageSyncController>();

/** The owner stopped sharing the page: the server refuses everything, so nothing is sent or fetched. */
const isAccessRevoked = () => store().collabStatus === 'revoked';

/** Page fields of a PUT, by API name, and where they live in the editor's Page. */
const PAGE_FIELD_PATHS: Record<string, DataPath> = {
  name: ['name'],
  design_tokens: ['designTokens'],
  seo_title: ['seo', 'seoTitle'],
  seo_description: ['seo', 'seoDescription'],
  seo_canonical_url: ['seo', 'seoCanonicalUrl'],
  og_title: ['seo', 'ogTitle'],
  og_description: ['seo', 'ogDescription'],
  og_image: ['seo', 'ogImage'],
  og_type: ['seo', 'ogType'],
  noindex: ['seo', 'noindex'],
  language: ['seo', 'language'],
};

/** Read-only publication fields from the server, without an undo step or autosave. */
function applyPublication(apiPage: ApiPage) {
  const page = store().page;
  useEditorStore.setState({
    isRemoteUpdate: true,
    page: {
      ...page,
      status: apiPage.status,
      publishedAt: apiPage.published_at ?? null,
      hasUnpublishedChanges: apiPage.has_unpublished_changes ?? false,
    },
  });
  queueMicrotask(() => useEditorStore.setState({ isRemoteUpdate: false }));
}

// --- Refused fields ---

function blockById(page: Page, id: string): Block | undefined {
  return page.blocks.find((b) => b.id === id);
}

/** The value a refused field holds now in `page`; undefined when the block or field is gone. */
function currentValue(page: Page, field: RejectedField): unknown {
  if (field.blockId === null) return getAtPath(page, field.path);
  const block = blockById(page, field.blockId);
  if (!block) return undefined;
  return field.path.length === 0 ? block : getAtPath(block.data, field.path);
}

function stillRefused(page: Page, field: RejectedField): boolean {
  const value = currentValue(page, field);
  if (value === undefined) return false;
  if (field.path.length === 0 && field.blockId !== null) {
    return sameBlockContent(value as Block, field.value as Block);
  }
  return deepEqual(value, field.value);
}

/** `page` with a refused field put back to what the server has (`base`), or to empty for a new block. */
function withoutField(page: Page, base: Page, field: RejectedField): Page {
  if (field.blockId === null) {
    const restored = setAtPath(page, field.path, getAtPath(base, field.path));
    return restored as Page;
  }
  const block = blockById(page, field.blockId);
  if (!block) return page;
  const baseBlock = blockById(base, field.blockId);
  let replacement: Block | null;
  if (field.path.length === 0) {
    // The whole block was refused: send the server's copy, or leave a new one out
    replacement = baseBlock ?? null;
  } else {
    const empty = makeBlock({ id: block.id, name: block.name, styles: block.styles }, block.type, {});
    const serverValue = baseBlock && baseBlock.type === block.type ? getAtPath(baseBlock.data, field.path) : undefined;
    const value = serverValue ?? getAtPath(empty.data, field.path) ?? '';
    replacement = withBlockData(block, setAtPath(block.data, field.path, value));
  }
  return {
    ...page,
    blocks: page.blocks.flatMap((b) => (b.id !== block.id ? [b] : replacement ? [replacement] : [])),
  };
}

export class PageSyncController {
  private tail: Promise<unknown> = Promise.resolve();
  private queuedSave: Promise<boolean> | null = null;
  /** Tasks started and not finished (0: nothing in flight) */
  private running = 0;
  private rejected: RejectedField[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private savedTimer: ReturnType<typeof setTimeout> | null = null;
  /** Versions received through a 409 merge (from, to]: their announcements still deserve a notice */
  private mergedRanges: Array<[number, number]> = [];
  private disposed = false;
  /** The error of the last publish or unpublish that failed at the server, null otherwise. */
  lastPublicationError: unknown = null;

  /** `pageId` empty: the page in the editor (loaded without an id in the URL). */
  constructor(
    private readonly pageId: string,
    private readonly callbacks: () => PageSyncCallbacks = () => ({}),
  ) {}

  private id(): string {
    return this.pageId || store().page.id;
  }

  /**
   * The editor still holds the placeholder page while it opens a page by id
   * (or after that page failed to load): it is nobody's, so it is never saved
   * or created on the server (APP2-005).
   */
  private holdsPlaceholder(): boolean {
    return this.pageId !== '' && store().page.id.startsWith('page_');
  }

  /** Runs `task` after every task queued before it. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      this.running++;
      try {
        return await task();
      } finally {
        this.running--;
      }
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** (Re)start retries after `dispose` (React mounts effects twice in development). */
  start() {
    this.disposed = false;
    startedControllers.delete(this);
    startedControllers.add(this);
  }

  /** Stop the timers (the editor closed). Saves already asked for still run. */
  dispose() {
    this.disposed = true;
    startedControllers.delete(this);
    this.clearRetry();
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = null;
  }

  // --- Status ---

  private setStatus(status: SaveStatus, issue?: SaveIssue | null) {
    if (this.savedTimer) {
      clearTimeout(this.savedTimer);
      this.savedTimer = null;
    }
    useEditorStore.setState(issue === undefined ? { autoSaveStatus: status } : { autoSaveStatus: status, saveIssue: issue });
    if (status === 'saved') {
      this.savedTimer = setTimeout(() => {
        this.savedTimer = null;
        if (store().autoSaveStatus === 'saved') useEditorStore.setState({ autoSaveStatus: 'idle' });
      }, SAVED_STATUS_MS);
    }
  }

  private rejectedIssue(): SaveIssue | null {
    return this.rejected.length > 0 ? { kind: 'rejected', fields: [...this.rejected] } : null;
  }

  /** The editor has changes the server does not have (including refused fields). */
  hasUnsavedChanges(): boolean {
    if (this.holdsPlaceholder()) return false;
    const base = store().syncBase;
    if (!base) return true;
    // Someone else's live text is not ours to save (QA-033)
    const own = withoutRelayedEdits(store().page, base.page, store().relayedEdits);
    return !samePageContent(own, base.page);
  }

  // --- Retries ---

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private scheduleRetry() {
    if (this.disposed || this.retryTimer) return;
    const delay = SAVE_RETRY_DELAYS[Math.min(this.retryAttempt, SAVE_RETRY_DELAYS.length - 1)];
    this.retryAttempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.save();
    }, delay);
  }

  /** Retry a failed save now (the browser is back online, the socket reconnected). */
  retryNow(): Promise<boolean> | null {
    const issue = store().saveIssue;
    if (issue?.kind !== 'failed' || !issue.retrying) return null;
    this.clearRetry();
    return this.save();
  }

  // --- Load ---

  /** Fetch the page and make it the editor's page and the sync base; merge back unsaved local changes. */
  load(fetchPage: () => Promise<ApiPage>): Promise<void> {
    return this.enqueue(async () => {
      const apiPage = await fetchPage();
      const page = apiPageToLocal(apiPage);
      store().setSyncBase({ page, version: apiPage.version });
      store().loadPage(page);
      this.rejected = [];
      this.setStatus('idle', null);
      this.recoverBackup(page);
    });
  }

  /**
   * The browser kept changes the server never confirmed (tab closed while
   * offline or mid-save): merge them on top of the server's page, as one undo
   * step, and save. Backups without their base are too old to tell apart.
   */
  private recoverBackup(server: Page) {
    const backup = readBackup(server.id);
    if (!backup || !backup.unsaved || !backup.base) return;
    const merged = mergePages(backup.base.page, backup.page, server);
    if (samePageContent(merged, server)) return;
    store().setPageWithHistory(merged);
    this.callbacks().onLocalChangesRecovered?.();
    // Queued behind this task; not awaited
    void this.save();
  }

  // --- Save ---

  /**
   * Save the editor's page. Calls made while a save waits to start share it
   * (it sends the latest state), so at most one PUT is in flight and one waits.
   * Resolves true when the server has everything on screen.
   */
  save(options: SaveOptions = {}): Promise<boolean> {
    if (isAccessRevoked()) return Promise.resolve(false);
    if (this.holdsPlaceholder()) return Promise.resolve(true);
    if (this.queuedSave) return this.queuedSave;
    const run = this.enqueue(() => {
      this.queuedSave = null;
      return this.saveNow(options);
    });
    this.queuedSave = run;
    return run;
  }

  /**
   * The tab is closing: send the pending change now with `keepalive`, if no
   * other request is in flight (a queued one would never start). Returns false
   * when nothing could be sent; the local backup still has the change.
   */
  saveOnLeave(): boolean {
    if (isAccessRevoked() || !this.hasUnsavedChanges()) return true;
    if (this.running > 0 || this.queuedSave) return false;
    void this.save({ keepalive: true });
    return true;
  }

  /** `page` without the fields the server refused and the user has not changed since. */
  private outgoing(page: Page, base: Page): Page {
    this.rejected = this.rejected.filter((field) => stillRefused(page, field));
    return this.rejected.reduce((result, field) => withoutField(result, base, field), page);
  }

  /** Remember the fields a 400 refused; false when it named none (nothing to leave out). */
  private rememberRefused(error: unknown, sent: Page): boolean {
    // Values as they were sent: if the user changed one meanwhile, the new value is checked again
    const found: RejectedField[] = [];
    for (const fieldError of validationErrors(error)) {
      const message = fieldError.messages[0] ?? '';
      if (fieldError.blockIndex === null) {
        const path = PAGE_FIELD_PATHS[String(fieldError.path[0])];
        if (path) found.push({ blockId: null, blockType: null, path, value: getAtPath(sent, path), message });
        continue;
      }
      const block = sent.blocks[fieldError.blockIndex];
      if (!block) continue;
      const value = fieldError.path.length === 0 ? block : getAtPath(block.data, fieldError.path);
      if (value === undefined) continue;
      found.push({ blockId: block.id, blockType: block.type, path: fieldError.path, value, message });
    }
    const isNew = (field: RejectedField) => !this.rejected.some((known) =>
      known.blockId === field.blockId && deepEqual(known.path, field.path));
    const added = found.filter(isNew);
    this.rejected.push(...added);
    return added.length > 0;
  }

  private saveFailed(error: unknown, kind: 'conflict' | 'request') {
    const retrying = kind === 'conflict' || isRetryableError(error);
    const errorKind: ApiErrorKind = kind === 'conflict' ? 'conflict' : apiErrorKind(error);
    this.setStatus('error', { kind: 'failed', error: errorKind, retrying });
    if (retrying) this.scheduleRetry();
    this.callbacks().onSaveFailed?.(kind, error);
  }

  /** `unchanged`: nothing was edited while the request was out, so the editor shows what the server has. */
  private saved(unchanged: boolean) {
    this.clearRetry();
    this.retryAttempt = 0;
    const issue = this.rejectedIssue();
    this.setStatus(issue ? 'error' : 'saved', issue);
    if (!issue && unchanged) useEditorStore.setState({ isSaved: true });
  }

  private async saveNow(options: SaveOptions): Promise<boolean> {
    if (isAccessRevoked()) return false;
    const current = store().page;
    if (this.holdsPlaceholder()) return true;
    if (current.id.startsWith('page_')) return this.create(current);

    this.setStatus('saving');
    let conflicts = 0;
    let rejections = 0;
    while (conflicts <= MAX_CONFLICT_RETRIES) {
      const page = store().page;
      const base = store().syncBase;
      let sent: Page = page;
      try {
        if (!base) {
          // Editing a local backup: learn the server's version first
          this.mergeRemote(await api.pages.get(this.id()));
          conflicts++;
          continue;
        }
        // Text relayed live by a lock holder is theirs to save, not ours (QA-033)
        const own = withoutRelayedEdits(page, base.page, store().relayedEdits);
        sent = this.outgoing(own, base.page);
        let unchanged = true;
        if (!samePageContent(sent, base.page)) {
          const payload = { ...localPageToApi(sent), version: base.version };
          const updated = await api.pages.update(this.id(), payload, store().myConnectionId, options);
          unchanged = store().page === page;
          if (typeof updated.version === 'number') {
            // The server stored exactly what was sent (ADR-014 keeps block ids)
            store().setSyncBase({ page: apiPageToLocal(updated), version: updated.version });
            applyPublication(updated);
          } else {
            // A response without its version: learn it from the server's current page, merged
            this.mergeRemote(await api.pages.get(this.id()));
          }
        }
        writeBackup(store().page, store().syncBase);
        this.saved(unchanged);
        return this.rejected.length === 0;
      } catch (e) {
        const remote = conflictPage(e);
        if (remote) {
          // Someone saved first: merge their page with ours and try again
          const from = base?.version ?? 0;
          this.mergeRemote(remote);
          this.rememberMerged(from, remote.version);
          conflicts++;
          continue;
        }
        if (rejections < MAX_REJECTION_ROUNDS && this.rememberRefused(e, sent)) {
          // Send the rest of the page without the refused fields
          rejections++;
          continue;
        }
        logSyncError('Failed to save to API:', e);
        writeBackup(store().page, store().syncBase);
        this.saveFailed(e, 'request');
        return false;
      }
    }
    writeBackup(store().page, store().syncBase);
    this.saveFailed(null, 'conflict');
    return false;
  }

  /** First save of a page that only exists in the editor. */
  private async create(page: Page): Promise<boolean> {
    this.setStatus('saving');
    try {
      const created = await api.pages.create(localPageToApi(page));
      const local = apiPageToLocal(created);
      store().setSyncBase({ page: local, version: created.version });
      useEditorStore.setState({ page: local, isSaved: true });
      this.saved(true);
      return true;
    } catch (e) {
      logSyncError('Failed to create page:', e);
      this.saveFailed(e, 'request');
      return false;
    }
  }

  /**
   * Merge the server's page into the editor (no undo step), make it the new
   * base, and report whether the merged page still has changes to save.
   */
  private mergeRemote(remoteApi: ApiPage): boolean {
    const remote = apiPageToLocal(remoteApi);
    const { page, syncBase, relayedEdits } = store();
    const base = syncBase?.page ?? remote;
    // Only our own changes are merged; relayed live text is the holder's (QA-033)
    const own = (p: Page) => withoutRelayedEdits(p, base, relayedEdits);
    const merged = mergePages(base, own(page), remote);
    store().setSyncBase({ page: remote, version: remoteApi.version });
    // Undo snapshots lose blocks deleted elsewhere: undo never resurrects them (QA-034)
    store().applyRemotePage(merged, (snapshot) => rebaseSnapshot(base, own(snapshot), remote));
    return !samePageContent(merged, remote);
  }

  private rememberMerged(from: number, to: number) {
    if (to <= from) return;
    this.mergedRanges = [...this.mergedRanges, [from, to] as [number, number]].slice(-20);
  }

  private mergedThrough409(version: number): boolean {
    return this.mergedRanges.some(([from, to]) => version > from && version <= to);
  }

  /**
   * The server announced a version (page_updated, or `connected` after a
   * reconnect). Fetch and merge it unless it is our own or already known.
   */
  handleRemoteChange(change: RemotePageChange): Promise<void> {
    const own = change.connectionId !== null && change.connectionId === store().myConnectionId;
    if (own) return Promise.resolve();
    return this.enqueue(async () => {
      if (isAccessRevoked()) return;
      const base = store().syncBase;
      if (!base) return;
      const known = change.reason === 'reconnect' ? change.version === base.version : change.version <= base.version;
      if (known) {
        // Already merged by a save's 409: still tell the user (e.g. "X restored a version")
        if (change.reason !== 'reconnect' && this.mergedThrough409(change.version)) {
          this.callbacks().onRemoteMerged?.(change);
        }
        // Back online with changes the server never got: send them now
        if (change.reason === 'reconnect' && this.hasUnsavedChanges()) {
          this.clearRetry();
          void this.save();
        }
        return;
      }
      try {
        const fresh = await api.pages.get(this.id());
        const latest = store().syncBase;
        if (latest && fresh.version === latest.version) return;
        const needsSave = this.mergeRemote(fresh);
        this.callbacks().onRemoteMerged?.(change);
        // Not awaited: the save is queued behind this task
        if (needsSave) void this.save();
      } catch (e) {
        logSyncError('Failed to fetch the updated page:', e);
      }
    });
  }

  /**
   * The server wrote a block itself (AI edit) and bumped the page version
   * (MOBILE2-002). The block goes on screen as one undo step and into the
   * sync base, because the server already has it: the next save is based on
   * the new version, so it neither conflicts nor rebases the undo history
   * onto the new text (which made undoing the edit impossible).
   *
   * When the version is not the next one after the base (someone saved in
   * between, or the response did not say), the page is fetched and merged on
   * top of a base that already holds the block. False when the block type is
   * unknown to this editor (nothing changes).
   */
  adoptServerBlock({ block, pageVersion }: ServerBlockWrite): boolean {
    if (!isBlockType(block.type)) return false;
    const { id, type, data } = block;
    const withServerBlock = (page: Page): Page => ({
      ...page,
      blocks: page.blocks.map((b) => (b.id === id ? makeBlock(b, type, data) : b)),
    });
    const base = store().syncBase;
    if (base && blockById(base.page, id)) {
      const exact = pageVersion !== null && pageVersion === base.version + 1;
      // Already known (a 409 merge brought that version or a later one): the base has it
      const known = pageVersion !== null && pageVersion <= base.version;
      if (!known) {
        // Base first: the edit below is backed up against it
        store().setSyncBase({ page: withServerBlock(base.page), version: exact ? pageVersion : base.version });
      }
      if (!exact && !known) void this.resyncWithServerBlock(withServerBlock);
    }
    return store().replaceBlockData(id, type, data);
  }

  /** Fetch the page after a server write we could not place by version, keeping that write in the base. */
  private resyncWithServerBlock(withServerBlock: (page: Page) => Page): Promise<void> {
    return this.enqueue(async () => {
      if (isAccessRevoked()) return;
      try {
        const fresh = await api.pages.get(this.id());
        const latest = store().syncBase;
        if (!latest) return;
        // A save that finished meanwhile set a base without the block: put it back
        store().setSyncBase({ page: withServerBlock(latest.page), version: latest.version });
        if (fresh.version === latest.version) return;
        const needsSave = this.mergeRemote(fresh);
        // Not awaited: the save is queued behind this task
        if (needsSave) void this.save();
      } catch (e) {
        logSyncError('Failed to fetch the page after an AI edit:', e);
      }
    });
  }

  /** Restore a version for everyone: the editor takes the restored page as is. */
  restoreVersion(versionId: string): Promise<void> {
    return this.enqueue(async () => {
      const restored = await this.withVersion(
        await api.versions.restore(this.id(), versionId, true, store().myConnectionId),
      );
      const page = apiPageToLocal(restored);
      store().setSyncBase({ page, version: restored.version });
      store().loadPage(page);
      this.rejected = [];
      this.setStatus('idle', null);
    });
  }

  /** `apiPage`, or the page fetched again when a response came without its version. */
  private async withVersion(apiPage: ApiPage): Promise<ApiPage> {
    return typeof apiPage.version === 'number' ? apiPage : api.pages.get(this.id());
  }

  /** Save the draft, then freeze it as the public page (ADR-017). False when either step failed. */
  async publish(): Promise<boolean> {
    if (store().page.id.startsWith('page_')) return false;
    const saved = await this.save();
    if (!saved) return false;
    return this.changePublication(() => api.pages.publish(this.id(), store().myConnectionId), 'Failed to publish:');
  }

  /** Take the public copy offline. Rejects nothing: false when the server refused. */
  unpublish(): Promise<boolean> {
    if (store().page.id.startsWith('page_')) return Promise.resolve(false);
    return this.changePublication(() => api.pages.unpublish(this.id(), store().myConnectionId), 'Failed to unpublish:');
  }

  private changePublication(request: () => Promise<ApiPage>, logMessage: string): Promise<boolean> {
    return this.enqueue(async () => {
      try {
        const page = await this.withVersion(await request());
        this.lastPublicationError = null;
        // The change bumps the version; anything else in the response is merged, never taken blindly
        const needsSave = this.mergeRemote(page);
        if (needsSave) void this.save();
        return true;
      } catch (e) {
        logSyncError(logMessage, e);
        this.lastPublicationError = e;
        return false;
      }
    });
  }
}

/**
 * Put a block the server already wrote (AI edit) into the open editor and its
 * sync base (MOBILE2-002). Without an open editor it is a plain edit. False
 * when the block type is unknown.
 */
export function adoptServerBlock(write: ServerBlockWrite): boolean {
  const active = [...startedControllers].pop();
  if (active) return active.adoptServerBlock(write);
  return store().replaceBlockData(write.block.id, write.block.type, write.block.data);
}

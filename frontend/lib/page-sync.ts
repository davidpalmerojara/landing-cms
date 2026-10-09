/**
 * Keeps the editor's page in sync with the server (S10 contract).
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
 * Framework-free: the usePageSync hook owns one controller per page.
 */
import { api, conflictPage } from '@/lib/api';
import type { ApiPage } from '@/lib/api';
import { apiPageToLocal, localPageToApi } from '@/lib/page-mapping';
import { mergePages, samePageContent } from '@/lib/page-merge';
import { logSyncError, writeBackup } from '@/lib/page-backup';
import { useEditorStore } from '@/store/editor-store';
import type { Page } from '@/types/page';

/** Merges and retries after a 409 before giving up on a save. */
export const MAX_CONFLICT_RETRIES = 3;

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

export interface PageSyncCallbacks {
  /** A change made elsewhere was merged into the editor. */
  onRemoteMerged?: (change: RemotePageChange) => void;
  /** A save failed: `conflict` after MAX_CONFLICT_RETRIES merges, `request` for any other error. */
  onSaveFailed?: (kind: 'conflict' | 'request', error: unknown) => void;
}

const store = () => useEditorStore.getState();

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

export class PageSyncController {
  private tail: Promise<unknown> = Promise.resolve();
  private queuedSave: Promise<boolean> | null = null;

  /** `pageId` empty: the page in the editor (loaded without an id in the URL). */
  constructor(
    private readonly pageId: string,
    private readonly callbacks: () => PageSyncCallbacks = () => ({}),
  ) {}

  private id(): string {
    return this.pageId || store().page.id;
  }

  /** Runs `task` after every task queued before it. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task);
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** `apiPage`, or the page fetched again when a response came without its version. */
  private async withVersion(apiPage: ApiPage): Promise<ApiPage> {
    return typeof apiPage.version === 'number' ? apiPage : api.pages.get(this.id());
  }

  /** Fetch the page and make it the editor's page and the sync base. */
  load(fetchPage: () => Promise<ApiPage>): Promise<void> {
    return this.enqueue(async () => {
      const apiPage = await fetchPage();
      const page = apiPageToLocal(apiPage);
      store().setSyncBase({ page, version: apiPage.version });
      store().loadPage(page);
    });
  }

  /**
   * Save the editor's page. Calls made while a save waits to start share it
   * (it sends the latest state), so at most one PUT is in flight and one waits.
   */
  save(): Promise<boolean> {
    if (this.queuedSave) return this.queuedSave;
    const run = this.enqueue(() => {
      this.queuedSave = null;
      return this.saveNow();
    });
    this.queuedSave = run;
    return run;
  }

  private async saveNow(): Promise<boolean> {
    const current = store().page;
    if (current.id.startsWith('page_')) return this.create(current);

    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      const page = store().page;
      const base = store().syncBase;
      try {
        if (!base) {
          // Editing a local backup: learn the server's version first
          this.mergeRemote(await api.pages.get(this.id()));
          continue;
        }
        if (samePageContent(page, base.page)) {
          useEditorStore.setState({ isSaved: true });
          return true;
        }
        const payload = { ...localPageToApi(page), version: base.version };
        const updated = await api.pages.update(this.id(), payload, store().myConnectionId);
        const unchanged = store().page === page;
        if (typeof updated.version === 'number') {
          // The server stored exactly what was sent (ADR-014 keeps block ids)
          store().setSyncBase({ page: apiPageToLocal(updated), version: updated.version });
          applyPublication(updated);
        } else {
          // A response without its version: learn it from the server's current page, merged
          this.mergeRemote(await api.pages.get(this.id()));
        }
        if (unchanged) useEditorStore.setState({ isSaved: true });
        writeBackup(store().page);
        return true;
      } catch (e) {
        const remote = conflictPage(e);
        if (!remote) {
          logSyncError('Failed to save to API:', e);
          writeBackup(store().page);
          this.callbacks().onSaveFailed?.('request', e);
          return false;
        }
        // Someone saved first: merge their page with ours and try again
        this.mergeRemote(remote);
      }
    }
    this.callbacks().onSaveFailed?.('conflict', null);
    return false;
  }

  /** First save of a page that only exists in the editor. */
  private async create(page: Page): Promise<boolean> {
    try {
      const created = await api.pages.create(localPageToApi(page));
      const local = apiPageToLocal(created);
      store().setSyncBase({ page: local, version: created.version });
      useEditorStore.setState({ page: local, isSaved: true });
      return true;
    } catch (e) {
      logSyncError('Failed to create page:', e);
      writeBackup(page);
      this.callbacks().onSaveFailed?.('request', e);
      return false;
    }
  }

  /**
   * Merge the server's page into the editor (no undo step), make it the new
   * base, and report whether the merged page still has changes to save.
   */
  private mergeRemote(remoteApi: ApiPage): boolean {
    const remote = apiPageToLocal(remoteApi);
    const { page: local, syncBase } = store();
    const base = syncBase?.page ?? remote;
    const merged = mergePages(base, local, remote);
    store().setSyncBase({ page: remote, version: remoteApi.version });
    store().applyRemotePage(merged, (snapshot) => mergePages(base, snapshot, remote));
    return !samePageContent(merged, remote);
  }

  /**
   * The server announced a version (page_updated, or `connected` after a
   * reconnect). Fetch and merge it unless it is our own or already known.
   */
  handleRemoteChange(change: RemotePageChange): Promise<void> {
    const own = change.connectionId !== null && change.connectionId === store().myConnectionId;
    if (own) return Promise.resolve();
    return this.enqueue(async () => {
      const base = store().syncBase;
      if (!base) return;
      const known = change.reason === 'reconnect' ? change.version === base.version : change.version <= base.version;
      if (known) return;
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

  /** Restore a version for everyone: the editor takes the restored page as is. */
  restoreVersion(versionId: string): Promise<void> {
    return this.enqueue(async () => {
      const restored = await this.withVersion(
        await api.versions.restore(this.id(), versionId, true, store().myConnectionId),
      );
      const page = apiPageToLocal(restored);
      store().setSyncBase({ page, version: restored.version });
      store().loadPage(page);
    });
  }

  /** Save the draft, then freeze it as the public page (ADR-017). */
  async publish(): Promise<boolean> {
    if (store().page.id.startsWith('page_')) return false;
    const saved = await this.save();
    if (!saved) return false;
    return this.enqueue(async () => {
      try {
        const published = await this.withVersion(await api.pages.publish(this.id(), store().myConnectionId));
        // Publishing bumps the version; anything else in the response is merged, never taken blindly
        const needsSave = this.mergeRemote(published);
        if (needsSave) void this.save();
        return true;
      } catch (e) {
        logSyncError('Failed to publish:', e);
        return false;
      }
    });
  }
}

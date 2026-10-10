/**
 * The store's side of real-time collaboration: block locks are enforced on
 * every path (QA-011), live relays keep the undo history (QA-032) and stay out
 * of what this editor saves (QA-033), and a revoked editor is read-only (QA-110).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEditorStore } from '@/store/editor-store';
import type { PresenceEntry } from '@/store/editor-store';
import { getAtPath } from '@/lib/block-data';
import { withoutRelayedEdits } from '@/lib/page-merge';
import { makeBlock, makePage, resetEditorStore } from '../mobile-editor/test-utils';

const HERO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CTA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const me: PresenceEntry = { connectionId: 'conn-me', userId: 'u-me', username: 'yo' };
const ana: PresenceEntry = { connectionId: 'conn-ana', userId: 'u-ana', username: 'Ana' };

const state = () => useEditorStore.getState();
const field = (blockId: string, key: string) =>
  getAtPath(state().page.blocks.find((b) => b.id === blockId)?.data ?? {}, [key]);

function startPage() {
  const page = makePage([
    makeBlock('hero', { title: 'T0', buttonText: 'B0', badgeText: 'G0' }, { id: HERO }),
    makeBlock('cta', { title: 'C0' }, { id: CTA }),
  ]);
  resetEditorStore(page);
  useEditorStore.setState({ myConnectionId: me.connectionId, myUserId: me.userId, syncBase: { page, version: 1 } });
}

describe('editor store: collaboration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    startPage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('QA-011: a block held by another connection', () => {
    beforeEach(() => {
      useEditorStore.setState({ blockLocks: { [HERO]: ana } });
    });

    it('cannot be selected from any path, and the refusal is recorded for the user', () => {
      expect(state().selectBlock(HERO)).toBe(false);

      expect(state().selectedBlockId).toBeNull();
      expect(state().lockRefusal).toEqual({ blockId: HERO, holder: ana, seq: 1 });

      // Refusing again is a new refusal (the user is told again)
      state().selectBlock(HERO);
      expect(state().lockRefusal?.seq).toBe(2);
    });

    it('cannot be deleted: no confirmation is asked', () => {
      expect(state().requestDeleteBlock(HERO)).toBe(false);
      expect(state().pendingDeleteBlockId).toBeNull();

      state().deleteBlock(HERO);
      expect(state().page.blocks).toHaveLength(2);
    });

    it('a delete confirmed after someone took the block is refused', () => {
      useEditorStore.setState({ blockLocks: {} });
      expect(state().requestDeleteBlock(HERO)).toBe(true);
      useEditorStore.setState({ blockLocks: { [HERO]: ana } });

      state().confirmDeleteBlock();

      expect(state().page.blocks.map((b) => b.id)).toEqual([HERO, CTA]);
      expect(state().pendingDeleteBlockId).toBeNull();
      expect(state().lockRefusal?.blockId).toBe(HERO);
    });

    it('a field still pointing at it changes nothing', () => {
      state().updateBlock(HERO, 'title', 'Overwritten');
      state().updateBlockStyle(HERO, 'paddingTop', 4);

      expect(field(HERO, 'title')).toBe('T0');
      expect(state().past).toEqual([]);
    });

    it('other blocks, and blocks held by this same connection, work as before', () => {
      expect(state().selectBlock(CTA)).toBe(true);
      expect(state().selectedBlockId).toBe(CTA);

      useEditorStore.setState({ blockLocks: { [HERO]: me } });
      expect(state().selectBlock(HERO)).toBe(true);
      state().updateBlock(HERO, 'title', 'Mine');
      expect(field(HERO, 'title')).toBe('Mine');
      expect(state().lockRefusal).toBeNull();
    });

    it('another tab of the same person is another connection', () => {
      useEditorStore.setState({ blockLocks: { [HERO]: { ...me, connectionId: 'conn-me-2' } } });
      expect(state().selectBlock(HERO)).toBe(false);
    });

    it('clearing the selection always works', () => {
      expect(state().selectBlock(null)).toBe(true);
    });
  });

  describe('QA-032: live relays and the undo history', () => {
    it('undo reverts my own edits of a block someone else then edited live, and keeps theirs', () => {
      state().updateBlock(HERO, 'title', 'OWN-TITLE');
      state().updateBlock(HERO, 'buttonText', 'OWN-BTN');
      // Ana selects the hero and changes the badge: her relay is her whole block
      const theirs = { ...state().page.blocks[0].data, badgeText: 'ANA-BADGE' };
      state().applyRemoteBlockUpdate(HERO, theirs, undefined, ana.connectionId);

      state().undo();
      state().undo();

      expect(field(HERO, 'title')).toBe('T0');
      expect(field(HERO, 'buttonText')).toBe('B0');
      expect(field(HERO, 'badgeText')).toBe('ANA-BADGE');
    });

    it('redo keeps the relayed field too', () => {
      state().updateBlock(HERO, 'title', 'OWN');
      state().undo();
      state().applyRemoteBlockUpdate(HERO, { ...state().page.blocks[0].data, badgeText: 'ANA' }, undefined, ana.connectionId);

      state().redo();

      expect(field(HERO, 'title')).toBe('OWN');
      expect(field(HERO, 'badgeText')).toBe('ANA');
    });
  });

  describe('QA-033: relayed text is not this editor\'s to save', () => {
    it('stays out of the sync base and is recorded as relayed', () => {
      state().applyRemoteBlockUpdate(CTA, { title: 'GHOST' }, undefined, ana.connectionId);

      expect(field(CTA, 'title')).toBe('GHOST');
      const base = state().syncBase?.page.blocks.find((b) => b.id === CTA);
      expect(getAtPath(base?.data ?? {}, ['title'])).toBe('C0');
      expect(state().relayedEdits[CTA]).toEqual({ connectionId: ana.connectionId, data: { title: 'GHOST' } });

      // What this editor would save has the server's value
      const own = withoutRelayedEdits(state().page, state().syncBase!.page, state().relayedEdits);
      expect(getAtPath(own.blocks[1].data, ['title'])).toBe('C0');
    });

    it('the text of someone who left without saving disappears', () => {
      useEditorStore.setState({ presence: [me, ana] });
      state().applyRemoteBlockUpdate(CTA, { title: 'GHOST' }, undefined, ana.connectionId);

      state().removePresence(ana.connectionId);

      expect(field(CTA, 'title')).toBe('C0');
      expect(state().relayedEdits).toEqual({});
    });

    it('a merge keeps the live text while its author still holds the block, and drops it once released', () => {
      useEditorStore.setState({ blockLocks: { [CTA]: ana } });
      state().applyRemoteBlockUpdate(CTA, { title: 'TYPING' }, undefined, ana.connectionId);

      state().applyRemotePage(state().syncBase!.page);
      expect(field(CTA, 'title')).toBe('TYPING');

      useEditorStore.setState({ blockLocks: {} });
      state().applyRemotePage(state().syncBase!.page);
      expect(field(CTA, 'title')).toBe('C0');
      expect(state().relayedEdits).toEqual({});
    });
  });

  describe('QA-110: after access is revoked', () => {
    it('the editor is read-only and nothing stays selected', () => {
      state().selectBlock(HERO);
      state().updateBlock(HERO, 'title', 'Before');

      state().setAccessRevoked('unshared');

      expect(state().selectedBlockId).toBeNull();
      expect(state().selectBlock(CTA)).toBe(false);
      state().updateBlock(HERO, 'title', 'After');
      state().addBlock('cta', 'CTA', null, { title: 'New' });
      state().undo();
      expect(field(HERO, 'title')).toBe('Before');
      expect(state().page.blocks).toHaveLength(2);
      expect(state().revokedReason).toBe('unshared');
    });

    it('remembers when the page was deleted', () => {
      state().setAccessRevoked('deleted');
      expect(state().collabStatus).toBe('revoked');
      expect(state().revokedReason).toBe('deleted');

      state().setCollabStatus('idle');
      expect(state().revokedReason).toBeNull();
    });
  });
});

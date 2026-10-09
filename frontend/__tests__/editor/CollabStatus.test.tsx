import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import ConnectionIndicator from '@/components/editor/ConnectionIndicator';
import AccessRevokedBanner from '@/components/editor/AccessRevokedBanner';
import { useEditorStore } from '@/store/editor-store';
import type { CollabStatus } from '@/store/editor-store';
import { render, resetEditorStore } from '../mobile-editor/test-utils';
import type { RenderResult } from '../mobile-editor/test-utils';

function show(status: CollabStatus) {
  act(() => { useEditorStore.getState().setCollabStatus(status); });
}

describe('collaboration status UI', () => {
  let view: RenderResult;

  beforeEach(() => {
    resetEditorStore();
    view = render(<><ConnectionIndicator /><AccessRevokedBanner /></>);
  });

  afterEach(() => view.unmount());

  it('says nothing while connected, idle or without the plan', () => {
    for (const status of ['idle', 'connecting', 'connected', 'unavailable'] as const) {
      show(status);
      expect(view.container.querySelector('[role="status"]')?.textContent).toBe('');
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
    }
  });

  it('announces reconnecting and giving up in a live region', () => {
    show('reconnecting');
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Reconectando…');

    show('offline');
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('Sin tiempo real');
  });

  it('tells the user access was revoked, with a way out', () => {
    show('revoked');

    const alert = view.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Ya no tienes acceso a esta página');
    expect(alert?.querySelector('a[href="/dashboard"]')).not.toBeNull();
  });
});

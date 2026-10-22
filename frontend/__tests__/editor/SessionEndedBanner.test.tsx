/** UX-012: when the session ends mid-edit, the save banner says how to sign in again. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { SaveIssueBanner } from '@/components/editor/SaveStatusIndicator';
import { useEditorStore } from '@/store/editor-store';
import type { SaveIssue } from '@/lib/page-sync';
import { makeBlock, makePage, render, resetEditorStore } from '../mobile-editor/test-utils';
import type { RenderResult } from '../mobile-editor/test-utils';

const PAGE_ID = '11111111-1111-4111-8111-111111111111';
let view: RenderResult;

function showIssue(issue: SaveIssue) {
  act(() => { useEditorStore.setState({ autoSaveStatus: 'error', saveIssue: issue }); });
}

beforeEach(() => {
  resetEditorStore(makePage([makeBlock('hero', { title: 'Hola' })], { id: PAGE_ID }));
  view = render(<SaveIssueBanner onRetry={vi.fn()} onShowField={vi.fn()} />);
});

afterEach(() => view.unmount());

describe('save banner when the session ended', () => {
  it('offers to sign in again in a new tab, which comes back to this page', () => {
    showIssue({ kind: 'failed', error: 'session', retrying: false });

    const link = view.container.querySelector<HTMLAnchorElement>('a[href^="/login"]');
    expect(link?.textContent).toContain('Iniciar sesión');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');
    expect(decodeURIComponent(link?.getAttribute('href') ?? '')).toBe(`/login?next=/editor/${PAGE_ID}`);
  });

  it('other save problems have no sign-in link', () => {
    showIssue({ kind: 'failed', error: 'server', retrying: true });
    expect(view.container.querySelector('a[href^="/login"]')).toBeNull();
  });
});

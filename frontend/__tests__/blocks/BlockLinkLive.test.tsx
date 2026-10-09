import { describe, it, expect } from 'vitest';
import { act } from 'react';
import BlockLink from '@/components/blocks/BlockLink';
import { LiveLinksProvider } from '@/components/blocks/live-links-context';
import { render } from '../mobile-editor/test-utils';

function clickAndReport(anchor: HTMLAnchorElement): boolean {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => { anchor.dispatchEvent(event); });
  return event.defaultPrevented;
}

describe('BlockLink navigation', () => {
  it('does not navigate inside the editor previews, but shows the target', () => {
    const view = render(<BlockLink href="/precios">Ver precios</BlockLink>);
    const a = view.container.querySelector('a')!;

    expect(a.getAttribute('href')).toBe('/precios');
    expect(clickAndReport(a)).toBe(true);
    view.unmount();
  });

  it('navigates on the public page and the standalone preview', () => {
    const view = render(
      <LiveLinksProvider value>
        <BlockLink href="https://example.com/">Ir</BlockLink>
      </LiveLinksProvider>,
    );
    const a = view.container.querySelector('a')!;

    expect(clickAndReport(a)).toBe(false);
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    view.unmount();
  });
});

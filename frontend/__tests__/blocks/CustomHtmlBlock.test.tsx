import { describe, it, expect } from 'vitest';
import CustomHtmlBlock, { CUSTOM_HTML_SANDBOX } from '@/components/blocks/CustomHtmlBlock';
import { render } from '../mobile-editor/test-utils';

const evil = '<p>Hola</p><img src=x onerror="alert(1)"><script>alert(2)</script>';

describe('CustomHtmlBlock', () => {
  it('renders user HTML inside a sandboxed iframe, never into the page DOM', () => {
    const view = render(<CustomHtmlBlock blockId="b1" data={{ html: evil }} isPreviewMode />);

    const frame = view.container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame!.getAttribute('sandbox')).toBe(CUSTOM_HTML_SANDBOX);
    expect(frame!.getAttribute('srcdoc')).toContain('<p>Hola</p>');
    // Nothing from the user HTML is part of the host document
    expect(view.container.querySelector('img, script')).toBeNull();
    view.unmount();
  });

  it('never allows scripts in the sandbox', () => {
    expect(CUSTOM_HTML_SANDBOX.split(' ')).not.toContain('allow-scripts');
  });

  it('shows the source as text in the editor', () => {
    const view = render(<CustomHtmlBlock blockId="b1" data={{ html: evil }} isPreviewMode={false} />);
    expect(view.container.querySelector('iframe, img, script')).toBeNull();
    expect(view.container.textContent).toContain('<script>alert(2)</script>');
    view.unmount();
  });
});

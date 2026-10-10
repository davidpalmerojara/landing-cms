import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(join(process.cwd(), 'public', 'bp-analytics.js'), 'utf8');

/** Runs the published-page script as the browser would, with its <script> attributes. */
function runScript() {
  const script = document.createElement('script');
  script.setAttribute('data-page-id', 'page-1');
  script.setAttribute('data-api-url', '/api');
  Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script });
  new Function(source)();
}

function clickInBlock() {
  const block = document.createElement('div');
  block.dataset.blockId = 'b1';
  block.dataset.blockType = 'features';
  const link = document.createElement('a');
  link.setAttribute('href', '#x');
  block.appendChild(link);
  document.body.appendChild(block);
  link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  block.remove();
}

describe('bp-analytics.js batching (QA-119)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends a batch 10 s after its first event, even if more events keep coming', () => {
    vi.useFakeTimers();
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beacon });
    runScript(); // pageview at 0 s

    vi.advanceTimersByTime(6000);
    clickInBlock(); // a second event at 6 s, below the batch size
    vi.advanceTimersByTime(4100);

    // Before the fix each event restarted the 10 s wait: nothing would be sent until 16 s
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});

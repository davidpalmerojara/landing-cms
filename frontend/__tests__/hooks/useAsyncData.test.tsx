import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useCallback, useEffect } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { AsyncData } from '@/hooks/useAsyncData';
import { render, type RenderResult } from '../mobile-editor/test-utils';

let latest: AsyncData<string>;
let view: RenderResult;

function Harness({ loader, id }: { loader: (id: string) => Promise<string>; id: string }) {
  const load = useCallback(() => loader(id), [loader, id]);
  const result = useAsyncData(load);
  useEffect(() => {
    latest = result;
  });
  return null;
}

async function mount(loader: (id: string) => Promise<string>, id = 'a') {
  await act(async () => {
    view = render(<Harness loader={loader} id={id} />);
  });
}

afterEach(() => {
  view.unmount();
});

describe('useAsyncData', () => {
  it('is loading until the loader answers, then gives the data', async () => {
    let answer: (value: string) => void = () => undefined;
    const loader = vi.fn(() => new Promise<string>((resolve) => { answer = resolve; }));

    await mount(loader);
    expect(latest.isLoading).toBe(true);
    expect(latest.data).toBeNull();

    await act(async () => answer('hello'));

    expect(latest.isLoading).toBe(false);
    expect(latest.data).toBe('hello');
    expect(latest.hasError).toBe(false);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reports a failure with what was thrown', async () => {
    const failure = new Error('nope');

    await mount(() => Promise.reject(failure));

    expect(latest.hasError).toBe(true);
    expect(latest.error).toBe(failure);
    expect(latest.isLoading).toBe(false);
    expect(latest.data).toBeNull();
  });

  it('keeps the data on screen while reloading, and forgets a failure once it retries', async () => {
    const loader = vi.fn<(id: string) => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('later failure'))
      .mockResolvedValueOnce('third');
    await mount(loader);

    await act(async () => latest.reload());
    expect(latest.hasError).toBe(true);
    expect(latest.data).toBe('first');

    act(() => latest.reload());
    expect(latest.isLoading).toBe(true);
    expect(latest.hasError).toBe(false);
    expect(latest.data).toBe('first');
    await act(async () => {});

    expect(latest.data).toBe('third');
    expect(latest.hasError).toBe(false);
  });

  it('drops the old data when the loader changes (a different id)', async () => {
    const loader = vi.fn((id: string) => Promise.resolve(`data of ${id}`));
    await mount(loader, 'a');
    expect(latest.data).toBe('data of a');

    await act(async () => {
      view.rerender(<Harness loader={loader} id="b" />);
    });

    expect(latest.data).toBe('data of b');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('shows nothing of the previous id while the next one loads', async () => {
    let answer: (value: string) => void = () => undefined;
    const loader = vi.fn((id: string) => (id === 'a' ? Promise.resolve('data of a') : new Promise<string>((resolve) => { answer = resolve; })));
    await mount(loader, 'a');

    await act(async () => {
      view.rerender(<Harness loader={loader} id="b" />);
    });

    expect(latest.isLoading).toBe(true);
    expect(latest.data).toBeNull();
    await act(async () => answer('data of b'));
    expect(latest.data).toBe('data of b');
  });

  it('ignores the answer of a request that is no longer wanted', async () => {
    const answers: Record<string, (value: string) => void> = {};
    const loader = vi.fn((id: string) => new Promise<string>((resolve) => { answers[id] = resolve; }));
    await mount(loader, 'a');
    await act(async () => {
      view.rerender(<Harness loader={loader} id="b" />);
    });

    await act(async () => answers.a('late answer of a'));
    expect(latest.data).toBeNull();

    await act(async () => answers.b('answer of b'));
    expect(latest.data).toBe('answer of b');
  });

  it('does not set state after unmounting', async () => {
    let answer: (value: string) => void = () => undefined;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await mount(() => new Promise<string>((resolve) => { answer = resolve; }));

    view.unmount();
    await act(async () => answer('too late'));

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    view = render(<Harness loader={() => Promise.resolve('x')} id="a" />);
  });

  it('applies a local change to the loaded data', async () => {
    await mount(() => Promise.resolve('abc'));

    act(() => latest.update((current) => `${current}!`));

    expect(latest.data).toBe('abc!');
  });

  it('ignores a local change before anything has loaded', async () => {
    await mount(() => new Promise<string>(() => undefined));

    act(() => latest.update((current) => `${current}!`));

    expect(latest.data).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '@/lib/i18n';
import { act } from 'react';
import AnalyticsPanel from '@/components/analytics/AnalyticsPanel';
import ScrollFunnel from '@/components/analytics/ScrollFunnel';
import ChartFrame from '@/components/analytics/ChartFrame';
import { api, ApiError } from '@/lib/api';
import { render, type RenderResult } from '../mobile-editor/test-utils';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

let view: RenderResult;

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('analytics panel', () => {
  it('QA-044: on a plan without analytics it explains the plan, not "publish the page"', async () => {
    vi.spyOn(api.analytics, 'get').mockRejectedValue(new ApiError(403, '{"error":"plan_limit","detail":"Pro"}'));
    vi.spyOn(api.features, 'get').mockResolvedValue({ custom_domains: false, billing: false });
    await act(async () => {
      view = render(<AnalyticsPanel pageId="p1" pageStatus="draft" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(view.container.textContent).toContain('Analítica avanzada');
    expect(view.container.textContent).not.toContain('Publica la página');
  });

  it('a failed load shows a translated message, never the raw server answer', async () => {
    vi.spyOn(api.analytics, 'get').mockRejectedValue(new ApiError(500, '{"error":"Traceback..."}'));
    await act(async () => {
      view = render(<AnalyticsPanel pageId="p1" pageStatus="published" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const alert = view.container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).not.toContain('Traceback');
  });
});

describe('analytics charts (QA-087)', () => {
  it('a chart is drawn only once its box has a size (no width(-1) warnings)', () => {
    let report: ((entries: Array<{ contentRect: { width: number; height: number } }>) => void) | null = null;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: typeof report) { report = callback; }
      observe() {}
      disconnect() {}
    });
    const draw = vi.fn(() => <span data-testid="chart" />);
    view = render(<ChartFrame className="h-48">{draw}</ChartFrame>);
    expect(draw).not.toHaveBeenCalled();

    act(() => report?.([{ contentRect: { width: 0, height: 192 } }]));
    expect(draw).not.toHaveBeenCalled();
    act(() => report?.([{ contentRect: { width: 320, height: 192 } }]));
    expect(draw).toHaveBeenCalledWith({ width: 320, height: 192 });
  });

  it('the scroll funnel says what its red figures mean', () => {
    view = render(<ScrollFunnel data={{ 25: 0, 50: 0, 75: 0, 100: 0 }} totalPageviews={2} />);
    expect(view.container.textContent).toContain('se pierden respecto al paso anterior');
    expect(view.container.querySelector('.sr-only')?.textContent).toBe('El 100 % no llega desde el paso anterior');
  });
});

describe('analytics labels in Spanish (EDITOR2-008)', () => {
  it('no English left in the metrics and the scroll funnel', () => {
    expect(MESSAGES.es.analytics.metricBounce).toBe('Tasa de rebote');
    expect(MESSAGES.es.analytics.pageviewsStep).toBe('Visitas a la página');
  });
});

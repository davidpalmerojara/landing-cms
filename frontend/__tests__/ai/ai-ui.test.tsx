import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import AIGenerateModal from '@/components/dashboard/AIGenerateModal';
import AIBlockEditPopover from '@/components/editor/AIBlockEditPopover';
import AiSavedAnswerNotice from '@/components/ai/AiSavedAnswerNotice';
import AiSuggestions from '@/components/ai/AiSuggestions';
import { api } from '@/lib/api';
import type { AiGenerateResponse, AiEditBlockResponse, AiOptions, AiPromptSuggestion } from '@/lib/api';
import { MESSAGES, type AppLocale } from '@/lib/i18n';
import { useEditorStore } from '@/store/editor-store';
import { click, makeBlock, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

const PROMPTS: AiPromptSuggestion[] = [
  { id: 'restaurant', title: 'Restaurante mediterráneo', prompt: 'Landing para Casa Olivar, un restaurante', language: 'es' },
  { id: 'conference', title: 'Conference or event', prompt: 'Website for DevNorth 2027', language: 'en' },
];

const DEMO_OPTIONS: AiOptions = { mode: 'demo', live_user_daily_limit: 2, prompts: PROMPTS };

const TOKENS = { input: 0, output: 0, cost_estimate: '0' };

function generated(overrides: Partial<AiGenerateResponse>): AiGenerateResponse {
  return { page_id: 'p1', block_count: 7, blocks: [], source: 'demo', provider: null, tokens: TOKENS, ...overrides };
}

function renderIn(locale: AppLocale, ui: ReactElement): RenderResult {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {ui}
      </NextIntlClientProvider>,
    );
  });
  return {
    container,
    rerender: () => undefined,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Types into a controlled React input the way a user would. */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setValue) throw new Error('no value setter');
  act(() => {
    setValue.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

describe('AiSuggestions', () => {
  let view: RenderResult;
  afterEach(() => view.unmount());

  it('shows one chip per saved prompt, in a labelled group', () => {
    view = render(<AiSuggestions prompts={PROMPTS} onPick={() => undefined} />);
    const group = view.container.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(group?.textContent).toContain('Ejemplos para probar');
    const chips = Array.from(view.container.querySelectorAll('button')).map((b) => b.textContent);
    expect(chips).toEqual(['Restaurante mediterráneo', 'Conference or event']);
  });

  it('hands the picked suggestion to the parent', () => {
    const onPick = vi.fn();
    view = render(<AiSuggestions prompts={PROMPTS} onPick={onPick} />);
    click(buttonByText(view.container, 'Conference or event'));
    expect(onPick).toHaveBeenCalledWith(PROMPTS[1]);
  });

  it('renders nothing without suggestions', () => {
    view = render(<AiSuggestions prompts={[]} onPick={() => undefined} />);
    expect(view.container.innerHTML).toBe('');
  });
});

describe('AiSavedAnswerNotice', () => {
  let view: RenderResult;
  afterEach(() => view.unmount());

  it('labels a saved page in Spanish', () => {
    view = renderIn('es', <AiSavedAnswerNotice kind="page" source="demo" demo={{ reason: 'demo_mode', origin: 'generated', matched: true }} />);
    const notice = view.container.querySelector('[role="status"]');
    expect(notice?.textContent).toBe('Respuesta de demo cacheada: generada una vez con IA y guardada.');
  });

  it('labels a saved page in English', () => {
    view = renderIn('en', <AiSavedAnswerNotice kind="page" source="demo" demo={{ reason: 'demo_mode', origin: 'generated', matched: true }} />);
    expect(view.container.textContent).toBe('Cached demo response: generated once with AI and saved.');
  });

  it('explains the daily limit and the exhausted quota', () => {
    view = renderIn('es', <AiSavedAnswerNotice kind="page" source="demo" demo={{ reason: 'daily_limit' }} />);
    expect(view.container.textContent).toBe('Se ha alcanzado el límite diario de la demo: esta es una respuesta guardada.');
    view.unmount();
    view = renderIn('es', <AiSavedAnswerNotice kind="page" source="demo" demo={{ reason: 'provider_quota' }} />);
    expect(view.container.textContent).toContain('ha agotado su cuota');
  });

  it('adds that no example matched when the page was a fallback', () => {
    view = renderIn('es', <AiSavedAnswerNotice kind="page" source="demo" demo={{ reason: 'demo_mode', matched: false }} />);
    expect(view.container.querySelectorAll('p')).toHaveLength(2);
    expect(view.container.textContent).toContain('no coincide con ninguno de los ejemplos');
  });

  it('tells that a block edit in the demo is a saved variant that ignores the instruction', () => {
    view = renderIn('es', <AiSavedAnswerNotice kind="block" source="demo" demo={{ reason: 'demo_mode' }} />);
    expect(view.container.textContent).toBe(
      'En la demo la edición con IA devuelve una variante guardada del bloque y no sigue tu instrucción. Con tu propia clave, sí.',
    );
  });

  it('says nothing about real answers', () => {
    view = render(<AiSavedAnswerNotice kind="page" source="live" />);
    expect(view.container.innerHTML).toBe('');
    view.unmount();
    view = render(<AiSavedAnswerNotice kind="block" source="own_key" />);
    expect(view.container.innerHTML).toBe('');
  });
});

describe('AIGenerateModal', () => {
  let view: RenderResult;
  const onGenerated = vi.fn();

  async function openModal(options: AiOptions = DEMO_OPTIONS) {
    vi.spyOn(api.ai, 'options').mockResolvedValue(options);
    vi.spyOn(api.pages, 'create').mockResolvedValue({ id: 'p1' } as Awaited<ReturnType<typeof api.pages.create>>);
    view = render(<AIGenerateModal open onClose={() => undefined} onGenerated={onGenerated} />);
    await flush();
  }

  const prompt = () => view.container.querySelector<HTMLTextAreaElement>('#ai-prompt')!;

  beforeEach(() => {
    onGenerated.mockReset();
  });

  afterEach(() => {
    view.unmount();
    vi.restoreAllMocks();
  });

  it('offers the saved prompts as chips and fills the description when one is picked', async () => {
    await openModal();
    expect(buttonByText(view.container, 'Restaurante mediterráneo')).toBeTruthy();
    expect(prompt().value).toBe('');

    click(buttonByText(view.container, 'Conference or event'));

    expect(prompt().value).toBe('Website for DevNorth 2027');
    const language = Array.from(view.container.querySelectorAll('select')).find((s) => s.value === 'en');
    expect(language).toBeTruthy();
  });

  it('asks the server for the suggestions in the interface language', async () => {
    await openModal();
    expect(api.ai.options).toHaveBeenCalledWith('es');
  });

  it('shows the demo notice next to the input', async () => {
    await openModal();
    const notice = view.container.querySelector('#ai-mode-notice');
    expect(notice?.textContent).toContain('Modo demo');
    expect(prompt().getAttribute('aria-describedby')).toBe('ai-mode-notice');
  });

  it('tells where the text goes and the daily limit when the server key is live', async () => {
    await openModal({ ...DEMO_OPTIONS, mode: 'live' });
    const text = view.container.querySelector('#ai-mode-notice')?.textContent ?? '';
    expect(text).toContain('Google Gemini');
    expect(text).toContain('No incluyas datos personales');
    expect(text).toContain('2 al día');
  });

  it('labels a saved page and waits for the user before opening the editor', async () => {
    await openModal();
    vi.spyOn(api.ai, 'generate').mockResolvedValue(
      generated({ source: 'demo', demo: { reason: 'demo_mode', origin: 'placeholder', fixture_id: 'restaurant', matched: true } }),
    );
    typeInto(prompt(), 'Un restaurante');

    click(buttonByText(view.container, 'Generar página'));
    await flush();

    expect(view.container.querySelector('[role="status"]')?.textContent)
      .toBe('Página de ejemplo de la demo, escrita a mano: no se ha usado IA. Con tu propia clave, la página se genera a partir de tu texto.');
    expect(onGenerated).not.toHaveBeenCalled();

    click(buttonByText(view.container, 'Abrir en el editor'));
    expect(onGenerated).toHaveBeenCalledWith('p1');
  });

  it('opens the editor straight away for a real generation', async () => {
    await openModal();
    vi.spyOn(api.ai, 'generate').mockResolvedValue(generated({ source: 'live', provider: 'gemini' }));
    typeInto(prompt(), 'Un restaurante');

    click(buttonByText(view.container, 'Generar página'));
    await flush();

    expect(onGenerated).toHaveBeenCalledWith('p1');
    expect(view.container.querySelector('[role="status"]')).toBeNull();
  });

  it('sends the own key with the request when one is typed', async () => {
    await openModal();
    const generate = vi.spyOn(api.ai, 'generate').mockResolvedValue(generated({ source: 'own_key', provider: 'gemini' }));
    typeInto(prompt(), 'Un restaurante');

    click(buttonByText(view.container, 'Usar mi propia clave'));
    typeInto(view.container.querySelector<HTMLInputElement>('input[type="password"]')!, '  AIza-mine ');
    expect(view.container.querySelector('#ai-mode-notice')?.textContent).toContain('con tu clave');

    click(buttonByText(view.container, 'Generar página'));
    await flush();

    expect(generate).toHaveBeenCalledWith('p1', expect.objectContaining({ provider: 'gemini', api_key: 'AIza-mine' }));
  });

  it('does not send a key when none was typed', async () => {
    await openModal();
    const generate = vi.spyOn(api.ai, 'generate').mockResolvedValue(generated({}));
    typeInto(prompt(), 'Un restaurante');

    click(buttonByText(view.container, 'Generar página'));
    await flush();

    const sent = generate.mock.calls[0][1];
    expect('api_key' in sent).toBe(false);
  });

  it('opens the key form and shows the message when the server has no AI for this user', async () => {
    await openModal({ ...DEMO_OPTIONS, mode: 'unavailable' });
    vi.spyOn(api.ai, 'generate').mockRejectedValue(
      new Error('API 400: {"error":"No hay una clave de IA disponible.","code":"AI_NOT_CONFIGURED"}'),
    );
    typeInto(prompt(), 'Un restaurante');

    click(buttonByText(view.container, 'Generar página'));
    await flush();

    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('La IA del servidor no está disponible ahora mismo. Puedes usar tu propia clave.');
    expect(view.container.querySelector('input[type="password"]')).not.toBeNull();
  });
});

describe('AIBlockEditPopover', () => {
  let view: RenderResult;
  const onClose = vi.fn();

  async function openPopover(options: AiOptions = DEMO_OPTIONS) {
    vi.spyOn(api.ai, 'options').mockResolvedValue(options);
    resetEditorStore(makePage([makeBlock('hero', { title: 'Antes' }, { id: 'b1' })]));
    view = render(<AIBlockEditPopover blockId="b1" pageId="page-123" onClose={onClose} />);
    await flush();
  }

  const input = () => view.container.querySelector<HTMLInputElement>('input[type="text"]')!;

  beforeEach(() => {
    onClose.mockReset();
  });

  afterEach(() => {
    view.unmount();
    vi.restoreAllMocks();
  });

  it('warns before sending that the demo ignores the instruction', async () => {
    await openPopover();
    const note = view.container.querySelector('#ai-block-demo-note');
    expect(note?.textContent).toBe(
      'En la demo la edición con IA devuelve una variante guardada del bloque y no sigue tu instrucción. Con tu propia clave, sí.',
    );
    expect(input().getAttribute('aria-describedby')).toBe('ai-block-demo-note');
  });

  it('has no demo warning when the server answers for real', async () => {
    await openPopover({ ...DEMO_OPTIONS, mode: 'live' });
    expect(view.container.querySelector('#ai-block-demo-note')).toBeNull();
  });

  it('applies a saved variant, keeps the popover open and says what it is', async () => {
    await openPopover();
    const response: AiEditBlockResponse = {
      block: { id: 'b1', type: 'hero', order: 0, data: { title: 'Variante guardada' }, styles: {} },
      source: 'demo',
      provider: null,
      demo: { reason: 'demo_mode' },
      tokens: TOKENS,
    };
    const editBlock = vi.spyOn(api.ai, 'editBlock').mockResolvedValue(response);
    typeInto(input(), 'Hazlo más corto');

    click(view.container.querySelector<HTMLButtonElement>('button[aria-label="Enviar instrucción"]')!);
    await flush();

    expect(editBlock).toHaveBeenCalledWith('page-123', 'b1', 'Hazlo más corto', undefined);
    const block = useEditorStore.getState().page.blocks[0];
    expect(block.data).toMatchObject({ title: 'Variante guardada' });
    expect(onClose).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('variante guardada del bloque');

    click(buttonByText(view.container, 'Cerrar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes right after a real edit', async () => {
    await openPopover({ ...DEMO_OPTIONS, mode: 'live' });
    vi.spyOn(api.ai, 'editBlock').mockResolvedValue({
      block: { id: 'b1', type: 'hero', order: 0, data: { title: 'Nuevo' }, styles: {} },
      source: 'live',
      provider: 'gemini',
      tokens: TOKENS,
    });
    typeInto(input(), 'Hazlo más corto');

    click(view.container.querySelector<HTMLButtonElement>('button[aria-label="Enviar instrucción"]')!);
    await flush();

    expect(onClose).toHaveBeenCalled();
  });

  it('shows the translated message when the demo has no variant for the block type', async () => {
    await openPopover();
    vi.spyOn(api.ai, 'editBlock').mockRejectedValue(
      new Error('API 422: {"error":"La demo no tiene una variante guardada","code":"DEMO_NO_VARIANT"}'),
    );
    typeInto(input(), 'Hazlo más corto');

    click(view.container.querySelector<HTMLButtonElement>('button[aria-label="Enviar instrucción"]')!);
    await flush();

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('no tiene una variante guardada para este tipo de bloque');
  });

  describe('quick suggestions', () => {
    const chips = () => Array.from(view.container.querySelectorAll('button')).filter((b) =>
      b.textContent === MESSAGES.es.ai.blockSuggestion3);

    it('are hidden in demo mode, where an instruction cannot be followed', async () => {
      await openPopover();
      expect(chips()).toHaveLength(0);
    });

    it('are offered when the server answers for real', async () => {
      await openPopover({ ...DEMO_OPTIONS, mode: 'live' });
      expect(chips()).toHaveLength(1);
    });

    it('come back in demo mode once the user types an own key', async () => {
      await openPopover();
      click(buttonByText(view.container, 'Usar mi propia clave'));
      typeInto(view.container.querySelector<HTMLInputElement>('input[type="password"]')!, 'AIza-mine');
      expect(chips()).toHaveLength(1);
    });

    it('are offered when the mode could not be fetched', async () => {
      vi.spyOn(api.ai, 'options').mockRejectedValue(new Error('network'));
      resetEditorStore(makePage([makeBlock('hero', { title: 'Antes' }, { id: 'b1' })]));
      view = render(<AIBlockEditPopover blockId="b1" pageId="page-123" onClose={onClose} />);
      await flush();
      expect(chips()).toHaveLength(1);
    });
  });

  it('shows English text for every backend error when the interface is in English', async () => {
    vi.spyOn(api.ai, 'options').mockResolvedValue({ ...DEMO_OPTIONS, mode: 'live' });
    resetEditorStore(makePage([makeBlock('hero', { title: 'Before' }, { id: 'b1' })]));
    view = renderIn('en', <AIBlockEditPopover blockId="b1" pageId="page-123" onClose={onClose} />);
    await flush();
    vi.spyOn(api.ai, 'editBlock').mockRejectedValue(
      new Error('API 502: {"error":"Error al comunicarse con el servicio de IA.","code":"AI_PROVIDER_ERROR"}'),
    );
    typeInto(input(), 'Make it shorter');

    click(view.container.querySelector<HTMLButtonElement>('button[aria-label="Send instruction"]')!);
    await flush();

    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('Could not reach the AI service. Try again or use a template.');
  });

  it('does not show the backend Spanish text for a code it does not know', async () => {
    vi.spyOn(api.ai, 'options').mockResolvedValue({ ...DEMO_OPTIONS, mode: 'live' });
    resetEditorStore(makePage([makeBlock('hero', { title: 'Before' }, { id: 'b1' })]));
    view = renderIn('en', <AIBlockEditPopover blockId="b1" pageId="page-123" onClose={onClose} />);
    await flush();
    vi.spyOn(api.ai, 'editBlock').mockRejectedValue(new Error('API 500: {"error":"Algo raro","code":"SOMETHING_NEW"}'));
    typeInto(input(), 'Make it shorter');

    click(view.container.querySelector<HTMLButtonElement>('button[aria-label="Send instruction"]')!);
    await flush();

    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('Could not edit');
  });

  it('sends the own key and drops the demo warning once one is typed', async () => {
    await openPopover();
    const editBlock = vi.spyOn(api.ai, 'editBlock').mockResolvedValue({
      block: { id: 'b1', type: 'hero', order: 0, data: { title: 'Real' }, styles: {} },
      source: 'own_key',
      provider: 'gemini',
      tokens: TOKENS,
    });
    click(buttonByText(view.container, 'Usar mi propia clave'));
    typeInto(view.container.querySelector<HTMLInputElement>('input[type="password"]')!, 'AIza-mine');
    expect(view.container.querySelector('#ai-block-demo-note')).toBeNull();
    typeInto(input(), 'Hazlo más corto');

    click(view.container.querySelector<HTMLButtonElement>('button[aria-label="Enviar instrucción"]')!);
    await flush();

    expect(editBlock).toHaveBeenCalledWith('page-123', 'b1', 'Hazlo más corto', { provider: 'gemini', api_key: 'AIza-mine' });
  });
});

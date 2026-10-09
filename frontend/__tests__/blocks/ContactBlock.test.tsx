import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import ContactBlock from '@/components/blocks/ContactBlock';
import { ContactFormProvider } from '@/components/blocks/contact-form-context';
import { api, ContactSubmitError } from '@/lib/api';
import { render, type RenderResult } from '../mobile-editor/test-utils';

const BLOCK_ID = '11111111-1111-4111-8111-111111111111';
const data = { title: 'Escríbenos', subtitle: 'Te leemos', buttonText: 'Mandar mensaje' };

function renderBlock(options: { slug: string | null; isPreviewMode?: boolean }): RenderResult {
  return render(
    <ContactFormProvider value={{ slug: options.slug }}>
      <ContactBlock blockId={BLOCK_ID} data={data} isPreviewMode={options.isPreviewMode ?? true} />
    </ContactFormProvider>,
  );
}

function field(container: HTMLElement, name: string): HTMLInputElement | HTMLTextAreaElement {
  const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!el) throw new Error(`No field named ${name}`);
  return el;
}

function fill(container: HTMLElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) field(container, name).value = value;
}

async function submit(container: HTMLElement) {
  const form = container.querySelector('form');
  if (!form) throw new Error('No form');
  await act(async () => {
    form.requestSubmit();
  });
}

const valid = { name: 'Ana', email: 'ana@example.com', message: 'Hola, ¿tenéis hueco en mayo?' };

describe('ContactBlock', () => {
  let view: RenderResult;

  beforeEach(() => {
    vi.spyOn(api.public, 'submitContact').mockResolvedValue(undefined);
  });

  afterEach(() => {
    view.unmount();
    vi.restoreAllMocks();
  });

  describe('in the editor', () => {
    it('keeps the read-only inputs and has no form', () => {
      view = renderBlock({ slug: null, isPreviewMode: false });
      expect(view.container.querySelector('form')).toBeNull();
      const inputs = view.container.querySelectorAll('input, textarea');
      expect(inputs.length).toBe(3);
      inputs.forEach((input) => expect(input.hasAttribute('readonly')).toBe(true));
      expect(view.container.querySelector('[name="website"]')).toBeNull();
    });
  });

  describe('on the published page', () => {
    it('renders a labelled form with required fields', () => {
      view = renderBlock({ slug: 'mi-pagina' });
      const form = view.container.querySelector('form');
      expect(form).not.toBeNull();

      for (const [name, label] of [['name', 'Nombre'], ['email', 'Email'], ['message', 'Mensaje']] as const) {
        const el = field(view.container, name);
        expect(el.required).toBe(true);
        expect(el.hasAttribute('readonly')).toBe(false);
        const labelEl = view.container.querySelector(`label[for="${el.id}"]`);
        expect(labelEl?.textContent).toBe(label);
      }
      expect(field(view.container, 'email').getAttribute('type')).toBe('email');
      expect(view.container.querySelector('button[type="submit"]')?.textContent).toContain('Mandar mensaje');
    });

    it('hides the honeypot from people and assistive tech', () => {
      view = renderBlock({ slug: 'mi-pagina' });
      const honeypot = field(view.container, 'website');
      expect(honeypot.tabIndex).toBe(-1);
      expect(honeypot.getAttribute('autocomplete')).toBe('off');
      expect(honeypot.value).toBe('');
      expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(view.container.querySelector('label[for="' + honeypot.id + '"]')).toBeNull();
    });

    it('sends the values with the page slug and block id, then confirms', async () => {
      view = renderBlock({ slug: 'mi-pagina' });
      fill(view.container, valid);
      await submit(view.container);

      expect(api.public.submitContact).toHaveBeenCalledTimes(1);
      expect(api.public.submitContact).toHaveBeenCalledWith('mi-pagina', { ...valid, website: '', block_id: BLOCK_ID });

      const status = view.container.querySelector('[role="status"]');
      expect(status?.textContent).toContain('Mensaje enviado');
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
      expect(field(view.container, 'name').value).toBe('');
    });

    it('passes along whatever a bot wrote in the honeypot', async () => {
      view = renderBlock({ slug: 'mi-pagina' });
      fill(view.container, { ...valid, website: 'http://spam.example' });
      await submit(view.container);
      expect(api.public.submitContact).toHaveBeenCalledWith('mi-pagina', expect.objectContaining({ website: 'http://spam.example' }));
    });

    it('does not send an incomplete form', async () => {
      view = renderBlock({ slug: 'mi-pagina' });
      fill(view.container, { name: 'Ana', email: 'not-an-email', message: 'Hola' });
      await submit(view.container);
      expect(api.public.submitContact).not.toHaveBeenCalled();
    });

    it('disables the button while sending', async () => {
      let finish: () => void = () => {};
      vi.spyOn(api.public, 'submitContact').mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
      view = renderBlock({ slug: 'mi-pagina' });
      fill(view.container, valid);
      const button = view.container.querySelector<HTMLButtonElement>('button[type="submit"]')!;

      await submit(view.container);
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Enviando');

      // A second submit while the first is in flight is ignored
      await submit(view.container);
      expect(api.public.submitContact).toHaveBeenCalledTimes(1);

      await act(async () => {
        finish();
      });
      expect(button.disabled).toBe(false);
    });

    it.each([
      [400, 'Revisa el nombre'],
      [429, 'Espera un minuto'],
      [404, 'ya no está disponible'],
      [500, 'No hemos podido enviar'],
    ])('shows an inline alert for a %i response and keeps what was typed', async (status, text) => {
      vi.spyOn(api.public, 'submitContact').mockRejectedValue(new ContactSubmitError(status, 'ERROR', 'boom'));
      view = renderBlock({ slug: 'mi-pagina' });
      fill(view.container, valid);
      await submit(view.container);

      const alert = view.container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain(text);
      expect(view.container.querySelector('[role="status"]')?.textContent).toBe('');
      expect(field(view.container, 'name').value).toBe('Ana');
      expect(view.container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    });

    it('shows the generic alert on a network failure', async () => {
      vi.spyOn(api.public, 'submitContact').mockRejectedValue(new TypeError('Failed to fetch'));
      view = renderBlock({ slug: 'mi-pagina' });
      fill(view.container, valid);
      await submit(view.container);
      expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('No hemos podido enviar');
    });
  });

  describe('in the preview (no published page)', () => {
    it('explains that the form only works once published and never sends', async () => {
      view = renderBlock({ slug: null });
      expect(view.container.textContent).toContain('solo envía mensajes desde la página publicada');

      fill(view.container, valid);
      const button = view.container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(button.disabled).toBe(true);
      await submit(view.container);
      expect(api.public.submitContact).not.toHaveBeenCalled();
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import NavbarBlock from '@/components/blocks/NavbarBlock';
import ContactBlock from '@/components/blocks/ContactBlock';
import CustomHtmlBlock from '@/components/blocks/CustomHtmlBlock';
import TeamBlock from '@/components/blocks/TeamBlock';
import HeroBlock from '@/components/blocks/HeroBlock';
import FooterBlock from '@/components/blocks/FooterBlock';
import FaqBlock from '@/components/blocks/FaqBlock';
import StatsBlock from '@/components/blocks/StatsBlock';
import LogoCloudBlock from '@/components/blocks/LogoCloudBlock';
import PricingBlock from '@/components/blocks/PricingBlock';
import CtaBlock from '@/components/blocks/CtaBlock';
import { ContactFormProvider } from '@/components/blocks/contact-form-context';
import { LiveLinksProvider } from '@/components/blocks/live-links-context';
import { api, ContactSubmitError } from '@/lib/api';
import { getBlockDefaults } from '@/lib/block-defaults';
import { normalizeBlockData } from '@/lib/block-data';
import { MESSAGES } from '@/lib/i18n';
import { click, render } from '../mobile-editor/test-utils';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('navbar mobile menu (QA-048, QA-094)', () => {
  const data = normalizeBlockData('navbar', {
    brandName: 'Acme',
    links: [{ label: 'Precios', url: '#pricing' }, { label: 'FAQ', url: '#faq' }],
    ctaText: 'Empezar',
    ctaLink: '#contact',
  });

  function open() {
    const view = render(<LiveLinksProvider value><NavbarBlock blockId="n1" data={data} isPreviewMode /></LiveLinksProvider>);
    const toggle = view.container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    click(toggle);
    return { view, toggle };
  }

  it('says what the button does in each state, with a 44 px target', () => {
    const { view, toggle } = open();
    expect(toggle.getAttribute('aria-label')).toBe(MESSAGES.es.blocks.closeMenu);
    expect(toggle.className).toMatch(/\bw-11\b.*\bh-11\b/);
    click(toggle);
    expect(toggle.getAttribute('aria-label')).toBe(MESSAGES.es.blocks.openMenu);
    view.unmount();
  });

  it('closes with Escape and gives the focus back to the button', () => {
    const { view, toggle } = open();
    const menu = view.container.querySelector<HTMLElement>(`#${CSS.escape(toggle.getAttribute('aria-controls')!)}`)!;
    const link = menu.querySelector('a')!;
    link.focus();
    act(() => {
      link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    view.unmount();
  });

  it('closes when one of its links is followed', () => {
    const { view, toggle } = open();
    const menu = view.container.querySelector<HTMLElement>(`#${CSS.escape(toggle.getAttribute('aria-controls')!)}`)!;
    const link = Array.from(menu.querySelectorAll('a')).find((a) => a.textContent === 'Precios')!;
    expect(link.className).toContain('min-h-11');
    click(link);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    view.unmount();
  });

  it('never lets a long brand widen the page (QA-095)', () => {
    const view = render(<NavbarBlock blockId="n1" data={{ ...data, brandName: 'x'.repeat(80) }} isPreviewMode />);
    const brand = Array.from(view.container.querySelectorAll('span')).find((span) => span.textContent === 'x'.repeat(80))!;
    expect(brand.className).toMatch(/\bmin-w-0\b.*\btruncate\b/);
    view.unmount();
  });
});

describe('contact form field errors (QA-093)', () => {
  it('marks and focuses the field the server refused', async () => {
    vi.spyOn(api.public, 'submitContact').mockRejectedValue(new ContactSubmitError(400, 'BAD_REQUEST', 'Error de validación.', ['email']));
    const view = render(
      <ContactFormProvider value={{ slug: 'mi-landing' }}>
        <ContactBlock blockId="c1" data={normalizeBlockData('contact', {})} isPreviewMode />
      </ContactFormProvider>,
    );
    const form = view.container.querySelector('form')!;
    for (const [name, value] of Object.entries({ name: 'Ana', email: 'a@b', message: 'Hola' })) {
      view.container.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
    }
    await act(async () => {
      form.requestSubmit();
    });

    const email = view.container.querySelector<HTMLInputElement>('[name="email"]')!;
    const name = view.container.querySelector<HTMLInputElement>('[name="name"]')!;
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(name.hasAttribute('aria-invalid')).toBe(false);
    expect(document.activeElement).toBe(email);
    const describedBy = view.container.querySelector(`#${CSS.escape(email.getAttribute('aria-describedby')!)}`);
    expect(describedBy?.textContent).toBe(MESSAGES.es.blocks.contactFieldError.email);
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(MESSAGES.es.blocks.contactError.fields);
    view.unmount();
  });
});

describe('custom HTML frame height (QA-010)', () => {
  it('measures a frame that finished loading before React attached its load handler', () => {
    // The server-rendered frame is already loaded when React mounts: no load event will come
    const loaded = document.implementation.createHTMLDocument('frame');
    vi.spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get').mockReturnValue(loaded);
    vi.spyOn(Document.prototype, 'readyState', 'get').mockReturnValue('complete');
    vi.spyOn(HTMLHtmlElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 168 } as DOMRect);
    const view = render(<CustomHtmlBlock blockId="b1" data={{ html: '<p>Hola</p>' }} isPreviewMode />);
    const frame = view.container.querySelector('iframe')!;
    expect(frame.style.height).toBe('168px');
    view.unmount();
  });
});

describe('broken pictures (QA-117)', () => {
  it('a team photo that fails shows the initial instead of the broken-image icon', () => {
    const data = normalizeBlockData('team', { members: [{ name: 'Ana', role: 'CEO', image: 'https://x.test/missing.png' }] });
    const view = render(<TeamBlock blockId="t1" data={data} isPreviewMode />);
    const img = view.container.querySelector('img')!;
    act(() => {
      img.dispatchEvent(new Event('error'));
    });
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.textContent).toContain('A');
    view.unmount();
  });

  it('the hero badge is centered with the title', () => {
    const view = render(<HeroBlock blockId="h1" data={normalizeBlockData('hero', { title: 'T', badgeText: 'Nuevo' })} isPreviewMode />);
    const badge = Array.from(view.container.querySelectorAll('div')).find((div) => div.textContent?.trim() === 'Nuevo')!;
    expect(badge.className).toContain('w-fit');
    expect(badge.parentElement!.className).toContain('items-center');
    view.unmount();
  });
});

describe('touch targets on the page (QA-094)', () => {
  it('footer links and FAQ rows are at least 44 px tall', () => {
    const footer = render(<FooterBlock blockId="f1" data={normalizeBlockData('footer', getBlockDefaults('footer', 'es'))} isPreviewMode />);
    const links = footer.container.querySelectorAll('a');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.className).toContain('min-h-11');
    footer.unmount();

    const faq = render(<FaqBlock blockId="q1" data={normalizeBlockData('faq', getBlockDefaults('faq', 'es'))} isPreviewMode />);
    for (const button of faq.container.querySelectorAll('button')) expect(button.className).toContain('min-h-11');
    faq.unmount();
  });
});

describe('theme colors in blocks (QA-019, QA-024)', () => {
  const blocks = {
    footer: <FooterBlock blockId="b" data={normalizeBlockData('footer', getBlockDefaults('footer', 'es'))} isPreviewMode />,
    stats: <StatsBlock blockId="b" data={normalizeBlockData('stats', getBlockDefaults('stats', 'es'))} isPreviewMode />,
    logoCloud: <LogoCloudBlock blockId="b" data={normalizeBlockData('logoCloud', getBlockDefaults('logoCloud', 'es'))} isPreviewMode />,
    pricing: <PricingBlock blockId="b" data={normalizeBlockData('pricing', getBlockDefaults('pricing', 'es'))} isPreviewMode />,
    cta: <CtaBlock blockId="b" data={normalizeBlockData('cta', getBlockDefaults('cta', 'es'))} isPreviewMode />,
    hero: <HeroBlock blockId="b" data={normalizeBlockData('hero', getBlockDefaults('hero', 'es'))} isPreviewMode />,
    navbar: <NavbarBlock blockId="b" data={normalizeBlockData('navbar', getBlockDefaults('navbar', 'es'))} isPreviewMode />,
  };

  it.each(Object.keys(blocks) as (keyof typeof blocks)[])('"%s" draws no faded or hard-coded white text', (type) => {
    const view = render(blocks[type]);
    // Text elements only: decorative icons may be faded
    for (const el of view.container.querySelectorAll<HTMLElement>('*:not(svg):not(svg *)')) {
      expect(el.className, type).not.toMatch(/(^|\s)(text-white|opacity-\d+)(\s|$)/);
      expect(el.style.color, type).not.toMatch(/^(#fff|white|rgb\(255, 255, 255\))$/);
    }
    view.unmount();
  });

  it('primary buttons use the theme\'s text-on-primary color', () => {
    const view = render(blocks.hero);
    const button = Array.from(view.container.querySelectorAll<HTMLElement>('a')).find((a) => a.textContent === getBlockDefaults('hero', 'es').buttonText)!;
    expect(button.style.color).toBe('var(--theme-text-on-primary)');
    view.unmount();
  });

  it('the footer, stats and highlighted plan use the inverse colors', () => {
    const view = render(<>{blocks.footer}{blocks.stats}{blocks.pricing}</>);
    const html = view.container.innerHTML;
    expect(html).toContain('var(--theme-inverse-bg)');
    expect(html).toContain('var(--theme-inverse-muted)');
    expect(html).not.toMatch(/background-color: var\(--theme-text\)/);
    view.unmount();
  });
});

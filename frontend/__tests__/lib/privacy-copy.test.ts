import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/lib/i18n';

// D5 / QA-025, C4 / A12 (PORTFOLIO-002): the privacy page has to say what the app does. These sentences are the
// contract with the code (components/providers/AppIntlProvider.tsx, components/auth/GoogleSignIn.tsx,
// hooks/useTheme.ts, backend/config/settings.py, backend/pages/management/commands/daily_maintenance.py).
const CONTACT_EMAIL = 'davidpalmerojara@gmail.com';

describe('privacy page text', () => {
  const es = MESSAGES.es.marketing.pages.privacy;
  const en = MESSAGES.en.marketing.pages.privacy;
  const everything = (page: typeof es) => Object.values(page).join('\n');

  it('does not mention a copy of the session in the browser storage, which no longer exists', () => {
    expect(es.section5Body).not.toMatch(/copia de la sesión/i);
    expect(en.section5Body).not.toMatch(/copy of the session/i);
  });

  it('says the language cookie appears only when you switch language', () => {
    expect(es.section5Body).toContain('únicamente cuando lo cambias');
    expect(en.section5Body).toContain('only when you change it');
  });

  it('says published pages set no cookies', () => {
    expect(es.section5Body).toContain('Las páginas publicadas no guardan cookies');
    expect(en.section5Body).toContain('Published pages set no cookies');
  });

  it('says Google is loaded only on the sign-in and sign-up screens', () => {
    expect(es.section6Body).toContain('únicamente en las pantallas de inicio de sesión y de registro');
    expect(en.section6Body).toContain('only on the sign-in and sign-up screens');
  });

  it('does not promise payments that are switched off in the demo', () => {
    expect(es.section7Body).toContain('Los pagos están desactivados en la demo');
    expect(en.section7Body).toContain('Payments are turned off in the demo');
    expect(MESSAGES.es.marketing.pages.terms.section4Body).toContain('desactivados');
    expect(MESSAGES.en.marketing.pages.terms.section4Body).toContain('turned off');
  });

  it('names the data controller and a contact address (C4)', () => {
    expect(es.section1Body).toContain('David Palmero Jara');
    expect(es.section1Body).toContain(CONTACT_EMAIL);
    expect(en.section1Body).toContain('David Palmero Jara');
    expect(en.section1Body).toContain(CONTACT_EMAIL);
  });

  it('names every provider that sees personal data (A12)', () => {
    for (const provider of ['Vercel', 'Render', 'Neon', 'Brevo', 'Google', 'GitHub']) {
      expect(es.section6Body, `ES: ${provider}`).toContain(provider);
      expect(en.section6Body, `EN: ${provider}`).toContain(provider);
    }
  });

  it('states the retention periods the backend enforces', () => {
    // guests 24 h (GUEST_LIFETIME_HOURS), analytics 90 days (ANALYTICS_RETENTION_DAYS), sent-email hashes 30 days
    for (const body of [es.section4Body, en.section4Body]) {
      expect(body).toContain('24');
      expect(body).toContain('90');
      expect(body).toContain('30');
      expect(body).toContain('20');
    }
  });

  it('explains the rights and the right to complain to the AEPD', () => {
    expect(es.section9Body).toContain('Agencia Española de Protección de Datos');
    expect(es.section9Body).toContain(CONTACT_EMAIL);
    expect(en.section9Body).toContain('Spanish Data Protection Agency');
    expect(en.section9Body).toContain(CONTACT_EMAIL);
  });

  it('says that in demo mode the AI sends nothing to a provider', () => {
    expect(es.section7Body).toContain('no envía nada a ningún proveedor');
    expect(en.section7Body).toContain('sends nothing to any provider');
  });

  it('does not tell people to look for the contact on another site', () => {
    expect(everything(es)).not.toContain('davidpalmero.dev');
    expect(everything(en)).not.toContain('davidpalmero.dev');
  });

  it('is dated after the deployment work, in both languages', () => {
    expect(es.updatedDate).toBe('22 de octubre de 2026');
    expect(en.updatedDate).toBe('October 22, 2026');
    expect(MESSAGES.es.marketing.pages.terms.updatedDate).toBe(es.updatedDate);
    expect(MESSAGES.en.marketing.pages.terms.updatedDate).toBe(en.updatedDate);
  });

  it('renders as many sections as the messages define', () => {
    const source = readFileSync(resolve(__dirname, '../../app/privacy/page.tsx'), 'utf8');
    const rendered = Number(/SECTION_COUNT = (\d+)/.exec(source)?.[1]);
    for (const page of [es, en]) {
      const defined = Object.keys(page).filter((key) => /^section\d+Title$/.test(key)).length;
      expect(rendered).toBe(defined);
    }
  });
});

describe('terms page text', () => {
  const es = MESSAGES.es.marketing.pages.terms;
  const en = MESSAGES.en.marketing.pages.terms;

  it('says how to report illegal content on a published page, with the contact address (PORTFOLIO-010)', () => {
    expect(es.section3Body).toContain(CONTACT_EMAIL);
    expect(en.section3Body).toContain(CONTACT_EMAIL);
  });

  it('says the code is visible but all rights are reserved, like the LICENSE file', () => {
    expect(es.section5Body).toContain('todos los derechos reservados');
    expect(en.section5Body).toContain('all rights reserved');
    const licence = readFileSync(resolve(__dirname, '../../../LICENSE'), 'utf8');
    expect(licence).toMatch(/All rights reserved/);
  });

  it('renders as many sections as the messages define', () => {
    const source = readFileSync(resolve(__dirname, '../../app/terms/page.tsx'), 'utf8');
    const rendered = Number(/SECTION_COUNT = (\d+)/.exec(source)?.[1]);
    for (const page of [es, en]) {
      const defined = Object.keys(page).filter((key) => /^section\d+Title$/.test(key)).length;
      expect(rendered).toBe(defined);
    }
  });
});

describe('changelog text', () => {
  const es = MESSAGES.es.marketing.pages.changelog;
  const en = MESSAGES.en.marketing.pages.changelog;

  it('renders as many entries as the messages define, in both languages (PORTFOLIO-008)', () => {
    const source = readFileSync(resolve(__dirname, '../../app/changelog/page.tsx'), 'utf8');
    const rendered = Number(/ENTRY_COUNT = (\d+)/.exec(source)?.[1]);
    for (const page of [es, en]) {
      const defined = Object.keys(page).filter((key) => /^entry\d+Title$/.test(key)).length;
      expect(rendered).toBe(defined);
    }
    expect(rendered).toBeGreaterThanOrEqual(5);
  });
});

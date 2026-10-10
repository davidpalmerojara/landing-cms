import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/lib/i18n';

// D5 / QA-025: the privacy page has to say what the app does. These sentences are the contract with the code
// (components/providers/AppIntlProvider.tsx, components/auth/GoogleSignIn.tsx, hooks/useTheme.ts).
describe('privacy page text', () => {
  const es = MESSAGES.es.marketing.pages.privacy;
  const en = MESSAGES.en.marketing.pages.privacy;

  it('does not mention a copy of the session in the browser storage, which no longer exists', () => {
    expect(es.section3Body).not.toMatch(/copia de la sesión/i);
    expect(en.section3Body).not.toMatch(/copy of the session/i);
  });

  it('says the language cookie appears only when you switch language', () => {
    expect(es.section3Body).toContain('únicamente cuando lo cambias');
    expect(en.section3Body).toContain('only when you change it');
  });

  it('says published pages set no cookies', () => {
    expect(es.section3Body).toContain('Las páginas publicadas no guardan cookies');
    expect(en.section3Body).toContain('Published pages set no cookies');
  });

  it('says Google is loaded only on the sign-in and sign-up screens', () => {
    expect(es.section4Body).toContain('únicamente en las pantallas de inicio de sesión y de registro');
    expect(en.section4Body).toContain('only on the sign-in and sign-up screens');
  });

  it('does not promise payments that are switched off in the demo', () => {
    expect(es.section4Body).toContain('Los pagos están desactivados en la demo');
    expect(en.section4Body).toContain('Payments are turned off in the demo');
    expect(MESSAGES.es.marketing.pages.terms.section3Body).toContain('desactivados');
    expect(MESSAGES.en.marketing.pages.terms.section3Body).toContain('turned off');
  });
});

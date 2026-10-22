import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/design-tokens';

/**
 * MOBILE-009: the edge of a field in the light theme was a 15 % tint of a pale grey
 * (about 1.05:1 against the sheet). WCAG 1.4.11 asks 3:1 for the boundary of a control.
 */
const FIELD_BORDER = '#838C99';

describe('MOBILE-009: light theme field borders', () => {
  it.each([
    ['white card', '#FFFFFF'],
    ['elevated surface', '#F9FAFB'],
  ])('the field border reaches 3:1 on the %s', (_name, background) => {
    expect(contrastRatio(FIELD_BORDER, background)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    'components/mobile-editor/MobileBlockEditor.tsx',
    'components/mobile-editor/MobileSelect.tsx',
    'components/mobile-editor/MobileBlockStyles.tsx',
    'components/mobile-editor/MobileAiBlockEdit.tsx',
    'components/inspector/TextField.tsx',
    'components/inspector/TextAreaField.tsx',
    'components/inspector/SelectField.tsx',
  ])('%s paints that border in the light theme', (file) => {
    const source = readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
    expect(source).toContain(`in-data-[theme=light]:border-[${FIELD_BORDER}]`);
  });
});

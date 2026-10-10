import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  apiErrorKind,
  apiErrorMessage,
  isNetworkError,
  isRetryableError,
  parseDataKey,
  ruleMessage,
  ruleMessageText,
  validationErrors,
} from '@/lib/api-errors';
import { MESSAGES } from '@/lib/i18n';

const apiError = (status: number, body: unknown) => new ApiError(status, JSON.stringify(body));

/** A translator over the real messages, like next-intl's `t` (without ICU plurals). */
function translator(locale: 'es' | 'en') {
  return (key: string, values?: Record<string, string | number | Date>) => {
    let node: unknown = MESSAGES[locale];
    for (const part of key.split('.')) node = (node as Record<string, unknown>)?.[part];
    if (typeof node !== 'string') throw new Error(`Missing message ${key}`);
    return node.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  };
}

describe('error kinds (QA-004: "Sin conexión" only when the server could not be reached)', () => {
  it('a fetch that got no response is offline', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(apiErrorKind(new TypeError('Failed to fetch'))).toBe('offline');
  });

  it('any HTTP answer is not offline', () => {
    expect(isNetworkError(apiError(404, { error: 'x', code: 'NOT_FOUND' }))).toBe(false);
    expect(apiErrorKind(apiError(404, { error: 'x', code: 'NOT_FOUND' }))).toBe('notFound');
    expect(apiErrorKind(apiError(400, { error: 'x', code: 'BAD_REQUEST' }))).toBe('validation');
    expect(apiErrorKind(apiError(401, { error: 'x' }))).toBe('session');
    expect(apiErrorKind(apiError(403, { error: 'x', code: 'NOT_OWNER' }))).toBe('notOwner');
    expect(apiErrorKind(apiError(403, { error: 'plan_limit' }))).toBe('planLimit');
    expect(apiErrorKind(apiError(409, { error: 'x', code: 'VERSION_CONFLICT' }))).toBe('conflict');
    expect(apiErrorKind(apiError(429, { error: 'x' }))).toBe('throttled');
    expect(apiErrorKind(apiError(502, '<html>Bad gateway</html>'))).toBe('server');
  });

  it('retries what may work later, never a refusal', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableError(apiError(500, {}))).toBe(true);
    expect(isRetryableError(apiError(429, {}))).toBe(true);
    expect(isRetryableError(apiError(400, {}))).toBe(false);
    expect(isRetryableError(apiError(403, {}))).toBe(false);
    expect(isRetryableError(apiError(404, {}))).toBe(false);
  });
});

describe('apiErrorMessage (QA-052: never the raw body)', () => {
  const t = translator('en');

  it('picks the message by kind, in the interface language', () => {
    expect(apiErrorMessage(new TypeError('Failed to fetch'), t, 'editor.publishError')).toBe(MESSAGES.en.apiErrors.offline);
    expect(apiErrorMessage(apiError(500, { error: 'Error interno del servidor.' }), t, 'editor.publishError'))
      .toBe(MESSAGES.en.apiErrors.server);
  });

  it('falls back to the given key when the kind says nothing useful', () => {
    const message = apiErrorMessage(apiError(400, { error: 'Error de validación.', code: 'BAD_REQUEST' }), t, 'editor.publishError');
    expect(message).toBe(MESSAGES.en.editor.publishError);
    expect(message).not.toContain('validación');
  });
});

describe('validationErrors: the fields a 400 refused', () => {
  it('parses list item keys', () => {
    expect(parseDataKey('links[2].url')).toEqual(['links', 2, 'url']);
    expect(parseDataKey('title')).toEqual(['title']);
  });

  it('reads block fields by the index of the block sent, and page fields by name', () => {
    const error = apiError(400, {
      error: 'Error de validación.',
      code: 'BAD_REQUEST',
      details: {
        name: ['Asegúrese de que este campo no tenga más de 200 caracteres.'],
        blocks: [
          {},
          { data: { buttonLink: ['Enlace no permitido.'], 'links[0].url': ['El enlace no puede contener espacios.'] } },
          { data: ['El contenido del bloque es demasiado grande.'] },
        ],
      },
    });

    expect(validationErrors(error)).toEqual([
      { blockIndex: null, path: ['name'], messages: ['Asegúrese de que este campo no tenga más de 200 caracteres.'] },
      { blockIndex: 1, path: ['buttonLink'], messages: ['Enlace no permitido.'] },
      { blockIndex: 1, path: ['links', 0, 'url'], messages: ['El enlace no puede contener espacios.'] },
      { blockIndex: 2, path: [], messages: ['El contenido del bloque es demasiado grande.'] },
    ]);
  });

  it('names nothing for refusals that point at no field, or for other errors', () => {
    expect(validationErrors(apiError(400, { error: 'x', details: { blocks: ['Hay bloques con el mismo id.'] } }))).toEqual([]);
    expect(validationErrors(apiError(400, { error: 'Falta la versión.', code: 'VERSION_REQUIRED' }))).toEqual([]);
    expect(validationErrors(apiError(500, { details: { name: ['x'] } }))).toEqual([]);
    expect(validationErrors(new TypeError('Failed to fetch'))).toEqual([]);
  });
});

describe('ruleMessage: the server rule in the user language', () => {
  const validators = readFileSync(resolve(__dirname, '../../../backend/pages/block_validators.py'), 'utf8');
  const sanitizers = readFileSync(resolve(__dirname, '../../../backend/pages/block_sanitizers.py'), 'utf8');

  it.each([
    ["f'Máximo {rule.max_length} caracteres.'", 'Máximo 200 caracteres.', { key: 'maxLength', values: { max: 200 } }],
    ["f'Máximo {rule.max_items} elementos.'", 'Máximo 6 elementos.', { key: 'maxItems', values: { max: 6 } }],
    ["f'Valor inválido. Usa uno de: {allowed}.'", 'Valor inválido. Usa uno de: left, center.', { key: 'choice' }],
    ["'El contenido del bloque es demasiado grande.'", 'El contenido del bloque es demasiado grande.', { key: 'tooLarge' }],
    ["'Este campo no puede ser null.'", 'Este campo no puede ser null.', { key: 'required' }],
  ])('validators: %s', (template, message, expected) => {
    expect(validators).toContain(template);
    expect(ruleMessage(message)).toEqual(expected);
  });

  it.each([
    ["'El enlace no puede contener espacios ni caracteres de control.'", 'El enlace no puede contener espacios ni caracteres de control.', 'link'],
    ["'Enlace no permitido. Usa https://", 'Enlace no permitido. Usa https://, http://, mailto:, tel:, una ruta que empiece por / o un ancla #.', 'link'],
    ["f'URL no permitida: {value}'", 'URL no permitida: javascript:x', 'url'],
  ])('sanitizers: %s', (template, message, key) => {
    expect(sanitizers).toContain(template);
    expect(ruleMessage(message).key).toBe(key);
  });

  it("DRF's own length message", () => {
    expect(ruleMessage('Asegúrese de que este campo no tenga más de 70 caracteres.')).toEqual({ key: 'maxLength', values: { max: 70 } });
  });

  it('anything else is a generic "invalid value", never the server text', () => {
    expect(ruleMessage('Debe ser un texto.')).toEqual({ key: 'invalid' });
    expect(ruleMessageText('Debe ser un texto.', translator('en'))).toBe(MESSAGES.en.saveStatus.rules.invalid);
    expect(ruleMessageText('Máximo 50 caracteres.', translator('en'))).toBe('50 characters at most.');
  });
});

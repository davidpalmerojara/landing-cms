// Shared by the tests of localized content

/** Every string inside a value, however deep. */
export function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringsIn);
  return [];
}

/** The keys of a value, and the length of every list: its shape, whatever the words. */
export function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shapeOf(inner)]));
  }
  return typeof value;
}

/** Letters and words that only Spanish text has. */
export const SPANISH_MARKERS = new RegExp(
  '[áéíóúñ¿¡]|\\b(' +
    [
      'de', 'del', 'el', 'los', 'las', 'una', 'que', 'por', 'con', 'para', 'tu', 'tus', 'su', 'sus', 'al', 'lo', 'se',
      'nuestro', 'nuestra', 'nuestros', 'nuestras', 'gratis', 'empezar', 'todos', 'todas', 'mes', 'hasta',
      'descubre', 'ventajas', 'precios', 'planes', 'preguntas', 'equipo', 'historia', 'contacto', 'enviar', 'mensaje',
      'suscribirse', 'comienza', 'viaje', 'usuarios', 'fundación', 'lanzamiento', 'nuevo', 'nueva', 'producto',
      'soporte', 'empresas', 'confían', 'ilimitadas', 'ilimitados', 'cifras', 'característica', 'características',
    ].join('|') +
    ')\\b',
  'i',
);

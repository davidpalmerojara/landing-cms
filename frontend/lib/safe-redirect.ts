/**
 * Where to go after logging in. Only same-site paths are allowed: anything
 * that could leave the site ("//evil.com", "https://…", "/\evil.com") falls
 * back to the dashboard, so ?next= cannot be used as an open redirect.
 *
 * The check is done on what the URL parser will see, not on the raw string:
 * browsers drop tabs and line breaks inside a URL, so "/\t/evil.example" is
 * really "//evil.example" (QA-026).
 */
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  // Control characters (tab, CR, LF, NUL, DEL) and spaces have no place in a path we generate
  for (let index = 0; index < next.length; index += 1) {
    const code = next.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) return fallback;
  }

  const base = 'https://paxl.invalid';
  let resolved: URL;
  try {
    resolved = new URL(next, base);
  } catch {
    return fallback;
  }
  if (resolved.origin !== base) return fallback;

  // "/%09/evil" stays a path on our origin, but decoded it is "//evil"
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(resolved.pathname);
  } catch {
    return fallback;
  }
  if (decodedPath.startsWith('//') || decodedPath.includes('\\')) return fallback;
  for (let index = 0; index < decodedPath.length; index += 1) {
    const code = decodedPath.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return fallback;
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function nextPathFromLocation(): string {
  if (typeof window === 'undefined') return '/dashboard';
  return safeNextPath(new URLSearchParams(window.location.search).get('next'));
}

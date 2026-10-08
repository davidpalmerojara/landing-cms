/**
 * Where to go after logging in. Only same-site paths are allowed: anything
 * that could leave the site ("//evil.com", "https://…", "/\evil.com") falls
 * back to the dashboard, so ?next= cannot be used as an open redirect.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

export function nextPathFromLocation(): string {
  if (typeof window === 'undefined') return '/dashboard';
  return safeNextPath(new URLSearchParams(window.location.search).get('next'));
}

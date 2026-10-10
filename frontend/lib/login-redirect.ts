/**
 * Where to send someone without a session who opened `path`: the login page,
 * which returns them to `path` afterwards (the editor already did this).
 * The login page validates `next` again (lib/safe-redirect.ts).
 */
export function loginRedirectFor(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

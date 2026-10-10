/**
 * Content-Security-Policy of the frontend (ADR-038, QA-102).
 *
 * Two policies, because the two kinds of page have different jobs:
 * - `public`: what a visitor of a published page gets. Strict: no third party at
 *   all (not even Google), nothing that can post anywhere but the page's own API.
 * - `app`: the editor, dashboard and sign-in pages. The same, plus Google's
 *   sign-in script, frame and styles when a client id is configured.
 *
 * Scripts are 'self' plus inline ones: Next.js writes its hydration data into
 * inline scripts, and a nonce would force every page (published ones included)
 * to render on each request. What it still blocks is the important part: scripts
 * from other origins, eval, plugins, framing by other sites and a rewritten <base>.
 */

export type PolicyScope = 'app' | 'public';

export interface PolicyEnvironment {
  /** NEXT_PUBLIC_API_URL: '/api' (rewrite mode) or an absolute URL */
  apiUrl?: string;
  /** BACKEND_URL: where Next forwards /api and where uploads are served from */
  backendUrl?: string;
  /** NEXT_PUBLIC_WS_URL: the collaboration WebSocket */
  wsUrl?: string;
  /** NEXT_PUBLIC_GOOGLE_CLIENT_ID: set means the sign-in pages load Google's script */
  googleClientId?: string;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { origin } = new URL(url);
    return origin === 'null' ? null : origin;
  } catch {
    // A relative URL such as '/api' is same-origin: 'self' already covers it
    return null;
  }
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const GOOGLE_FRAME = 'https://accounts.google.com/gsi/';
const GOOGLE_STYLE = 'https://accounts.google.com/gsi/style';

export function contentSecurityPolicy(scope: PolicyScope, env: PolicyEnvironment): string {
  const apiOrigins = unique([originOf(env.apiUrl), originOf(env.backendUrl)]);
  const wsOrigin = originOf(env.wsUrl?.replace(/^ws/, 'http'))?.replace(/^http/, 'ws');
  const google = scope === 'app' && Boolean(env.googleClientId);

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': unique(["'self'", "'unsafe-inline'", google ? GOOGLE_SCRIPT : null]),
    'style-src': unique(["'self'", "'unsafe-inline'", google ? GOOGLE_STYLE : null]),
    // Pictures are whatever address the author pasted (https), uploads, and inline previews
    'img-src': unique(["'self'", 'data:', 'blob:', 'https:', ...apiOrigins]),
    // Video and audio in a Custom HTML block (the sanitizer allows <video>/<source>):
    // without this they fell back to default-src and never loaded (SEC2-002)
    'media-src': unique(["'self'", 'https:', ...apiOrigins]),
    'font-src': ["'self'", 'data:'],
    'connect-src': unique(["'self'", ...apiOrigins, wsOrigin, google ? GOOGLE_FRAME : null]),
    'frame-src': unique(["'self'", google ? GOOGLE_FRAME : null]),
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': unique(["'self'", ...apiOrigins]),
    'frame-ancestors': ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

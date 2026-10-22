/**
 * Guards for the hosted build (DEPLOY-014, DEPLOY-013). next.config.ts runs them at
 * build time on Vercel: the API rewrites, the CSP and every NEXT_PUBLIC_* value are
 * fixed then, so a forgotten variable would otherwise ship a site pointing at localhost.
 */

export type BuildEnvironment = Record<string, string | undefined>;

const REQUIRED_IN_PRODUCTION = ['BACKEND_URL', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_WS_URL'] as const;

const LOCAL_HOST = /^(?:[a-z]+:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;

/** NEXT_PUBLIC_API_URL is allowed to be the relative '/api' (the rewrite); the others must be absolute and public. */
function isMissingOrLocal(name: (typeof REQUIRED_IN_PRODUCTION)[number], value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  if (name === 'NEXT_PUBLIC_API_URL' && trimmed.startsWith('/')) return false;
  return LOCAL_HOST.test(trimmed);
}

/** The variables a production build on Vercel cannot do without. Empty outside Vercel production. */
export function productionEnvironmentProblems(env: BuildEnvironment): string[] {
  if (env.VERCEL_ENV !== 'production') return [];
  return REQUIRED_IN_PRODUCTION
    .filter((name) => isMissingOrLocal(name, env[name]))
    .map((name) => `${name} is ${env[name]?.trim() ? 'a local address' : 'missing'}`);
}

/**
 * The backend that /api and /media are forwarded to, or undefined for no forwarding.
 * A Vercel preview deployment gets none unless PAXL_ALLOW_PREVIEW_BACKEND=1: a preview
 * would otherwise write to the production database, and its origin is not trusted by
 * the backend anyway.
 */
export function rewriteBackend(env: BuildEnvironment): string | undefined {
  if (env.VERCEL_ENV === 'preview' && env.PAXL_ALLOW_PREVIEW_BACKEND !== '1') return undefined;
  return env.BACKEND_URL?.replace(/\/$/, '') || undefined;
}

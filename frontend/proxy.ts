import { NextRequest, NextResponse } from 'next/server';

/**
 * Custom domain routing proxy.
 *
 * When a request arrives on a custom domain (not the app's own domain),
 * we resolve it to a page slug via the backend API and rewrite to /p/[slug].
 *
 * The app's own hosts (localhost, *.vercel.app, any extra host listed in
 * APP_HOSTNAMES) are excluded so the dashboard, editor, etc. work normally.
 * In development any IP address counts as the app, so the app can be opened
 * from a phone on the local network.
 */

const APP_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  ...(process.env.APP_HOSTNAMES ?? '').split(',').map((h) => h.trim()).filter(Boolean),
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function isAppDomain(hostname: string): boolean {
  if (APP_HOSTNAMES.has(hostname)) return true;
  if (hostname.endsWith('.vercel.app')) return true;
  if (process.env.NODE_ENV !== 'production' && IPV4.test(hostname)) return true;
  return false;
}

// In-memory cache for domain → slug resolution (per edge instance)
const domainCache = new Map<string, { slug: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function resolveCustomDomain(hostname: string): Promise<string | null> {
  const cached = domainCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.slug;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

  try {
    const res = await fetch(`${apiUrl}/public/resolve-domain/?domain=${encodeURIComponent(hostname)}`, {
      headers: { 'Accept': 'application/json' },
      // Short timeout to avoid blocking requests
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      domainCache.delete(hostname);
      return null;
    }

    const data = await res.json();
    const slug = data.slug as string;

    domainCache.set(hostname, { slug, expiresAt: Date.now() + CACHE_TTL });
    return slug;
  } catch {
    domainCache.delete(hostname);
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0] || '';

  // Skip for app domains — let Next.js handle normally
  if (isAppDomain(hostname)) {
    return NextResponse.next();
  }

  // Custom domain detected — resolve to page slug
  const slug = await resolveCustomDomain(hostname);

  if (!slug) {
    // Domain not found or not active — show a simple error
    return new NextResponse('Domain not configured', { status: 404 });
  }

  // Rewrite to the public page route
  const url = request.nextUrl.clone();
  url.pathname = `/p/${slug}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on page routes only: skip Next internals, API routes and any path
  // with a file extension (files in /public such as images).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.[a-zA-Z0-9]+$).*)',
  ],
};

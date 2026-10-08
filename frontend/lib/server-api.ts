/**
 * Base URL of the Django API for code that runs on the server (SSR, sitemap,
 * proxy). The browser may use a relative NEXT_PUBLIC_API_URL ('/api', served
 * through the rewrite in next.config.ts); a server-side fetch needs an
 * absolute URL, so it talks to the backend directly.
 */
export function serverApiUrl(): string {
  if (process.env.BACKEND_URL) return `${process.env.BACKEND_URL.replace(/\/$/, '')}/api`;
  const publicUrl = process.env.NEXT_PUBLIC_API_URL;
  if (publicUrl && /^https?:\/\//.test(publicUrl)) return publicUrl;
  return 'http://localhost:8001/api';
}

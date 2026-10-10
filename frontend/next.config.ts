import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./lib/content-security-policy";

const isProduction = process.env.NODE_ENV === 'production';

const policyEnvironment = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  backendUrl: process.env.BACKEND_URL,
  wsUrl: process.env.NEXT_PUBLIC_WS_URL,
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
};

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Browsers ignore HSTS over plain http, so this only takes effect where HTTPS is in use
  ...(isProduction ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

const nextConfig: NextConfig = {
  // The repo's own AGENTS.md (at the root) is the source of truth for agents;
  // don't let `next dev` generate a second one in frontend/.
  agentRules: false,
  // Do not announce the framework in every response
  poweredByHeader: false,
  // Django URLs end in '/'; without this Next would redirect '/api/pages/'
  // to '/api/pages' before the rewrite and Django would redirect back.
  skipTrailingSlashRedirect: true,
  // With BACKEND_URL set, the browser calls '/api/...' on this origin and Next
  // forwards it to Django, so the session cookies are first-party even when
  // the frontend and the API are hosted on different domains (ADR-008).
  async rewrites() {
    const backend = process.env.BACKEND_URL?.replace(/\/$/, '');
    if (!backend) return [];
    return [
      // ':path*' drops the trailing slash, which every Django API route needs
      { source: '/api/:path*', destination: `${backend}/api/:path*/` },
      // Uploaded images are stored in pages as '/media/...' (site-relative, QA-079),
      // not as a URL of the API host; file URLs have no trailing slash
      { source: '/media/:path*', destination: `${backend}/media/:path*` },
    ];
  },
  async headers() {
    // The policy is for production builds: the dev server needs eval and a hot-reload socket
    // it would block. Published pages (/p/…) get the strict one, everything else the app's.
    const policies = isProduction
      ? [
        { source: '/p/:path*', headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy('public', policyEnvironment) }] },
        { source: '/((?!p/).*)', headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy('app', policyEnvironment) }] },
      ]
      : [];
    return [
      { source: '/(.*)', headers: securityHeaders },
      ...policies,
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo's own AGENTS.md (at the root) is the source of truth for agents;
  // don't let `next dev` generate a second one in frontend/.
  agentRules: false,
  // Django URLs end in '/'; without this Next would redirect '/api/pages/'
  // to '/api/pages' before the rewrite and Django would redirect back.
  skipTrailingSlashRedirect: true,
  // With BACKEND_URL set, the browser calls '/api/...' on this origin and Next
  // forwards it to Django, so the session cookies are first-party even when
  // the frontend and the API are hosted on different domains (ADR-008).
  async rewrites() {
    const backend = process.env.BACKEND_URL?.replace(/\/$/, '');
    // ':path*' drops the trailing slash, which every Django API route needs
    return backend ? [{ source: '/api/:path*', destination: `${backend}/api/:path*/` }] : [];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

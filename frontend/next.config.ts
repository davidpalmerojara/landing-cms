import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo's own AGENTS.md (at the root) is the source of truth for agents;
  // don't let `next dev` generate a second one in frontend/.
  agentRules: false,
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

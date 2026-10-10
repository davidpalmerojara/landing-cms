import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '@/lib/content-security-policy';

function directive(policy: string, name: string): string[] {
  const found = policy.split('; ').find((entry) => entry.startsWith(`${name} `));
  return found ? found.split(' ').slice(1) : [];
}

const ENV = {
  apiUrl: '/api',
  backendUrl: 'https://api.paxl.example',
  wsUrl: 'wss://api.paxl.example',
  googleClientId: 'client-id',
};

describe('contentSecurityPolicy (QA-102)', () => {
  it('forbids plugins, framing by other sites and a rewritten <base> on both kinds of page', () => {
    for (const scope of ['app', 'public'] as const) {
      const policy = contentSecurityPolicy(scope, ENV);
      expect(directive(policy, 'object-src')).toEqual(["'none'"]);
      expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"]);
      expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
      expect(directive(policy, 'default-src')).toEqual(["'self'"]);
    }
  });

  it('never allows eval, and scripts only from this site (plus inline ones for Next\'s hydration)', () => {
    const scripts = directive(contentSecurityPolicy('public', ENV), 'script-src');

    expect(scripts).toEqual(["'self'", "'unsafe-inline'"]);
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it('D5: a published page may not load anything from Google, even when sign-in with Google is configured', () => {
    const policy = contentSecurityPolicy('public', ENV);

    expect(policy).not.toContain('google');
  });

  it('the app policy allows Google\'s sign-in script, frame and styles only when a client id is configured', () => {
    const withGoogle = contentSecurityPolicy('app', ENV);
    const without = contentSecurityPolicy('app', { ...ENV, googleClientId: '' });

    expect(directive(withGoogle, 'script-src')).toContain('https://accounts.google.com/gsi/client');
    expect(directive(withGoogle, 'frame-src')).toContain('https://accounts.google.com/gsi/');
    expect(directive(withGoogle, 'style-src')).toContain('https://accounts.google.com/gsi/style');
    expect(without).not.toContain('google');
  });

  it('lets the app talk to its API and the collaboration socket, and nothing else', () => {
    const connect = directive(contentSecurityPolicy('app', ENV), 'connect-src');

    expect(connect).toEqual(expect.arrayContaining(["'self'", 'https://api.paxl.example', 'wss://api.paxl.example']));
    expect(connect).not.toContain('https:');
    expect(connect).not.toContain('*');
  });

  it('in rewrite mode (relative API url) the API is the site itself', () => {
    const policy = contentSecurityPolicy('public', { apiUrl: '/api' });

    expect(directive(policy, 'connect-src')).toEqual(["'self'"]);
    expect(directive(policy, 'form-action')).toEqual(["'self'"]);
  });

  it('a local backend over http is allowed for uploads and the socket', () => {
    const policy = contentSecurityPolicy('app', {
      apiUrl: 'http://localhost:8001/api', wsUrl: 'ws://localhost:8001',
    });

    expect(directive(policy, 'img-src')).toContain('http://localhost:8001');
    expect(directive(policy, 'connect-src')).toEqual(expect.arrayContaining(['http://localhost:8001', 'ws://localhost:8001']));
  });

  it('pictures may come from any https address, because authors paste them', () => {
    expect(directive(contentSecurityPolicy('public', {}), 'img-src')).toEqual(
      expect.arrayContaining(["'self'", 'data:', 'blob:', 'https:']),
    );
  });
});

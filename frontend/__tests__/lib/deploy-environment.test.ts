import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { productionEnvironmentProblems, rewriteBackend } from '@/lib/deploy-environment';

const completeProduction = {
  VERCEL_ENV: 'production',
  BACKEND_URL: 'https://paxl-api.onrender.com',
  NEXT_PUBLIC_API_URL: '/api',
  NEXT_PUBLIC_SITE_URL: 'https://paxl.vercel.app',
  NEXT_PUBLIC_WS_URL: 'wss://paxl-api.onrender.com',
};

describe('productionEnvironmentProblems (DEPLOY-014)', () => {
  it('accepts a complete Vercel production configuration', () => {
    expect(productionEnvironmentProblems(completeProduction)).toEqual([]);
  });

  it('names every variable that is missing', () => {
    const partial: Record<string, string | undefined> = { ...completeProduction };
    delete partial.BACKEND_URL;
    delete partial.NEXT_PUBLIC_WS_URL;

    expect(productionEnvironmentProblems(partial)).toEqual([
      'BACKEND_URL is missing',
      'NEXT_PUBLIC_WS_URL is missing',
    ]);
  });

  it('refuses addresses that point at the machine itself', () => {
    const problems = productionEnvironmentProblems({
      ...completeProduction,
      BACKEND_URL: 'http://localhost:8001',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
    });

    expect(problems).toEqual(['BACKEND_URL is a local address', 'NEXT_PUBLIC_SITE_URL is a local address']);
  });

  it('does not treat a public host that merely starts with "localhost" as local', () => {
    expect(productionEnvironmentProblems({ ...completeProduction, BACKEND_URL: 'https://localhost-api.example.com' })).toEqual([]);
  });

  it('asks for nothing outside Vercel production (local builds, CI, previews)', () => {
    expect(productionEnvironmentProblems({})).toEqual([]);
    expect(productionEnvironmentProblems({ VERCEL_ENV: 'preview' })).toEqual([]);
    expect(productionEnvironmentProblems({ VERCEL_ENV: 'development' })).toEqual([]);
  });
});

describe('rewriteBackend (DEPLOY-013)', () => {
  it('forwards to the backend in production and locally, without the trailing slash', () => {
    expect(rewriteBackend({ VERCEL_ENV: 'production', BACKEND_URL: 'https://paxl-api.onrender.com/' })).toBe('https://paxl-api.onrender.com');
    expect(rewriteBackend({ BACKEND_URL: 'http://localhost:8001' })).toBe('http://localhost:8001');
  });

  it('does not forward a Vercel preview to the backend, so it cannot write to production', () => {
    expect(rewriteBackend({ VERCEL_ENV: 'preview', BACKEND_URL: 'https://paxl-api.onrender.com' })).toBeUndefined();
  });

  it('lets a preview opt in explicitly', () => {
    expect(rewriteBackend({
      VERCEL_ENV: 'preview', BACKEND_URL: 'https://staging.example.com', PAXL_ALLOW_PREVIEW_BACKEND: '1',
    })).toBe('https://staging.example.com');
  });

  it('forwards nothing without a backend', () => {
    expect(rewriteBackend({})).toBeUndefined();
  });
});

describe('vercel.json (SEC-002)', () => {
  interface Transform { type: string; op: string; target: { key: string }; args: string; env: string[] }
  const config = JSON.parse(readFileSync(path.join(__dirname, '../../vercel.json'), 'utf8')) as {
    routes?: { src: string; continue?: boolean; transforms?: Transform[] }[];
  };

  it('adds the origin secret to every proxied /api and /media request and carries on to the rewrite', () => {
    const route = config.routes?.[0];

    expect(route?.src).toBe('/(api|media)/(.*)');
    expect(route?.continue).toBe(true);
    expect(route?.transforms).toEqual([{
      type: 'request.headers',
      op: 'set',
      target: { key: 'x-paxl-origin-secret' },
      args: '$PAXL_ORIGIN_SECRET',
      env: ['PAXL_ORIGIN_SECRET'],
    }]);
  });
});

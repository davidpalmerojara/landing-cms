import { describe, expect, it } from 'vitest';
import nextConfig from '@/next.config';

/**
 * SEC (images in PostgreSQL, requirement 6): /_next/image must not fetch,
 * resize and re-serve user uploads (/media/...) or other sites' images; it
 * only serves the landing's own screenshots (Vercel Hobby image quota).
 */
describe('Next image optimizer', () => {
  it('only optimises the landing screenshots', () => {
    expect(nextConfig.images?.localPatterns).toEqual([{ pathname: '/landing/**', search: '' }]);
    expect(nextConfig.images?.remotePatterns).toEqual([]);
  });
});

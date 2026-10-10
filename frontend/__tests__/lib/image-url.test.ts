import { describe, expect, it } from 'vitest';
import { isAllowedImageUrl } from '@/lib/image-url';

describe('pasted image URLs (QA-079) follow the server rules (ADR-034)', () => {
  it('accepts http(s) addresses and site paths', () => {
    expect(isAllowedImageUrl('https://images.example.com/a.png')).toBe(true);
    expect(isAllowedImageUrl('http://example.com/a.png?w=10')).toBe(true);
    expect(isAllowedImageUrl('/media/assets/2026/10/a.png')).toBe(true);
  });

  it('refuses anything that could escape a CSS url() or point elsewhere', () => {
    for (const url of [
      '',
      '//evil.example/a.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAA',
      'https://x.test/a.png);position:fixed',
      'https://x.test/a b.png',
      "https://x.test/a'.png",
      'https://x.test/a\\b.png',
      'https:///nohost.png',
      'ftp://x.test/a.png',
    ]) {
      expect(isAllowedImageUrl(url), url).toBe(false);
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  MAX_IMAGE_EDGE, MAX_UPLOAD_BYTES, encodingFor, fitWithin, needsDownscale, prepareImageForUpload, renamedFor,
  type DecodedImage, type ImageCodec, type Size,
} from '@/lib/image-downscale';

/**
 * MOBILE-001: phone photos (3-12 MB, 4000+ px) were refused with "Máximo 5 MB".
 * The browser now redraws them at the size the server keeps before uploading.
 */

function fileOf(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function fakeCodec(size: Size, encodedBytes: number, encodedType?: string) {
  const release = vi.fn();
  const encode = vi.fn(async (_image: DecodedImage, _target: Size, type: string) =>
    new Blob([new Uint8Array(encodedBytes)], { type: encodedType ?? type }));
  const codec: ImageCodec = {
    decode: vi.fn(async () => ({ source: {} as CanvasImageSource, ...size, release })),
    encode,
  };
  return { codec, encode, release };
}

describe('sizes', () => {
  it('fits the longest side within 1600 px, keeping the proportions', () => {
    expect(MAX_IMAGE_EDGE).toBe(1600);
    expect(fitWithin({ width: 4032, height: 3024 })).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    expect(fitWithin({ width: 10000, height: 1 })).toEqual({ width: 1600, height: 1 });
  });

  it('redraws big or heavy pictures, never GIFs', () => {
    expect(needsDownscale('image/jpeg', 300_000, { width: 4000, height: 3000 })).toBe(true);
    expect(needsDownscale('image/jpeg', 3_000_000, { width: 1200, height: 900 })).toBe(true);
    expect(needsDownscale('image/png', 200_000, { width: 1200, height: 900 })).toBe(false);
    expect(needsDownscale('image/gif', 4_000_000, { width: 4000, height: 3000 })).toBe(false);
  });

  it('photos stay JPEG; PNG and WebP become WebP so transparency survives', () => {
    expect(encodingFor('image/jpeg').type).toBe('image/jpeg');
    expect(encodingFor('image/png').type).toBe('image/webp');
    expect(encodingFor('image/webp').type).toBe('image/webp');
  });

  it('renames to the new type', () => {
    expect(renamedFor('IMG_0001.jpeg', 'image/jpeg')).toBe('IMG_0001.jpg');
    expect(renamedFor('logo.png', 'image/webp')).toBe('logo.webp');
    expect(renamedFor('foto', 'image/jpeg')).toBe('foto.jpg');
    expect(renamedFor('.png', 'image/webp')).toBe('image.webp');
  });
});

describe('prepareImageForUpload', () => {
  it('MOBILE-001: an 8 MB 4032x3024 phone photo becomes a 1600x1200 JPEG under the limit', async () => {
    const { codec, encode, release } = fakeCodec({ width: 4032, height: 3024 }, 400_000);
    const result = await prepareImageForUpload(fileOf(8 * 1024 * 1024, 'IMG_1234.jpeg', 'image/jpeg'), codec);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resized).toBe(true);
    expect(result.file.size).toBe(400_000);
    expect(result.file.type).toBe('image/jpeg');
    expect(result.file.name).toBe('IMG_1234.jpg');
    expect(encode).toHaveBeenCalledWith(expect.anything(), { width: 1600, height: 1200 }, 'image/jpeg', expect.any(Number));
    expect(release).toHaveBeenCalled();
  });

  it('a small picture is sent as it is', async () => {
    const { codec, encode } = fakeCodec({ width: 800, height: 600 }, 1);
    const file = fileOf(120_000, 'logo.png', 'image/png');
    const result = await prepareImageForUpload(file, codec);
    expect(result).toEqual({ ok: true, file, resized: false });
    expect(encode).not.toHaveBeenCalled();
  });

  it('a GIF is never redrawn (it would lose its animation)', async () => {
    const { codec } = fakeCodec({ width: 4000, height: 3000 }, 1);
    const file = fileOf(2_000_000, 'anim.gif', 'image/gif');
    const result = await prepareImageForUpload(file, codec);
    expect(result).toEqual({ ok: true, file, resized: false });
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it('SVG and other types are refused before anything is sent', async () => {
    const result = await prepareImageForUpload(fileOf(10, 'logo.svg', 'image/svg+xml'), fakeCodec({ width: 1, height: 1 }, 1).codec);
    expect(result).toEqual({ ok: false, reason: 'type', size: 10 });
  });

  it('a picture the browser cannot decode is sent as it is, if within the limit', async () => {
    const codec: ImageCodec = { decode: vi.fn(async () => { throw new Error('HEIC'); }), encode: vi.fn() };
    const file = fileOf(2_000_000, 'photo.jpg', 'image/jpeg');
    expect(await prepareImageForUpload(file, codec)).toEqual({ ok: true, file, resized: false });

    const big = fileOf(MAX_UPLOAD_BYTES + 1, 'big.jpg', 'image/jpeg');
    expect(await prepareImageForUpload(big, codec)).toEqual({ ok: false, reason: 'tooLarge', size: MAX_UPLOAD_BYTES + 1 });
  });

  it('keeps the original when the redraw is not smaller and the size was already fine', async () => {
    // A browser without WebP encoding answers PNG, which can be bigger than the source
    const { codec } = fakeCodec({ width: 1500, height: 1000 }, 3_000_000, 'image/png');
    const file = fileOf(2_000_000, 'shot.webp', 'image/webp');
    expect(await prepareImageForUpload(file, codec)).toEqual({ ok: true, file, resized: false });
  });

  it('still over the limit after the redraw: refused with the new size', async () => {
    const { codec } = fakeCodec({ width: 8000, height: 6000 }, MAX_UPLOAD_BYTES + 10, 'image/png');
    const result = await prepareImageForUpload(fileOf(20_000_000, 'noise.png', 'image/png'), codec);
    expect(result).toEqual({ ok: false, reason: 'tooLarge', size: MAX_UPLOAD_BYTES + 10 });
  });

  it('a failed encode keeps the original and frees the decoded picture', async () => {
    const release = vi.fn();
    const codec: ImageCodec = {
      decode: vi.fn(async () => ({ source: {} as CanvasImageSource, width: 3000, height: 2000, release })),
      encode: vi.fn(async () => null),
    };
    const file = fileOf(1_000_000, 'a.jpg', 'image/jpeg');
    expect(await prepareImageForUpload(file, codec)).toEqual({ ok: true, file, resized: false });
    expect(release).toHaveBeenCalled();
  });
});

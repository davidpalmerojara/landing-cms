import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import type { ApiAsset } from '@/lib/api';
import { ImageUploadRefused, imageUploadErrorMessage, uploadImage } from '@/lib/image-upload';
import type { ImageCodec } from '@/lib/image-downscale';
import { MESSAGES } from '@/lib/i18n';

/** ADR-049: every refusal of the upload pipeline has its own words, in both languages. */

const es = createTranslator({ locale: 'es', messages: MESSAGES.es });
const en = createTranslator({ locale: 'en', messages: MESSAGES.en });

function serverError(status: number, body: Record<string, unknown>) {
  return new ApiError(status, JSON.stringify(body));
}

afterEach(() => vi.restoreAllMocks());

describe('imageUploadErrorMessage', () => {
  it('says why, by server code', () => {
    const t = es as unknown as Parameters<typeof imageUploadErrorMessage>[1];
    expect(imageUploadErrorMessage(serverError(400, { code: 'INVALID_IMAGE' }), t, 'es')).toContain('no es una imagen');
    expect(imageUploadErrorMessage(serverError(400, { code: 'IMAGE_TOO_LARGE' }), t, 'es')).toContain('demasiados píxeles');
    expect(imageUploadErrorMessage(serverError(413, { code: 'FILE_TOO_LARGE', max_bytes: 5 * 1024 * 1024 }), t, 'es'))
      .toBe('El archivo pesa más de 5 MB. Prueba con una versión más pequeña.');
    expect(imageUploadErrorMessage(serverError(413, {}), t, 'es')).toContain('más de 5 MB');
    expect(imageUploadErrorMessage(serverError(403, { code: 'ASSET_QUOTA', max_files: 30, max_bytes: 15 * 1024 * 1024 }), t, 'es'))
      .toBe('Has llegado al límite de tu biblioteca (30 imágenes o 15 MB). Borra alguna para subir más.');
    expect(imageUploadErrorMessage(serverError(507, { code: 'STORAGE_FULL' }), t, 'es')).toContain('lleno');
    expect(imageUploadErrorMessage(serverError(429, { code: 'THROTTLED' }), t, 'es')).toContain('muchas imágenes seguidas');
  });

  it('in English too', () => {
    const t = en as unknown as Parameters<typeof imageUploadErrorMessage>[1];
    expect(imageUploadErrorMessage(serverError(403, { code: 'ASSET_QUOTA', max_files: 30, max_bytes: 15 * 1024 * 1024 }), t, 'en'))
      .toBe('Your library is full (30 images or 15 MB). Delete some to upload more.');
    expect(imageUploadErrorMessage(new ImageUploadRefused('tooLarge', 'big.jpg', 6.25 * 1024 * 1024), t, 'en'))
      .toBe('"big.jpg" is too large (6.3 MB) even after resizing. Maximum 5 MB.');
    expect(imageUploadErrorMessage(new ImageUploadRefused('type', 'logo.svg', 1), t, 'en')).toContain('"logo.svg" is not a valid file type');
  });

  it('a guest refusal or a dropped connection falls back to the general messages', () => {
    const t = es as unknown as Parameters<typeof imageUploadErrorMessage>[1];
    expect(imageUploadErrorMessage(new TypeError('Failed to fetch'), t, 'es')).toBe(es('apiErrors.offline'));
  });
});

describe('uploadImage', () => {
  it('sends the smaller redraw, not the original', async () => {
    const asset = { id: 'a' } as ApiAsset;
    const upload = vi.spyOn(api.assets, 'upload').mockResolvedValue(asset);
    const codec: ImageCodec = {
      decode: async () => ({ source: {} as CanvasImageSource, width: 4000, height: 3000, release: () => undefined }),
      encode: async (_image, _size, type) => new Blob([new Uint8Array(1000)], { type }),
    };
    const original = new File([new Uint8Array(7 * 1024 * 1024)], 'IMG.jpg', { type: 'image/jpeg' });

    expect(await uploadImage(original, codec)).toBe(asset);
    const sent = upload.mock.calls[0][0];
    expect(sent.size).toBe(1000);
    expect(sent.name).toBe('IMG.jpg');
  });

  it('refuses in the browser what the server would refuse anyway', async () => {
    const upload = vi.spyOn(api.assets, 'upload');
    await expect(uploadImage(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))).rejects.toBeInstanceOf(ImageUploadRefused);
    expect(upload).not.toHaveBeenCalled();
  });
});

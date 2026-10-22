/**
 * Uploading an image to the media library (ADR-049): make it smaller in the
 * browser, send it, and say why the server refused it in the interface's words.
 *
 *   const asset = await uploadImage(file);          // throws ImageUploadRefused or ApiError
 *   setError(imageUploadErrorMessage(e, t, locale)); // by reason or server code
 */
import { api, ApiError } from '@/lib/api';
import type { ApiAsset } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import type { Translate } from '@/lib/api-errors';
import { MAX_UPLOAD_BYTES, prepareImageForUpload } from '@/lib/image-downscale';
import type { ImageCodec } from '@/lib/image-downscale';

/** Defaults of the server's per-account quota (settings.ASSET_USER_MAX_FILES / _MB), used when the answer omits them. */
const DEFAULT_MAX_FILES = 30;
const DEFAULT_MAX_QUOTA_BYTES = 15 * 1024 * 1024;

/** Refused in the browser, before anything was sent. */
export class ImageUploadRefused extends Error {
  readonly reason: 'type' | 'tooLarge';
  readonly fileName: string;
  readonly size: number;

  constructor(reason: 'type' | 'tooLarge', fileName: string, size: number) {
    super(`Image upload refused: ${reason}`);
    this.name = 'ImageUploadRefused';
    this.reason = reason;
    this.fileName = fileName;
    this.size = size;
  }
}

/** Prepare (downscale) and upload one image; the server's answer is the new asset. */
export async function uploadImage(file: File, codec?: ImageCodec): Promise<ApiAsset> {
  const prepared = await prepareImageForUpload(file, codec);
  if (!prepared.ok) throw new ImageUploadRefused(prepared.reason, file.name, prepared.size);
  return api.assets.upload(prepared.file);
}

function numberFrom(body: Record<string, unknown> | null, key: string, fallback: number): number {
  const value = body?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function megabytes(bytes: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
}

/** What to tell the user when an upload failed. */
export function imageUploadErrorMessage(error: unknown, t: Translate, locale: string): string {
  if (error instanceof ImageUploadRefused) {
    if (error.reason === 'type') return t('assets.invalidType', { name: error.fileName });
    return t('assets.fileTooLarge', {
      name: error.fileName,
      size: megabytes(error.size, locale),
      max: megabytes(MAX_UPLOAD_BYTES, locale),
    });
  }
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_IMAGE':
        return t('assets.notAnImage');
      case 'IMAGE_TOO_LARGE':
        return t('assets.tooManyPixels');
      case 'FILE_TOO_LARGE':
      case 'REQUEST_TOO_LARGE':
        return t('assets.serverTooLarge', { max: megabytes(numberFrom(error.body, 'max_bytes', MAX_UPLOAD_BYTES), locale) });
      case 'ASSET_QUOTA':
        return t('assets.quotaReached', {
          files: numberFrom(error.body, 'max_files', DEFAULT_MAX_FILES),
          max: megabytes(numberFrom(error.body, 'max_bytes', DEFAULT_MAX_QUOTA_BYTES), locale),
        });
      case 'STORAGE_FULL':
        return t('assets.storageFull');
      default:
        break;
    }
    // A proxy in front may answer 413 without our envelope
    if (error.status === 413) return t('assets.serverTooLarge', { max: megabytes(MAX_UPLOAD_BYTES, locale) });
    if (error.status === 429) return t('assets.uploadThrottled');
  }
  return apiErrorMessage(error, t, 'assets.uploadRejected');
}

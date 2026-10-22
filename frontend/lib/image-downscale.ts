/**
 * Making a photo smaller in the browser before it is uploaded (MOBILE-001, ADR-049).
 *
 * A phone photo is 3-12 MB and 4000+ px wide; the server keeps at most
 * 1600 px (backend/pages/images.py MAX_EDGE) and refuses files over 5 MB.
 * Drawing it on a canvas at the size the server keeps turns it into a few
 * hundred KB, so the upload passes and is quick on a mobile connection. The
 * server decodes and encodes it again anyway: this is for size, not safety.
 *
 * Browsers apply the photo's orientation when they decode it into an <img>,
 * so the drawn pixels are upright. GIFs are sent as they are (a canvas would
 * keep only the first frame of an animation).
 */

/** Longest side the server stores (backend/pages/images.py MAX_EDGE). */
export const MAX_IMAGE_EDGE = 1600;
/** Largest file the server accepts (settings.ASSET_MAX_UPLOAD_BYTES). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** A file within MAX_IMAGE_EDGE and at most this big is sent as it is. */
export const SEND_AS_IS_BYTES = 1.5 * 1024 * 1024;
/** What the server accepts (pages/images.py ALLOWED_IMAGE_TYPES): no SVG (QA-074). */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const JPEG_QUALITY = 0.9;
const WEBP_QUALITY = 0.9;

export interface Size {
  width: number;
  height: number;
}

/** A decoded picture, ready to draw. `release` frees what decoding held (an object URL). */
export interface DecodedImage extends Size {
  source: CanvasImageSource;
  release: () => void;
}

/** How pictures are decoded and encoded; the browser's by default, replaceable in tests. */
export interface ImageCodec {
  decode: (file: Blob) => Promise<DecodedImage>;
  encode: (image: DecodedImage, size: Size, type: string, quality: number) => Promise<Blob | null>;
}

export type PreparedUpload =
  | { ok: true; file: File; resized: boolean }
  | { ok: false; reason: 'type' | 'tooLarge'; size: number };

export function isAllowedImageType(type: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

/** `size` scaled down so its longest side is at most `maxEdge`; never scaled up. */
export function fitWithin(size: Size, maxEdge: number = MAX_IMAGE_EDGE): Size {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxEdge) return { width: size.width, height: size.height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/** Whether a picture of this type, weight and size is worth redrawing before sending. */
export function needsDownscale(type: string, bytes: number, size: Size): boolean {
  if (type === 'image/gif') return false;
  return Math.max(size.width, size.height) > MAX_IMAGE_EDGE || bytes > SEND_AS_IS_BYTES;
}

/** Photos stay JPEG; PNG and WebP become WebP, which keeps transparency. */
export function encodingFor(type: string): { type: string; quality: number } {
  return type === 'image/jpeg'
    ? { type: 'image/jpeg', quality: JPEG_QUALITY }
    : { type: 'image/webp', quality: WEBP_QUALITY };
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** The original name with the extension of the new type ("IMG_0001.jpeg" -> "IMG_0001.jpg"). */
export function renamedFor(name: string, type: string): string {
  const extension = EXTENSIONS[type];
  if (!extension) return name;
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  return `${base || 'image'}.${extension}`;
}

/**
 * The file to upload for `file`: the same one, or a smaller redraw of it.
 * Refuses types the server does not take, and anything still over the limit.
 * A picture the browser cannot decode is sent as it is (the server decides).
 */
export async function prepareImageForUpload(file: File, codec: ImageCodec = browserCodec): Promise<PreparedUpload> {
  if (!isAllowedImageType(file.type)) return { ok: false, reason: 'type', size: file.size };

  let prepared: File = file;
  let resized = false;
  if (file.type !== 'image/gif') {
    let decoded: DecodedImage | null = null;
    try {
      decoded = await codec.decode(file);
    } catch (error) {
      // Not decodable here (a format or size this browser cannot draw): the server decides
      if (process.env.NODE_ENV === 'development') console.warn('Could not decode the image before uploading; sending the original', error);
    }
    if (decoded) {
      try {
        if (needsDownscale(file.type, file.size, decoded)) {
          const target = fitWithin(decoded);
          const encoding = encodingFor(file.type);
          const blob = await codec.encode(decoded, target, encoding.type, encoding.quality);
          // A browser that cannot write WebP answers PNG; only keep the redraw if it helps
          if (blob && blob.size > 0 && (blob.size < file.size || Math.max(decoded.width, decoded.height) > MAX_IMAGE_EDGE)) {
            const type = blob.type || encoding.type;
            prepared = new File([blob], renamedFor(file.name, type), { type, lastModified: file.lastModified });
            resized = true;
          }
        }
      } finally {
        decoded.release();
      }
    }
  }

  if (prepared.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'tooLarge', size: prepared.size };
  return { ok: true, file: prepared, resized };
}

// --- The browser's codec ---

/** A browser that neither loads nor fails a picture in this time gets the original sent. */
const DECODE_TIMEOUT_MS = 15_000;

function decodeInBrowser(file: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  const release = () => URL.revokeObjectURL(url);
  return new Promise<DecodedImage>((resolve, reject) => {
    const fail = (reason: string) => {
      window.clearTimeout(timer);
      release();
      reject(new Error(reason));
    };
    const timer = window.setTimeout(() => fail('Decoding the image took too long'), DECODE_TIMEOUT_MS);
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        fail('The image has no size');
        return;
      }
      window.clearTimeout(timer);
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, release });
    };
    image.onerror = () => fail('The browser could not decode the image');
    image.src = url;
  });
}

function encodeInBrowser(image: DecodedImage, size: Size, type: string, quality: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image.source, 0, 0, size.width, size.height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export const browserCodec: ImageCodec = { decode: decodeInBrowser, encode: encodeInBrowser };

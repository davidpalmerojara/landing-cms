"""Uploaded images, decoded and written again before they are stored (ADR-049).

The first bytes only say what a file claims to be: a file that starts like a
JPEG and goes on with `<html><script>` passed that check. Here Pillow decodes
the picture and a new file is encoded from its pixels, so what is stored and
served is only an image:

- nothing of the original file survives (EXIF with the GPS position of a
  phone photo, comments, embedded profiles, anything appended to it);
- the orientation the camera wrote is applied to the pixels first;
- colours are converted to sRGB, the profile browsers assume;
- the longest side is at most MAX_EDGE pixels and the result at most
  MAX_STORED_BYTES, so a 4 MB phone photo becomes a WebP of a few hundred KB.

Stills become WebP (photos lossy, graphics lossless when that stays small);
animated GIF and WebP keep their animation and their format.
"""
import io
import logging
import struct
import warnings
from dataclasses import dataclass

from PIL import Image, ImageCms, ImageOps, ImageSequence, UnidentifiedImageError

logger = logging.getLogger(__name__)

# What the server accepts, by signature. No SVG: it can carry script (QA-074).
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
# Pillow's name for each type: the decoder must agree with the signature
# (MPO is a JPEG with extra pictures appended, as some phone cameras write; its first one is used)
PILLOW_FORMATS = {
    'image/jpeg': {'JPEG', 'MPO'}, 'image/png': {'PNG'}, 'image/webp': {'WEBP'}, 'image/gif': {'GIF'},
}

# Longest side of a stored image: sharp as a full-width hero on a laptop
MAX_EDGE = 1600
# Above this, an encoded image is written again smaller (quality, then size)
MAX_STORED_BYTES = 1_500_000
# Pixels of the original. JPEG decodes at a reduced scale (draft), so a 48 MP
# phone photo costs little memory; other formats decode in full (4 bytes a pixel).
MAX_SOURCE_PIXELS_JPEG = 50_000_000
MAX_SOURCE_PIXELS_OTHER = 25_000_000
# Animations: frames and pixels of all frames together
MAX_FRAMES = 300
MAX_ANIMATION_PIXELS = 60_000_000
ANIMATION_MAX_EDGE = 800

PHOTO_QUALITY = 80
# PNG and GIF are usually logos, icons and screenshots: sharp edges and text
GRAPHIC_QUALITY = 90
SMALLER_QUALITY = 65
# Lossless WebP is tried for graphics up to this many pixels (on a large photo
# saved as PNG it costs seconds and is 4x bigger), and kept if at most this big
LOSSLESS_MAX_PIXELS = 1_000_000
LOSSLESS_MAX_BYTES = 400_000

# Pillow's own guard against decompression bombs, for any decode in this process
Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS_JPEG


class ImageRejected(Exception):
    """The upload is not an image this server stores. `code` is the API error code."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    mime_type: str
    extension: str
    width: int
    height: int


EXTENSIONS = {'image/webp': 'webp', 'image/gif': 'gif'}


def detect_image_type(uploaded_file) -> str | None:
    """Image type from the file's first bytes (its signature), not from the
    Content-Type the client declares, which anyone can set to image/png."""
    head = uploaded_file.read(12)
    uploaded_file.seek(0)
    if head.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if head.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if head[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
        return 'image/webp'
    return None


def _not_an_image() -> ImageRejected:
    return ImageRejected(
        'INVALID_IMAGE',
        'El archivo no es una imagen válida. Solo se aceptan JPG, PNG, WebP y GIF.',
    )


def _too_many_pixels() -> ImageRejected:
    return ImageRejected('IMAGE_TOO_LARGE', 'La imagen tiene demasiados píxeles.')


def process_image(uploaded_file) -> ProcessedImage:
    """Decode an upload and encode the image to store, or raise ImageRejected."""
    detected = detect_image_type(uploaded_file)
    if detected not in ALLOWED_IMAGE_TYPES:
        raise _not_an_image()

    with warnings.catch_warnings():
        # A picture past MAX_IMAGE_PIXELS is refused, not decoded with a warning
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        try:
            image = Image.open(uploaded_file)
            if image.format not in PILLOW_FORMATS[detected]:
                raise _not_an_image()
            width, height = image.size
            limit = MAX_SOURCE_PIXELS_JPEG if detected == 'image/jpeg' else MAX_SOURCE_PIXELS_OTHER
            if width < 1 or height < 1:
                raise _not_an_image()
            if width * height > limit:
                raise _too_many_pixels()
            if getattr(image, 'n_frames', 1) > 1 and detected in ('image/gif', 'image/webp'):
                return _process_animation(image, detected)
            return _process_still(image, detected)
        except ImageRejected:
            raise
        except (Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise _too_many_pixels() from None
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError, struct.error) as error:
            # Truncated or corrupt data, or bytes after a valid signature that are no image
            logger.info('Upload refused: not a decodable image (%s)', type(error).__name__)
            raise _not_an_image() from None


def _to_srgb(image: Image.Image) -> Image.Image:
    """Pixels converted from the embedded colour profile to sRGB; the profile itself is not kept."""
    profile = image.info.get('icc_profile')
    if not profile:
        return image
    try:
        source = ImageCms.ImageCmsProfile(io.BytesIO(profile))
        target = ImageCms.createProfile('sRGB')
        return ImageCms.profileToProfile(image, source, target, outputMode=image.mode)
    except (ImageCms.PyCMSError, OSError, ValueError):
        # A broken profile: the pixels are used as they are
        return image


def _has_alpha(image: Image.Image) -> bool:
    return image.mode in ('RGBA', 'LA', 'PA') or (image.mode == 'P' and 'transparency' in image.info)


def _process_still(image: Image.Image, detected: str) -> ProcessedImage:
    if detected == 'image/jpeg':
        # Decode at the smallest DCT scale that is still at least twice MAX_EDGE
        image.draft('RGB', (MAX_EDGE * 2, MAX_EDGE * 2))
    image.load()
    image = ImageOps.exif_transpose(image)
    alpha = _has_alpha(image)
    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGBA' if alpha else 'RGB')
    image = _to_srgb(image)
    image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)

    graphic = detected in ('image/png', 'image/gif')
    data = _encode_still(image, graphic)
    return ProcessedImage(data=data, mime_type='image/webp', extension='webp', width=image.width, height=image.height)


def _webp(image: Image.Image, **options) -> bytes:
    output = io.BytesIO()
    # No exif, icc_profile or xmp argument: the new file carries only pixels
    image.save(output, 'WEBP', method=4, **options)
    return output.getvalue()


def _encode_still(image: Image.Image, graphic: bool) -> bytes:
    if graphic and image.width * image.height <= LOSSLESS_MAX_PIXELS:
        lossless = _webp(image, lossless=True)
        if len(lossless) <= LOSSLESS_MAX_BYTES:
            return lossless
    data = _webp(image, quality=GRAPHIC_QUALITY if graphic else PHOTO_QUALITY)
    if len(data) <= MAX_STORED_BYTES:
        return data
    data = _webp(image, quality=SMALLER_QUALITY)
    while len(data) > MAX_STORED_BYTES and min(image.size) > 64:
        image = image.resize((max(1, image.width * 3 // 4), max(1, image.height * 3 // 4)), Image.Resampling.LANCZOS)
        data = _webp(image, quality=SMALLER_QUALITY)
    return data


def _process_animation(image: Image.Image, detected: str) -> ProcessedImage:
    frame_count = image.n_frames
    if frame_count > MAX_FRAMES or frame_count * image.width * image.height > MAX_ANIMATION_PIXELS:
        raise ImageRejected('IMAGE_TOO_LARGE', 'La animación tiene demasiados fotogramas o píxeles.')

    frames, durations = [], []
    for frame in ImageSequence.Iterator(image):
        durations.append(frame.info.get('duration', 100))
        copy = frame.convert('RGBA')
        copy.thumbnail((ANIMATION_MAX_EDGE, ANIMATION_MAX_EDGE), Image.Resampling.LANCZOS)
        frames.append(copy)
    first, rest = frames[0], frames[1:]
    output = io.BytesIO()
    loop = image.info.get('loop', 0)
    if detected == 'image/gif':
        first.save(output, 'GIF', save_all=True, append_images=rest, duration=durations, loop=loop, disposal=2, optimize=True)
    else:
        first.save(output, 'WEBP', save_all=True, append_images=rest, duration=durations, loop=loop, quality=PHOTO_QUALITY)
    data = output.getvalue()
    if len(data) > MAX_STORED_BYTES:
        raise ImageRejected('IMAGE_TOO_LARGE', 'La animación ocupa demasiado incluso reducida.')
    return ProcessedImage(data=data, mime_type=detected, extension=EXTENSIONS[detected], width=first.width, height=first.height)

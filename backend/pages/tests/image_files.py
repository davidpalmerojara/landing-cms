"""Real image files for upload tests, made with Pillow."""
import io
import struct
import zlib

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

GPS_IFD = 0x8825
ORIENTATION = 0x0112


def jpeg_bytes(width=64, height=48, color=(200, 30, 30), exif=None, quality=90) -> bytes:
    output = io.BytesIO()
    image = Image.new('RGB', (width, height), color)
    image.save(output, 'JPEG', quality=quality, **({'exif': exif} if exif is not None else {}))
    return output.getvalue()


def jpeg_with_gps_and_orientation(width=200, height=100, orientation=6) -> bytes:
    """A phone photo: GPS position in its EXIF and an orientation tag (6 = rotate 90° to display)."""
    exif = Image.Exif()
    exif[ORIENTATION] = orientation
    exif[0x010F] = 'PhoneMaker'
    gps = exif.get_ifd(GPS_IFD)
    gps[1] = 'N'
    gps[2] = (40.0, 25.0, 0.0)
    gps[3] = 'W'
    gps[4] = (3.0, 42.0, 0.0)
    return jpeg_bytes(width, height, exif=exif.tobytes())


def png_bytes(width=40, height=40, mode='RGBA', color=(0, 120, 255, 128)) -> bytes:
    output = io.BytesIO()
    Image.new(mode, (width, height), color).save(output, 'PNG')
    return output.getvalue()


def animated_gif_bytes(frames=3, size=(32, 32)) -> bytes:
    images = [Image.new('RGB', size, (frame * 80, 0, 255 - frame * 80)) for frame in range(frames)]
    output = io.BytesIO()
    images[0].save(output, 'GIF', save_all=True, append_images=images[1:], duration=100, loop=0)
    return output.getvalue()


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)


def png_header_claiming(width: int, height: int) -> bytes:
    """A PNG whose header announces `width` x `height` pixels, with almost no data (a decompression bomb)."""
    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return (
        b'\x89PNG\r\n\x1a\n'
        + _png_chunk(b'IHDR', header)
        + _png_chunk(b'IDAT', zlib.compress(b'\x00' * 64))
        + _png_chunk(b'IEND', b'')
    )


def upload(data: bytes, name='photo.jpg', content_type='image/jpeg') -> SimpleUploadedFile:
    return SimpleUploadedFile(name, data, content_type=content_type)

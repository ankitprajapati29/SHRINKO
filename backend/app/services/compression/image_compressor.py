from pathlib import Path
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError


SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP", "BMP", "TIFF"}

COMPRESSION_PRESETS = [
    (1.00, 95),
    (1.00, 90),
    (1.00, 85),
    (1.00, 80),
    (0.90, 85),
    (0.80, 80),
    (0.70, 75),
    (0.60, 70),
    (0.50, 65),
    (0.40, 60),
    (0.30, 55),
    (0.20, 50),
]


def validate_image(input_path: Path) -> None:
    if not input_path.exists():
        raise FileNotFoundError(f"Image not found: {input_path}")

    if not input_path.is_file():
        raise ValueError("Input path is not a file.")

    try:
        with Image.open(input_path) as image:
            if image.format not in SUPPORTED_FORMATS:
                raise ValueError("Unsupported image format.")

            image.verify()

    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("Invalid or corrupted image.") from error


def prepare_image(input_path: Path) -> Image.Image:
    with Image.open(input_path) as image:
        image = ImageOps.exif_transpose(image)

        if "A" in image.getbands():
            return image.convert("RGBA")

        return image.convert("RGB")


def encode_webp(
    image: Image.Image,
    quality: int,
) -> bytes:
    buffer = BytesIO()

    image.save(
        buffer,
        format="WEBP",
        quality=quality,
        method=6,
    )

    return buffer.getvalue()


def compress_image(
    input_path: str | Path,
    output_path: str | Path,
    target_size_bytes: int | None = None,
) -> dict:

    input_path = Path(input_path)
    output_path = Path(output_path)

    validate_image(input_path)

    original_size = input_path.stat().st_size

    if target_size_bytes is not None and target_size_bytes <= 0:
        raise ValueError("Target size must be greater than zero.")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Preserve the original when it already meets the target.
    if target_size_bytes is not None and original_size <= target_size_bytes:
        output_path.write_bytes(input_path.read_bytes())

        return {
            "success": True,
            "original_size": original_size,
            "compressed_size": original_size,
            "saved_bytes": 0,
            "saved_percentage": 0.0,
            "target_met": True,
            "format": Image.open(input_path).format,
            "message": "Original image already meets the target size.",
        }

    original_image = prepare_image(input_path)

    best_result = None

    for scale, quality in COMPRESSION_PRESETS:
        width = max(1, int(original_image.width * scale))
        height = max(1, int(original_image.height * scale))

        resized = original_image.resize(
            (width, height),
            Image.Resampling.LANCZOS,
        )

        encoded = encode_webp(resized, quality)

        candidate = {
            "data": encoded,
            "size": len(encoded),
            "width": width,
            "height": height,
            "quality": quality,
        }

        if best_result is None or candidate["size"] < best_result["size"]:
            best_result = candidate

        if (
            target_size_bytes is not None
            and candidate["size"] <= target_size_bytes
        ):
            best_result = candidate
            break

    if best_result is None:
        raise RuntimeError("Image compression failed.")

    # Never replace an image with a larger output.
    if best_result["size"] >= original_size:
        output_path.write_bytes(input_path.read_bytes())
        final_size = original_size
        output_format = Image.open(input_path).format
    else:
        output_path.write_bytes(best_result["data"])
        final_size = best_result["size"]
        output_format = "WEBP"

    saved_bytes = max(0, original_size - final_size)

    return {
        "success": True,
        "original_size": original_size,
        "compressed_size": final_size,
        "saved_bytes": saved_bytes,
        "saved_percentage": round(
            (saved_bytes / original_size) * 100, 2
        ),
        "target_met": (
            target_size_bytes is None
            or final_size <= target_size_bytes
        ),
        "width": best_result["width"],
        "height": best_result["height"],
        "quality": best_result["quality"],
        "format": output_format,
    }
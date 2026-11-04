
from pathlib import Path
from typing import Literal

from PIL import (
    Image,
    ImageOps,
    ImageEnhance,
    ImageFilter,
    UnidentifiedImageError,
)


EnhancementMode = Literal["enhance", "2x", "4x"]

SUPPORTED_FORMATS = {
    "JPEG",
    "PNG",
    "WEBP",
    "BMP",
    "TIFF",
}

MAX_IMAGE_PIXELS = 40_000_000


class EnhancementProvider:
    """Base interface for future AI enhancement providers."""

    def enhance(
        self,
        input_path: Path,
        output_path: Path,
        mode: EnhancementMode,
    ) -> dict:
        raise NotImplementedError


class BasicEnhancementProvider(EnhancementProvider):
    """
    Lightweight Pillow-based enhancement.
    This is image processing, NOT AI enhancement.
    """

    def enhance(
        self,
        input_path: Path,
        output_path: Path,
        mode: EnhancementMode,
    ) -> dict:

        if mode != "enhance":
            raise ValueError(
                "2x and 4x require a real AI enhancement provider."
            )

        with Image.open(input_path) as source:
            image = ImageOps.exif_transpose(source)
            image.load()

            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError(
                    "Image is too large for safe local processing."
                )

            has_alpha = "A" in image.getbands()

            if has_alpha:
                alpha = image.getchannel("A")
                image = image.convert("RGB")
            else:
                alpha = None
                image = image.convert("RGB")

            # Improve tonal balance.
            image = ImageOps.autocontrast(
                image,
                cutoff=1,
            )

            # Slight contrast improvement.
            image = ImageEnhance.Contrast(image).enhance(1.08)

            # Slight color improvement.
            image = ImageEnhance.Color(image).enhance(1.05)

            # Improve edge sharpness.
            image = image.filter(
                ImageFilter.UnsharpMask(
                    radius=1.2,
                    percent=125,
                    threshold=3,
                )
            )

            if alpha is not None:
                image.putalpha(alpha)

            output_path.parent.mkdir(
                parents=True,
                exist_ok=True,
            )

            suffix = output_path.suffix.lower()

            if suffix in (".jpg", ".jpeg"):
                image = image.convert("RGB")
                image.save(
                    output_path,
                    format="JPEG",
                    quality=92,
                    optimize=True,
                )
            elif suffix == ".png":
                image.save(
                    output_path,
                    format="PNG",
                    optimize=True,
                )
            elif suffix == ".webp":
                image.save(
                    output_path,
                    format="WEBP",
                    quality=92,
                    method=4,
                )
            else:
                raise ValueError(
                    "Output must be JPG, PNG or WEBP."
                )

        return {
            "provider": "Pillow Basic Enhancement",
            "is_ai": False,
            "message": "Basic image enhancement completed.",
        }


def validate_image(input_path: Path) -> None:

    if not input_path.exists():
        raise FileNotFoundError(
            f"Image not found: {input_path}"
        )

    if not input_path.is_file():
        raise ValueError("Input path is not a file.")

    try:
        with Image.open(input_path) as image:

            if image.format not in SUPPORTED_FORMATS:
                raise ValueError("Unsupported image format.")

            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("Image exceeds the safe pixel limit.")

            image.verify()

    except (UnidentifiedImageError, OSError) as error:
        raise ValueError(
            "Invalid or corrupted image."
        ) from error


def get_image_info(input_path: Path) -> dict:

    validate_image(input_path)

    with Image.open(input_path) as image:
        image = ImageOps.exif_transpose(image)

        return {
            "width": image.width,
            "height": image.height,
            "format": image.format,
            "mode": image.mode,
            "size_bytes": input_path.stat().st_size,
        }


def enhance_image(
    input_path: str | Path,
    output_path: str | Path,
    mode: EnhancementMode = "enhance",
    provider: EnhancementProvider | None = None,
) -> dict:

    input_path = Path(input_path)
    output_path = Path(output_path)

    if mode not in ("enhance", "2x", "4x"):
        raise ValueError(
            "Choose enhance, 2x or 4x."
        )

    validate_image(input_path)

    if input_path.resolve() == output_path.resolve():
        raise ValueError(
            "Input and output paths must be different."
        )

    if provider is None:
        if mode != "enhance":
            raise RuntimeError(
                "AI provider is not configured. "
                "2x and 4x AI upscaling are currently unavailable."
            )

        provider = BasicEnhancementProvider()

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    original_info = get_image_info(input_path)

    result = provider.enhance(
        input_path=input_path,
        output_path=output_path,
        mode=mode,
    )

    if not output_path.exists():
        raise RuntimeError(
            "Enhancement provider did not generate an output."
        )

    enhanced_info = get_image_info(output_path)

    return {
        "success": True,
        "mode": mode,
        "original": original_info,
        "enhanced": enhanced_info,
        "provider_result": result,
    }

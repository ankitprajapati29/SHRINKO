
from pathlib import Path
from io import BytesIO
import shutil
import tempfile

import pymupdf as fitz
from PIL import Image, ImageOps


# Quality-first presets:
# First optimize at original resolution.
# Reduce resolution only when necessary.
COMPRESSION_PRESETS = [
    {"scale": 1.00, "quality": 94},
    {"scale": 1.00, "quality": 90},
    {"scale": 1.00, "quality": 85},
    {"scale": 1.00, "quality": 80},
    {"scale": 1.00, "quality": 75},
    {"scale": 1.00, "quality": 65},
    {"scale": 0.95, "quality": 85},
    {"scale": 0.90, "quality": 82},
    {"scale": 0.85, "quality": 78},
    {"scale": 0.75, "quality": 75},
    {"scale": 0.65, "quality": 70},
    {"scale": 0.50, "quality": 65},
    {"scale": 0.40, "quality": 60},
    {"scale": 0.30, "quality": 55},
]


def validate_pdf(path: Path) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False

    try:
        with fitz.open(path) as document:
            return (
                document.is_pdf
                and document.page_count > 0
            )
    except Exception:
        return False


def save_optimized_pdf(document, output_path: Path):
    document.save(
        str(output_path),
        garbage=4,
        deflate=True,
        deflate_images=True,
        deflate_fonts=True,
        clean=True,
    )


def optimize_pdf_images(
    document,
    scale: float,
    quality: int,
):
    """
    Optimize embedded raster images.

    PDF text and vector content are not rasterized.
    Images with separate transparency masks are skipped.
    """

    processed_xrefs = set()

    for page in document:
        image_list = page.get_images(full=True)

        for image_info in image_list:
            xref = image_info[0]
            smask = image_info[1]

            if not xref or xref in processed_xrefs:
                continue

            processed_xrefs.add(xref)

            # Preserve transparency and soft masks.
            if smask:
                continue

            try:
                extracted = document.extract_image(xref)

                if not extracted:
                    continue

                original_bytes = extracted["image"]

                with Image.open(
                    BytesIO(original_bytes)
                ) as source:

                    source.load()

                    width, height = source.size

                    # Skip small images.
                    if width < 400 or height < 400:
                        continue

                    # Preserve CMYK and unusual image modes.
                    if source.mode not in (
                        "RGB",
                        "RGBA",
                        "L",
                        "P",
                    ):
                        continue

                    # Preserve alpha-channel images.
                    if (
                        source.mode == "RGBA"
                        or "transparency" in source.info
                    ):
                        continue

                    new_width = max(
                        1,
                        round(width * scale),
                    )

                    new_height = max(
                        1,
                        round(height * scale),
                    )

                    optimized = source.convert("RGB")

                    if (
                        new_width != width
                        or new_height != height
                    ):
                        optimized = optimized.resize(
                            (new_width, new_height),
                            Image.Resampling.LANCZOS,
                        )

                    output = BytesIO()

                    optimized.save(
                        output,
                        format="JPEG",
                        quality=quality,
                        optimize=True,
                        progressive=True,
                    )

                    optimized_bytes = output.getvalue()

                # Do not replace an image with a larger version.
                if len(optimized_bytes) >= len(original_bytes):
                    continue

                # Replace the image through PyMuPDF's image API.
                page.replace_image(
                    xref,
                    stream=optimized_bytes,
                )

            except Exception:
                # If an image cannot be safely optimized,
                # preserve the original image.
                continue


def compress_pdf(
    input_path: str,
    output_path: str,
    target_size_bytes: int | None = None,
) -> dict:
    """
    Quality-first adaptive PDF compression.

    1. Preserve original when already within target.
    2. Optimize PDF structure.
    3. Optimize embedded images at original resolution.
    4. Reduce image resolution only when required.
    5. Select the first high-quality result meeting target.
    6. If target is impossible, select the smallest valid result.

    Exact target size is not guaranteed.
    """

    source = Path(input_path)
    destination = Path(output_path)

    if not source.exists():
        raise FileNotFoundError("Input PDF not found.")

    if target_size_bytes is not None:
        if target_size_bytes <= 0:
            raise ValueError(
                "Target size must be greater than zero."
            )

    if source.resolve() == destination.resolve():
        raise ValueError(
            "Input and output paths must be different."
        )

    original_size = source.stat().st_size

    if original_size == 0:
        raise ValueError("The uploaded PDF is empty.")

    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Check PDF validity and encryption.
    try:
        with fitz.open(source) as check:
            if not check.is_pdf or check.page_count == 0:
                raise ValueError("Invalid PDF file.")

            if check.needs_pass:
                raise ValueError(
                    "Password-protected PDFs are not supported."
                )

    except ValueError:
        raise
    except Exception as error:
        raise ValueError(
            "Unable to open this PDF file."
        ) from error

    # Do not inflate or unnecessarily rewrite a PDF
    # that already meets the requested maximum size.
    if (
        target_size_bytes is not None
        and original_size <= target_size_bytes
    ):
        shutil.copy2(source, destination)

        return {
            "output_path": str(destination),
            "original_size": original_size,
            "compressed_size": original_size,
            "saved_bytes": 0,
            "target_size_bytes": target_size_bytes,
            "target_reached": True,
            "compression_preset": None,
        }

    best_path = None
    best_size = float("inf")
    selected_preset = None
    target_reached = False

    with tempfile.TemporaryDirectory() as temp_directory:

        temp_dir = Path(temp_directory)

        for index, preset in enumerate(COMPRESSION_PRESETS):

            candidate_path = (
                temp_dir / f"candidate_{index}.pdf"
            )

            document = fitz.open(source)

            try:
                optimize_pdf_images(
                    document,
                    scale=preset["scale"],
                    quality=preset["quality"],
                )

                save_optimized_pdf(
                    document,
                    candidate_path,
                )

            finally:
                document.close()

            if not validate_pdf(candidate_path):
                continue

            candidate_size = candidate_path.stat().st_size

            # Never choose a result larger than original.
            if candidate_size >= original_size:
                continue

            meets_target = (
                target_size_bytes is None
                or candidate_size <= target_size_bytes
            )

            if meets_target:
                # Presets are ordered from highest quality
                # to more aggressive compression.
                best_path = candidate_path
                best_size = candidate_size
                selected_preset = preset
                target_reached = True
                break

            # Keep the smallest valid candidate if target
            # cannot be reached.
            if candidate_size < best_size:
                best_path = candidate_path
                best_size = candidate_size
                selected_preset = preset

        if best_path is None:
            # No useful reduction: preserve original.
            shutil.copy2(source, destination)
            best_size = original_size
            selected_preset = None

        else:
            shutil.copy2(best_path, destination)

    if not validate_pdf(destination):
        shutil.copy2(source, destination)
        best_size = original_size
        selected_preset = None
        target_reached = (
            target_size_bytes is not None
            and original_size <= target_size_bytes
        )

    compressed_size = destination.stat().st_size

    return {
        "output_path": str(destination),
        "original_size": original_size,
        "compressed_size": compressed_size,
        "saved_bytes": original_size - compressed_size,
        "target_size_bytes": target_size_bytes,
        "target_reached": (
            compressed_size <= target_size_bytes
            if target_size_bytes is not None
            else None
        ),
        "compression_preset": selected_preset,
    }

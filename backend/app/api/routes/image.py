from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse

from app.services.compression.image_compressor import compress_image


router = APIRouter(prefix="/image", tags=["Image Compression"])

BASE_DIR = Path(__file__).resolve().parents[3]
UPLOAD_DIR = BASE_DIR / "uploads" / "images"
OUTPUT_DIR = BASE_DIR / "outputs" / "images"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/compress")
async def compress_image_api(
    file: UploadFile = File(...),
    target_size_kb: int | None = Form(default=None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing.")

    extension = Path(file.filename).suffix.lower()

    allowed_extensions = {
        ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"
    }

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image format."
        )

    if target_size_kb is not None and target_size_kb <= 0:
        raise HTTPException(
            status_code=400,
            detail="Target size must be greater than zero."
        )

    file_id = uuid4().hex

    input_path = UPLOAD_DIR / f"{file_id}{extension}"
    output_path = OUTPUT_DIR / f"{file_id}.webp"

    try:
        content = await file.read()

        if not content:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty."
            )

        input_path.write_bytes(content)

        target_bytes = (
            target_size_kb * 1024
            if target_size_kb is not None
            else None
        )

        result = compress_image(
            input_path=input_path,
            output_path=output_path,
            target_size_bytes=target_bytes,
        )

        return FileResponse(
            path=output_path,
            media_type="image/webp" if result["format"] == "WEBP"
            else file.content_type or "application/octet-stream",
            filename=(
                f"shrinko_{Path(file.filename).stem}."
                f"{'webp' if result['format'] == 'WEBP' else extension.lstrip('.')}"
            ),
            headers={
                "X-Original-Size": str(result["original_size"]),
                "X-Compressed-Size": str(result["compressed_size"]),
                "X-Saved-Percentage": str(result["saved_percentage"]),
                "X-Target-Met": str(result["target_met"]).lower(),
            },
        )

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Image compression failed: {str(error)}"
        ) from error

    finally:
        await file.close()
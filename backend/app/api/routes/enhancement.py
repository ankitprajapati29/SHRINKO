from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse

from app.services.enhancement.image_enhancer import enhance_image


router = APIRouter(
    prefix="/image",
    tags=["Image Enhancement"]
)

BASE_DIR = Path(__file__).resolve().parents[3]

UPLOAD_DIR = BASE_DIR / "uploads" / "enhancement"
OUTPUT_DIR = BASE_DIR / "outputs" / "enhancement"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"
}


@router.post("/enhance")
async def enhance_image_api(
    file: UploadFile = File(...),
    mode: str = Form("enhance")
):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Please upload an image."
        )

    extension = Path(file.filename).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image format."
        )

    if mode not in {"enhance", "2x", "4x"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid enhancement mode."
        )

    if mode in {"2x", "4x"}:
        raise HTTPException(
            status_code=501,
            detail="AI upscaling is not configured yet. Basic enhancement is available."
        )

    file_id = uuid4().hex

    input_path = UPLOAD_DIR / f"{file_id}{extension}"
    output_path = OUTPUT_DIR / f"{file_id}_enhanced.webp"

    try:
        with input_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                buffer.write(chunk)

        if input_path.stat().st_size == 0:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty."
            )

        result = enhance_image(
            input_path=input_path,
            output_path=output_path,
            mode=mode
        )

        if not output_path.exists():
            raise HTTPException(
                status_code=500,
                detail="Enhanced image was not generated."
            )

        original = result["original"]
        enhanced = result["enhanced"]
        provider = result["provider_result"]

        return FileResponse(
            path=str(output_path),
            media_type="image/webp",
            filename=f"shrinko_enhanced_{Path(file.filename).stem}.webp",
            headers={
                "X-Original-Size": str(original["size_bytes"]),
                "X-Enhanced-Size": str(enhanced["size_bytes"]),
                "X-Enhancement-Mode": result["mode"],
                "X-Enhancement-Type": (
                    "AI" if provider["is_ai"] else "Basic"
                ),
            }
        )

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except FileNotFoundError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except RuntimeError as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    finally:
        await file.close()
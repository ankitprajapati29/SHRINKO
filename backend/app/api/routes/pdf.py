
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.services.pdf_compressor import compress_pdf


router = APIRouter(prefix="/pdf", tags=["PDF Compression"])

BASE_DIR = Path(__file__).resolve().parents[3]
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/compress")
async def compress_pdf_endpoint(
    file: UploadFile = File(...),
    target_size_kb: float | None = Form(default=None),
):
    if not file.filename or Path(file.filename).suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=400,
            detail="Please upload a valid PDF file.",
        )

    if target_size_kb is not None and target_size_kb <= 0:
        raise HTTPException(
            status_code=400,
            detail="Target size must be greater than zero.",
        )

    file_id = uuid4().hex
    input_path = UPLOAD_DIR / f"{file_id}.pdf"
    output_path = OUTPUT_DIR / f"{file_id}_compressed.pdf"

    try:
        content = await file.read()

        if not content:
            raise HTTPException(
                status_code=400,
                detail="Uploaded PDF is empty.",
            )

        if not content.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is not a valid PDF.",
            )

        input_path.write_bytes(content)

        target_bytes = (
            int(target_size_kb * 1024)
            if target_size_kb is not None
            else None
        )

        result = compress_pdf(
            str(input_path),
            str(output_path),
            target_bytes,
        )

        return FileResponse(
            path=output_path,
            media_type="application/pdf",
            filename=f"{Path(file.filename).stem}_compressed.pdf",
            headers={
                "X-Original-Size": str(result["original_size"]),
                "X-Compressed-Size": str(result["compressed_size"]),
                "X-Target-Reached": str(result["target_reached"]).lower(),
                "Access-Control-Expose-Headers": (
                    "X-Original-Size, X-Compressed-Size, X-Target-Reached"
                ),
            },
        )

    except HTTPException:
        raise

    except Exception as error:
        if output_path.exists():
            output_path.unlink()

        raise HTTPException(
            status_code=500,
            detail=f"PDF compression failed: {str(error)}",
        ) from error

    finally:
        if input_path.exists():
            input_path.unlink()
        await file.close()

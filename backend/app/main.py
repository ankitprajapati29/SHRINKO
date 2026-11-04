from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import pdf, image, enhancement

app = FastAPI(
    title="SHRINKO API",
    description="Smart File Compression and Enhancement Platform",
    version="1.0.0",
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(pdf.router, prefix="/api")
app.include_router(image.router, prefix="/api")
app.include_router(enhancement.router, prefix="/api")


@app.get("/")
def home():
    return {
        "message": "Welcome to SHRINKO API",
        "status": "running",
        "features": [
            "PDF Compression",
            "Image Compression",
            "Image Enhancement",
        ],
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SHRINKO",
    }
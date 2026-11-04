from pathlib import Path
from app.services.compression.image_compressor import compress_image

input_file = Path("test_image.jpg")
output_file = Path("test_output.webp")

if not input_file.exists():
    print("Please put an image named test_image.jpg in backend folder.")
else:
    result = compress_image(
        input_path=input_file,
        output_path=output_file,
        target_size_bytes=500 * 1024
    )

    print("\nIMAGE COMPRESSION RESULT")
    print("------------------------")
    for key, value in result.items():
        print(f"{key}: {value}")
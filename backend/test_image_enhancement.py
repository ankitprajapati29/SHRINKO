from pathlib import Path

from app.services.enhancement.image_enhancer import enhance_image

input_file = Path("test_image.jpg")
output_file = Path("test_enhanced.webp")

if not input_file.exists():
    print("Test image not found.")
else:
    try:
        result = enhance_image(
            input_path=input_file,
            output_path=output_file,
            mode="enhance",
        )

        print("\nSHRINKO ENHANCEMENT RESULT")
        print("--------------------------")
        print(result)

    except Exception as error:
        print("Enhancement failed:", error)
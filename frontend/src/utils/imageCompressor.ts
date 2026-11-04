
export interface CompressionOptions {
  targetSizeBytes: number;
  maxIterations?: number;
}

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  achievedTarget: boolean;
}

interface Candidate {
  blob: Blob;
  quality: number;
  scale: number;
  width: number;
  height: number;
}

const QUALITY_MIN = 0.30;
const QUALITY_MAX = 0.99;

const RESOLUTION_SCALES = [
  1,
  0.95,
  0.90,
  0.85,
  0.80,
  0.75,
  0.70,
  0.65,
  0.60,
  0.50,
  0.40,
  0.30,
  0.20,
  0.10,
];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read this image."));
    };

    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Image compression failed."));
        }
      },
      "image/webp",
      quality,
    );
  });
}

function getDimensions(
  width: number,
  height: number,
  scale: number,
) {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function isBetterCandidate(
  candidate: Candidate,
  current: Candidate | null,
  targetSize: number,
): boolean {
  if (!current) return true;

  const candidateFits = candidate.blob.size <= targetSize;
  const currentFits = current.blob.size <= targetSize;

  if (candidateFits !== currentFits) {
    return candidateFits;
  }

  if (candidateFits && currentFits) {
    const candidatePixels = candidate.width * candidate.height;
    const currentPixels = current.width * current.height;

    if (candidatePixels !== currentPixels) {
      return candidatePixels > currentPixels;
    }

    return candidate.quality > current.quality;
  }

  return candidate.blob.size < current.blob.size;
}

function createOutputFile(
  blob: Blob,
  originalFile: File,
): File {
  const baseName =
    originalFile.name.replace(/\.[^/.]+$/, "") || "image";

  return new File(
    [blob],
    `${baseName}.webp`,
    {
      type: "image/webp",
      lastModified: Date.now(),
    },
  );
}

export async function compressImage(
  file: File,
  options: CompressionOptions,
): Promise<CompressionResult> {
  const {
    targetSizeBytes,
    maxIterations = 20,
  } = options;

  if (
    !Number.isFinite(targetSizeBytes) ||
    targetSizeBytes <= 0
  ) {
    throw new Error("Target size must be greater than zero.");
  }

  if (
    !Number.isInteger(maxIterations) ||
    maxIterations < 1 ||
    maxIterations > 30
  ) {
    throw new Error("Invalid compression iteration limit.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload a valid image.");
  }

  if (file.size === 0) {
    throw new Error("The uploaded image is empty.");
  }

  // If already below target, preserve the original quality.
  if (file.size <= targetSizeBytes) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      achievedTarget: true,
    };
  }

  const image = await loadImage(file);

  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;

  if (!originalWidth || !originalHeight) {
    throw new Error("Invalid image dimensions.");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    alpha: true,
  });

  if (!context) {
    throw new Error("Canvas is not supported.");
  }

  let bestCandidate: Candidate | null = null;

  try {
    for (const scale of RESOLUTION_SCALES) {
      const dimensions = getDimensions(
        originalWidth,
        originalHeight,
        scale,
      );

      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height,
      );

      context.drawImage(
        image,
        0,
        0,
        dimensions.width,
        dimensions.height,
      );

      let low = QUALITY_MIN;
      let high = QUALITY_MAX;

      let scaleBest: Candidate | null = null;

      const minimumBlob = await canvasToBlob(
        canvas,
        QUALITY_MIN,
      );

      scaleBest = {
        blob: minimumBlob,
        quality: QUALITY_MIN,
        scale,
        width: dimensions.width,
        height: dimensions.height,
      };

      if (minimumBlob.size <= targetSizeBytes) {
        for (
          let iteration = 0;
          iteration < maxIterations;
          iteration++
        ) {
          const quality = (low + high) / 2;

          const blob = await canvasToBlob(
            canvas,
            quality,
          );

          const candidate: Candidate = {
            blob,
            quality,
            scale,
            width: dimensions.width,
            height: dimensions.height,
          };

          if (
            isBetterCandidate(
              candidate,
              scaleBest,
              targetSizeBytes,
            )
          ) {
            scaleBest = candidate;
          }

          if (blob.size <= targetSizeBytes) {
            low = quality;
          } else {
            high = quality;
          }

          if (high - low < 0.002) {
            break;
          }
        }
      }

      if (
        isBetterCandidate(
          scaleBest,
          bestCandidate,
          targetSizeBytes,
        )
      ) {
        bestCandidate = scaleBest;
      }

      // Keep the highest resolution that meets the target.
      if (scaleBest.blob.size <= targetSizeBytes) {
        bestCandidate = scaleBest;
        break;
      }
    }
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }

  if (!bestCandidate) {
    throw new Error("Unable to compress this image.");
  }

  const outputFile = createOutputFile(
    bestCandidate.blob,
    file,
  );

  return {
    file: outputFile,
    originalSize: file.size,
    compressedSize: outputFile.size,
    achievedTarget: outputFile.size <= targetSizeBytes,
  };
}

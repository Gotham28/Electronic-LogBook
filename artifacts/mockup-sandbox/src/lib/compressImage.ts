export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_LONG_EDGE = 1600;

/**
 * Downscale (long edge <= 1600 px) and re-encode as JPEG q0.8. Re-encoding through a canvas
 * also drops EXIF metadata such as location. Rejects if the result is still over 5 MB.
 */
export async function compressImage(file: File): Promise<{ blob: Blob; size: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot process images");
    // JPEG has no alpha: fill white first so transparent PNG/WebP areas do not turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) throw new Error("Could not compress this image");
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("This image is still over 5 MB after compression. Choose a smaller image.");
    return { blob, size: blob.size };
  } finally {
    bitmap.close();
  }
}

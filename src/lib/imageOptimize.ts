/**
 * Compress and resize an image File before upload.
 * - Resizes so the longest side is <= maxDim (default 1200px)
 * - Re-encodes as JPEG with the given quality (default 0.82)
 * - Skips processing for tiny files or non-images
 */
export async function compressImage(
  file: File,
  maxDim = 1200,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  // PNGs with transparency: still re-encode as JPEG to save space (acceptable for product photos)
  if (file.size < 80 * 1024) return file; // <80KB — leave alone

  const bitmap = await loadBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  // White background in case original had transparency
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob: Blob | null = await new Promise(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

async function loadBitmap(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export interface CapturedPhoto {
  /** Compressed JPEG data URL — what gets stored/uploaded. */
  dataUrl: string;
  /** Full-resolution decoded image, for the counter to downscale itself. */
  image: HTMLImageElement;
  width: number;
  height: number;
}

function loadFileAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that photo.'));
    img.src = url;
  });
}

/** Loads a photo from an `<input type=file>` and produces a small JPEG for storage. */
export async function capturePhoto(file: File, maxDim = 900, quality = 0.72): Promise<CapturedPhoto> {
  const img = await loadFileAsImage(file);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported on this device.');
  ctx.drawImage(img, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    image: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
}

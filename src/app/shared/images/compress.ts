/** Lado mayor máximo de una foto subida (DATABASE.md §6): ~250–400 KB por foto. */
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.75;

/** Tamaño final manteniendo proporción, sin agrandar fotos chicas. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Reduce y convierte a JPEG en el teléfono antes de subir (ahorra datos móviles y espacio en Storage).
 * Respeta la orientación EXIF de la cámara.
 */
export async function compressImage(file: Blob): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  return { blob, width, height };
}

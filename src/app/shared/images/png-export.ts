/**
 * Exportar plantillas HTML a PNG y compartirlas (cotización y confección).
 * Usa modern-screenshot (carga diferida). La letra Inter va incluida en la app; se fuerza su carga
 * antes de dibujar para que la imagen no salga con otra fuente.
 */
export interface PngFile {
  url: string;
  blob: Blob;
  name: string;
}

export async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(['400', '500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 24px Inter`, 'Cotización Ñ $0')));
  await document.fonts.ready;
}

/** Convierte cada elemento (una página a 1080 px) en un PNG. */
export async function renderPng(elements: HTMLElement[]): Promise<Blob[]> {
  await ensureFonts();
  const { domToBlob } = await import('modern-screenshot');
  const out: Blob[] = [];
  for (const el of elements) {
    const blob = await domToBlob(el, { type: 'image/png', scale: 1, backgroundColor: '#ffffff', timeout: 15000 });
    if (!blob) throw new Error('No se pudo crear la imagen. Intenta de nuevo.');
    out.push(blob);
  }
  return out;
}

/** «COT-2026-0001.png» o «COT-2026-0001-1de2.png». */
export function toFiles(blobs: Blob[], base: string): PngFile[] {
  const n = blobs.length;
  return blobs.map((blob, i) => ({ blob, url: URL.createObjectURL(blob), name: n > 1 ? `${base}-${i + 1}de${n}.png` : `${base}.png` }));
}

export function revokeFiles(files: PngFile[]): void {
  for (const f of files) URL.revokeObjectURL(f.url);
}

function asFiles(files: PngFile[]): File[] {
  return files.map((f) => new File([f.blob], f.name, { type: 'image/png' }));
}

export function canShareFiles(files: PngFile[]): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !files.length) return false;
  return navigator.canShare({ files: asFiles(files) });
}

/** Abre el menú de compartir del teléfono. Llamar directo desde el toque del usuario. false si se canceló. */
export async function shareFiles(files: PngFile[], title: string): Promise<boolean> {
  try {
    await navigator.share({ files: asFiles(files), title });
    return true;
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return false;
    throw e;
  }
}

export function downloadFiles(files: PngFile[]): void {
  for (const f of files) {
    const a = document.createElement('a');
    a.href = f.url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/** Ancho disponible → zoom de la vista previa (la plantilla mide 1080 px). */
export function watchZoom(el: HTMLElement | undefined, set: (z: number) => void): ResizeObserver | undefined {
  if (!el || typeof ResizeObserver === 'undefined') return undefined;
  const ro = new ResizeObserver(() => set(Math.min(1, el.clientWidth / 1080)));
  ro.observe(el);
  return ro;
}

import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { thumbnailDataUrl } from '../../shared/images/compress';

export const PHOTO_BUCKET = 'curtain-photos';

export interface CurtainPhoto {
  id: string;
  curtain_id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  url: string | null;
}

/** Ruta en Storage: {rectificación}/{cortina}/{uuid}.jpg (las políticas validan la rectificación). */
export function photoPath(rectificationId: string, curtainId: string, id = crypto.randomUUID()): string {
  return `${rectificationId}/${curtainId}/${id}.jpg`;
}

/** Fotos por cortina en un bucket privado. Se ven con URL firmada temporal. */
@Injectable({ providedIn: 'root' })
export class PhotoRepository {
  private readonly db = inject(SUPABASE);

  async list(curtainId: string): Promise<CurtainPhoto[]> {
    const { data, error } = await this.db
      .from('curtain_photos')
      .select('id, curtain_id, storage_path, width, height')
      .eq('curtain_id', curtainId)
      .order('created_at');
    if (error) throw error;
    const rows = (data ?? []) as Omit<CurtainPhoto, 'url'>[];
    if (!rows.length) return [];
    const signed = await this.db.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 3600);
    if (signed.error) throw signed.error;
    const byPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
    return rows.map((r) => ({ ...r, url: byPath.get(r.storage_path) ?? null }));
  }

  /**
   * Miniaturas (data URL) de las fotos de varias cortinas, agrupadas por cortina, para la guía del instalador.
   * Se descargan de a 4 para no saturar la conexión del teléfono. Una foto que falla se omite.
   */
  async thumbnailsFor(curtainIds: string[], max = 520): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!curtainIds.length) return out;
    const { data, error } = await this.db
      .from('curtain_photos')
      .select('curtain_id, storage_path')
      .in('curtain_id', curtainIds)
      .order('created_at');
    if (error) throw error;
    const rows = (data ?? []) as { curtain_id: string; storage_path: string }[];
    const results: (string | null)[] = new Array(rows.length).fill(null);
    for (let i = 0; i < rows.length; i += 4) {
      await Promise.all(
        rows.slice(i, i + 4).map(async (r, k) => {
          const dl = await this.db.storage.from(PHOTO_BUCKET).download(r.storage_path);
          if (dl.error || !dl.data) return;
          try {
            results[i + k] = await thumbnailDataUrl(dl.data, max);
          } catch {
            /* foto dañada: se omite */
          }
        }),
      );
    }
    rows.forEach((r, i) => {
      const url = results[i];
      if (url) out.set(r.curtain_id, [...(out.get(r.curtain_id) ?? []), url]);
    });
    return out;
  }

  /** Sube el archivo y lo registra. Si el registro falla, borra el archivo para no dejar huérfanos. */
  async upload(rectificationId: string, curtainId: string, image: { blob: Blob; width: number; height: number }): Promise<void> {
    const path = photoPath(rectificationId, curtainId);
    const up = await this.db.storage.from(PHOTO_BUCKET).upload(path, image.blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
    const { error } = await this.db.from('curtain_photos').insert({
      curtain_id: curtainId, storage_path: path, width: image.width, height: image.height, size_bytes: image.blob.size,
    });
    if (error) {
      await this.db.storage.from(PHOTO_BUCKET).remove([path]);
      throw error;
    }
  }

  async remove(photo: Pick<CurtainPhoto, 'id' | 'storage_path'>): Promise<void> {
    const st = await this.db.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
    if (st.error) throw st.error;
    const { error } = await this.db.from('curtain_photos').delete().eq('id', photo.id);
    if (error) throw error;
  }

  /** Borra de Storage las fotos de varias cortinas (antes de borrar cortinas, ubicaciones o rectificaciones). */
  async removeForCurtains(curtainIds: string[]): Promise<void> {
    if (!curtainIds.length) return;
    const { data, error } = await this.db.from('curtain_photos').select('storage_path').in('curtain_id', curtainIds);
    if (error) throw error;
    const paths = (data ?? []).map((r: { storage_path: string }) => r.storage_path);
    if (paths.length) {
      const st = await this.db.storage.from(PHOTO_BUCKET).remove(paths);
      if (st.error) throw st.error;
    }
  }
}

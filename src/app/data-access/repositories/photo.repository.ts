import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';

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

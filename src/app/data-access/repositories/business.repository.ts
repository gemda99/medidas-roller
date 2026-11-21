import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { BusinessSettings, EMPTY_BUSINESS } from '../../domain/models/business';

const BRANDING = 'branding';
const DOCUMENTS = 'documents';

export interface StoredDocument {
  id: string;
  page: number;
  page_count: number;
  storage_path: string;
}

/** Configuración de la empresa, logo e imágenes generadas (buckets privados). */
@Injectable({ providedIn: 'root' })
export class BusinessRepository {
  private readonly db = inject(SUPABASE);

  async get(): Promise<BusinessSettings> {
    const { data, error } = await this.db.from('business_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    if (!data) return { ...EMPTY_BUSINESS };
    const { id: _id, updated_at: _u, ...rest } = data as BusinessSettings & { id: number; updated_at: string };
    return rest;
  }

  async update(patch: Partial<BusinessSettings>): Promise<void> {
    const { error } = await this.db.from('business_settings').update(patch).eq('id', 1);
    if (error) throw error;
  }

  async uploadLogo(file: Blob, ext: string): Promise<string> {
    const path = `logo-${Date.now()}.${ext}`;
    const up = await this.db.storage.from(BRANDING).upload(path, file, { contentType: file.type, upsert: true });
    if (up.error) throw up.error;
    await this.update({ logo_path: path });
    return path;
  }

  /** El logo como data URL: así se incrusta en la imagen sin problemas de origen cruzado. */
  async logoDataUrl(path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data, error } = await this.db.storage.from(BRANDING).download(path);
    if (error || !data) return null;
    return blobToDataUrl(data);
  }

  async listDocuments(quotationId: string, kind: 'cotizacion' | 'confeccion' = 'cotizacion'): Promise<StoredDocument[]> {
    const { data, error } = await this.db
      .from('generated_documents')
      .select('id, page, page_count, storage_path')
      .eq('quotation_id', quotationId)
      .eq('kind', kind)
      .order('page');
    if (error) throw error;
    return (data ?? []) as StoredDocument[];
  }

  async downloadDocument(path: string): Promise<Blob> {
    const { data, error } = await this.db.storage.from(DOCUMENTS).download(path);
    if (error || !data) throw error ?? new Error('No se pudo descargar la imagen.');
    return data;
  }

  /** Solo administrador: borra las imágenes guardadas para volver a generarlas. */
  async removeDocuments(docs: StoredDocument[]): Promise<void> {
    if (!docs.length) return;
    const { error } = await this.db.from('generated_documents').delete().in('id', docs.map((d) => d.id));
    if (error) throw error;
    await this.db.storage.from(DOCUMENTS).remove(docs.map((d) => d.storage_path));
  }

  /** Sube las páginas y las registra. Devuelve las rutas en orden. */
  async saveDocuments(
    rectificationId: string,
    quotationId: string,
    kind: 'cotizacion' | 'confeccion',
    pages: Blob[],
  ): Promise<string[]> {
    const stamp = Date.now();
    const paths: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      const path = `${rectificationId}/${quotationId}/${kind}-${stamp}-${i + 1}.png`;
      const up = await this.db.storage.from(DOCUMENTS).upload(path, pages[i], { contentType: 'image/png', upsert: false });
      if (up.error) throw up.error;
      paths.push(path);
    }
    const { error } = await this.db.from('generated_documents').insert(
      paths.map((storage_path, i) => ({ quotation_id: quotationId, kind, page: i + 1, page_count: pages.length, storage_path })),
    );
    if (error) {
      await this.db.storage.from(DOCUMENTS).remove(paths);
      throw error;
    }
    return paths;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

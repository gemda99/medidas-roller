import { SupabaseClient } from '@supabase/supabase-js';

/** Rutas que devuelven admin_delete_rectification / admin_delete_customer. */
export interface FilePaths {
  photos: string[];
  documents: string[];
}

/**
 * Borra de Storage los archivos de lo que se eliminó (fotos, imágenes generadas, firma).
 * Es limpieza: si falla, los datos ya se borraron y solo quedan archivos huérfanos (no se muestra error).
 */
export async function removeFiles(db: SupabaseClient, paths: FilePaths | null): Promise<void> {
  if (!paths) return;
  const chunks = <T>(a: T[], n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const c of chunks(paths.photos ?? [])) await db.storage.from('curtain-photos').remove(c);
  for (const c of chunks(paths.documents ?? [])) await db.storage.from('documents').remove(c);
}

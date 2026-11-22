import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { PhotoRepository } from './photo.repository';
import {
  CurtainPayload,
  Location,
  Rectification,
  RectificationGeneral,
  RectificationStatus,
  RectificationSummary,
} from '../../domain/models/rectification';

const SUMMARY = `id, customer_id, executive_id, executive_name, address_line, comuna, address_reference, visit_date,
  installation_date, observations, explained_light_entry, explained_fabric_position, explained_side_measure,
  status, created_at, updated_at, signature_path, signed_name, signed_rut, signed_at, customers(full_name, phone, rut)`;

const TREE = `${SUMMARY},
  locations(id, rectification_id, name, notes, sort_order, created_at,
    curtains(id, location_id, product_id, label, surface, surface_other, mounting, chain_side, chain_length_m,
      has_cenefa, swap_layers, notes, sort_order, created_at,
      curtain_components(id, role, product_id, color_name, width_cm, height_cm, fall, motorized),
      curtain_options(product_option_id),
      curtain_accessories(accessory_id, quantity),
      curtain_photos(id, storage_path)))`;

export interface NewRectification {
  customer_id: string;
  address_line: string;
  comuna: string;
  address_reference: string | null;
  visit_date: string;
}

type Sortable = { sort_order: number; created_at?: string };
const bySort = (a: Sortable, b: Sortable) =>
  a.sort_order - b.sort_order || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));

/** Acceso a rectificaciones, ubicaciones y cortinas. RLS limita al medidor a las suyas. */
@Injectable({ providedIn: 'root' })
export class RectificationRepository {
  private readonly db = inject(SUPABASE);
  private readonly photos = inject(PhotoRepository);

  async list(opts: { status?: RectificationStatus; customerId?: string; limit?: number } = {}): Promise<RectificationSummary[]> {
    let q = this.db.from('rectifications').select(SUMMARY).order('updated_at', { ascending: false }).limit(opts.limit ?? 100);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.customerId) q = q.eq('customer_id', opts.customerId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as RectificationSummary[];
  }

  async get(id: string): Promise<Rectification> {
    const { data, error } = await this.db.from('rectifications').select(TREE).eq('id', id).single();
    if (error) throw error;
    const r = data as unknown as Rectification;
    r.locations.sort(bySort);
    for (const l of r.locations) l.curtains.sort(bySort);
    return r;
  }

  async create(input: NewRectification): Promise<string> {
    const { data, error } = await this.db.from('rectifications').insert(input).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async updateGeneral(id: string, input: Partial<RectificationGeneral>): Promise<void> {
    const { error } = await this.db.from('rectifications').update(input).eq('id', id);
    if (error) throw error;
  }

  async setStatus(id: string, status: RectificationStatus): Promise<void> {
    const { error } = await this.db.from('rectifications').update({ status }).eq('id', id);
    if (error) throw error;
  }

  /** Sube la firma (PNG) y completa la rectificación en un solo paso (sign_rectification). */
  async sign(id: string, signature: Blob, name: string, rut: string | null): Promise<void> {
    const path = `${id}/firma-${Date.now()}.png`;
    const up = await this.db.storage.from('documents').upload(path, signature, { contentType: 'image/png', upsert: false });
    if (up.error) throw up.error;
    const { error } = await this.db.rpc('sign_rectification', { p_id: id, p_path: path, p_name: name, p_rut: rut });
    if (error) throw error;
  }

  /** La firma como data URL (para mostrarla y para incrustarla en imágenes sin problemas de origen). */
  async signatureDataUrl(path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data, error } = await this.db.storage.from('documents').download(path);
    if (error || !data) return null;
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(data);
    });
  }

  async remove(id: string): Promise<void> {
    await this.photos.removeForCurtains(await this.curtainIdsOf('rectification', id));
    const { data, error } = await this.db.from('rectifications').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw { code: '42501', message: 'permission denied' };
  }

  async addLocation(rectificationId: string, name: string, sortOrder: number): Promise<Location> {
    const { data, error } = await this.db
      .from('locations')
      .insert({ rectification_id: rectificationId, name, sort_order: sortOrder })
      .select('id, rectification_id, name, notes, sort_order')
      .single();
    if (error) throw error;
    return { ...(data as Omit<Location, 'curtains'>), curtains: [] };
  }

  async renameLocation(id: string, name: string): Promise<void> {
    const { error } = await this.db.from('locations').update({ name }).eq('id', id);
    if (error) throw error;
  }

  async moveLocation(id: string, delta: -1 | 1): Promise<void> {
    const { error } = await this.db.rpc('move_location', { p_id: id, p_delta: delta });
    if (error) throw error;
  }

  async removeLocation(id: string): Promise<void> {
    await this.photos.removeForCurtains(await this.curtainIdsOf('location', id));
    const { error } = await this.db.from('locations').delete().eq('id', id);
    if (error) throw error;
  }

  /** Crea o actualiza una cortina completa en una sola transacción (función save_curtain). */
  async saveCurtain(payload: CurtainPayload): Promise<string> {
    const { data, error } = await this.db.rpc('save_curtain', { p: payload });
    if (error) throw error;
    return data as string;
  }

  async removeCurtain(id: string): Promise<void> {
    await this.photos.removeForCurtains([id]);
    const { error } = await this.db.from('curtains').delete().eq('id', id);
    if (error) throw error;
  }

  /** Cortinas de una ubicación o rectificación, para borrar antes sus fotos de Storage. */
  private async curtainIdsOf(kind: 'location' | 'rectification', id: string): Promise<string[]> {
    const q =
      kind === 'location'
        ? this.db.from('curtains').select('id').eq('location_id', id)
        : this.db.from('curtains').select('id, locations!inner(rectification_id)').eq('locations.rectification_id', id);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: { id: string }) => r.id);
  }
}

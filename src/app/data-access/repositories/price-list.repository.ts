import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { PriceList, PriceListSettings, PriceListWithPrices } from '../../domain/models/pricing';

const COLUMNS = `id, name, status, valid_from, activated_at, created_at, general_min_price, motor_price,
  remote_control_per_motors, cenefa_price_ml, installation_mode, installation_project_price,
  installation_per_curtain_price, iva_rate, iva_mode_default, rounding_step, medidor_discount_enabled,
  medidor_max_discount_pct, notes`;

const num = <T extends PriceList>(l: T): T => ({
  ...l,
  iva_rate: Number(l.iva_rate),
  medidor_max_discount_pct: Number(l.medidor_max_discount_pct),
});

/**
 * Tarifarios. Un vigente no se edita: se copia como borrador, se ajusta y se activa.
 * El medidor solo puede leer el vigente (RLS).
 */
@Injectable({ providedIn: 'root' })
export class PriceListRepository {
  private readonly db = inject(SUPABASE);

  async list(): Promise<PriceList[]> {
    const { data, error } = await this.db.from('price_lists').select(COLUMNS).order('created_at', { ascending: false });
    if (error) throw error;
    return (data as unknown as PriceList[]).map(num);
  }

  async get(id: string): Promise<PriceListWithPrices> {
    const { data, error } = await this.db
      .from('price_lists')
      .select(`${COLUMNS}, product_prices(product_id, price_m2, min_price), accessory_prices(accessory_id, unit_price)`)
      .eq('id', id)
      .single();
    if (error) throw error;
    return num(data as unknown as PriceListWithPrices);
  }

  /** Tarifario vigente con precios, o null si aún no hay uno activado. */
  async getVigente(): Promise<PriceListWithPrices | null> {
    const { data, error } = await this.db.from('price_lists').select('id').eq('status', 'vigente').maybeSingle();
    if (error) throw error;
    return data ? this.get((data as { id: string }).id) : null;
  }

  async cloneAsDraft(fromId: string, name?: string): Promise<string> {
    const { data, error } = await this.db.rpc('clone_price_list', { p_id: fromId, p_name: name ?? null });
    if (error) throw error;
    return data as string;
  }

  async updateSettings(id: string, patch: Partial<PriceListSettings>): Promise<void> {
    const { error } = await this.db.from('price_lists').update(patch).eq('id', id);
    if (error) throw error;
  }

  async setProductPrice(listId: string, productId: string, price_m2: number | null, min_price: number | null): Promise<void> {
    const { error } = await this.db
      .from('product_prices')
      .upsert({ price_list_id: listId, product_id: productId, price_m2, min_price }, { onConflict: 'price_list_id,product_id' });
    if (error) throw error;
  }

  async setAccessoryPrice(listId: string, accessoryId: string, unit_price: number | null): Promise<void> {
    const { error } = await this.db
      .from('accessory_prices')
      .upsert({ price_list_id: listId, accessory_id: accessoryId, unit_price }, { onConflict: 'price_list_id,accessory_id' });
    if (error) throw error;
  }

  async missing(id: string): Promise<{ code: string; name: string }[]> {
    const { data, error } = await this.db.rpc('price_list_missing', { p_id: id });
    if (error) throw error;
    return (data ?? []) as { code: string; name: string }[];
  }

  async activate(id: string): Promise<void> {
    const { error } = await this.db.rpc('activate_price_list', { p_id: id });
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('price_lists').delete().eq('id', id);
    if (error) throw error;
  }
}

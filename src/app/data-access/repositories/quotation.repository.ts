import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { CustomerSnapshot, Quotation, QuotationStatus, QuotationSummary } from '../../domain/models/quotation';
import { PricingSnapshot, QuoteOptions, QuoteResult } from '../../domain/pricing/pricing-engine';

const SUMMARY = 'id, number, rectification_id, status, total_final, created_at, issued_at';

export interface SaveQuotationInput {
  id?: string;
  rectification_id: string;
  price_list_id: string | null;
  options: QuoteOptions;
  result: QuoteResult;
  valid_days: number;
  notes: string | null;
  adjustment_reason: string | null;
  customer_snapshot: CustomerSnapshot;
  pricing_snapshot: PricingSnapshot;
}

/** Cotizaciones. Los montos vienen del motor; la base valida coherencia y permisos. */
@Injectable({ providedIn: 'root' })
export class QuotationRepository {
  private readonly db = inject(SUPABASE);

  async listByRectification(rectificationId: string): Promise<QuotationSummary[]> {
    const { data, error } = await this.db
      .from('quotations')
      .select(SUMMARY)
      .eq('rectification_id', rectificationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as QuotationSummary[];
  }

  async get(id: string): Promise<Quotation> {
    const { data, error } = await this.db
      .from('quotations')
      .select(`*, quotation_items(*)`)
      .eq('id', id)
      .single();
    if (error) throw error;
    const q = data as unknown as Quotation;
    q.discount_value = Number(q.discount_value);
    q.quotation_items = q.quotation_items
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        ...i,
        width_cm: i.width_cm === null ? null : Number(i.width_cm),
        height_cm: i.height_cm === null ? null : Number(i.height_cm),
        area_m2: i.area_m2 === null ? null : Number(i.area_m2),
      }));
    return q;
  }

  async save(input: SaveQuotationInput): Promise<{ id: string; number: string }> {
    const r = input.result;
    const o = input.options;
    const p = {
      id: input.id ?? null,
      rectification_id: input.rectification_id,
      price_list_id: input.price_list_id,
      iva_mode: o.iva_mode,
      discount_type: o.discount_type,
      discount_value: o.discount_type === 'ninguno' ? 0 : o.discount_value,
      installation_mode: o.installation_mode,
      subtotal_products: r.subtotal_products,
      discount_amount: r.discount_amount,
      installation_amount: r.installation_amount,
      extras_amount: r.extras_amount,
      net_amount: r.net_amount,
      iva_amount: r.iva_amount,
      total_calculated: r.total_calculated,
      manual_adjustment: r.manual_adjustment,
      total_final: r.total_final,
      valid_days: input.valid_days,
      notes: input.notes,
      adjustment_reason: input.adjustment_reason,
      options: o,
      customer_snapshot: input.customer_snapshot,
      pricing_snapshot: input.pricing_snapshot,
      lines: r.lines,
    };
    const { data, error } = await this.db.rpc('save_quotation', { p });
    if (error) throw error;
    return data as { id: string; number: string };
  }

  async setStatus(id: string, status: QuotationStatus): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === 'emitida') patch['issued_at'] = new Date().toISOString();
    const { error } = await this.db.from('quotations').update(patch).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { data, error } = await this.db.from('quotations').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw { code: '42501', message: 'permission denied' };
  }
}

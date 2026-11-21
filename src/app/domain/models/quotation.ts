import { DiscountType, InstallationMode, IvaMode, PricingSnapshot, QuoteLine, QuoteOptions } from '../pricing/pricing-engine';

export type QuotationStatus = 'borrador' | 'emitida' | 'aceptada' | 'rechazada';

export interface CustomerSnapshot {
  full_name: string;
  phone: string;
  address_line: string;
  comuna: string;
  address_reference: string | null;
  executive_name: string;
}

export interface QuotationSummary {
  id: string;
  number: string;
  rectification_id: string;
  status: QuotationStatus;
  total_final: number;
  created_at: string;
  issued_at: string | null;
}

export interface QuotationItem extends QuoteLine {
  id?: string;
  sort_order: number;
}

export interface Quotation extends QuotationSummary {
  price_list_id: string | null;
  iva_mode: IvaMode;
  discount_type: DiscountType;
  discount_value: number;
  installation_mode: InstallationMode;
  subtotal_products: number;
  discount_amount: number;
  installation_amount: number;
  extras_amount: number;
  net_amount: number;
  iva_amount: number;
  total_calculated: number;
  manual_adjustment: number;
  valid_days: number;
  notes: string | null;
  options: Partial<QuoteOptions>;
  customer_snapshot: CustomerSnapshot;
  pricing_snapshot: PricingSnapshot;
  quotation_items: QuotationItem[];
}

export const STATUS_LABEL: Record<QuotationStatus, string> = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};

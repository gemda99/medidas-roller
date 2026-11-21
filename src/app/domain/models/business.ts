/** Datos de la empresa para la imagen de cotización. Todos opcionales: los completa el administrador. */
export interface BusinessSettings {
  business_name: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  logo_path: string | null;
  bank_name: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_holder: string | null;
  bank_holder_tax_id: string | null;
  bank_email: string | null;
  delivery_time_text: string | null;
  warranty_text: string | null;
  conditions_text: string | null;
  /** Garantía detallada: cobertura y casos no cubiertos. */
  warranty_details_text: string | null;
  thank_you_text: string | null;
  accent_color: string;
}

export const EMPTY_BUSINESS: BusinessSettings = {
  business_name: null, tax_id: null, phone: null, email: null, website: null, address: null, logo_path: null,
  bank_name: null, bank_account_type: null, bank_account_number: null, bank_holder: null, bank_holder_tax_id: null,
  bank_email: null, delivery_time_text: null, warranty_text: null, conditions_text: null, warranty_details_text: null, thank_you_text: null,
  accent_color: '#0F2A4A',
};

/** Líneas de condiciones: una por renglón, sin viñetas repetidas. */
export function conditionLines(text: string | null): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-*]+/, '').trim())
    .filter(Boolean);
}

export interface TextBlock {
  kind: 'title' | 'item';
  text: string;
}

/** Texto largo en bloques: una línea que termina en «:» es subtítulo; el resto, viñetas. */
export function textBlocks(text: string | null): TextBlock[] {
  return conditionLines(text).map((l) =>
    l.endsWith(':') ? { kind: 'title', text: l.slice(0, -1).trim() } : { kind: 'item', text: l },
  );
}

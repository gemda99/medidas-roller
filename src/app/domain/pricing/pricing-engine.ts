/**
 * Motor de cotización (HU-26). TypeScript puro: sin Angular, sin Supabase, sin fechas ni red.
 * Mismas entradas → mismo resultado. Reglas en docs/PRD.md §6:
 *
 *  1. Por tela: área m² = ancho × alto / 10.000; base = área × precio m² de esa tela.
 *  2. Cortina simple: max(base, mínimo del producto o mínimo general).
 *     Doble: max(suma de sus telas, mínimo del doble o general).
 *  3. Extras por cortina: cenefa (si es opcional y está marcada: ancho m × precio por metro),
 *     motores (n° de telas con motor × precio motor), accesorios (cantidad × precio).
 *  4. Accesorios de la cotización (control remoto: sugerido 1 cada N motores).
 *  5. Subtotal productos = todo lo anterior. Descuento (% o monto) solo sobre el subtotal.
 *  6. Neto = subtotal − descuento + instalación + adicionales.
 *  7. IVA al final: se suma / incluido / sin IVA. Redondeo por línea y en el IVA.
 *  8. Total final = total calculado + ajuste manual (se guardan ambos).
 */

export type IvaMode = 'excluido' | 'incluido' | 'sin';
export type InstallationMode = 'proyecto' | 'cortina' | 'manual';
export type DiscountType = 'ninguno' | 'porcentaje' | 'monto';

/** Copia congelada del tarifario y catálogo que usa una cotización. */
export interface PricingSnapshot {
  price_list_id: string;
  price_list_name: string;
  general_min_price: number;
  motor_price: number | null;
  remote_control_per_motors: number;
  cenefa_price_ml: number | null;
  installation_project_price: number | null;
  installation_per_curtain_price: number | null;
  iva_rate: number;
  rounding_step: number;
  products: Record<string, SnapshotProduct>;
  accessories: Record<string, SnapshotAccessory>;
  /** Reglas del tarifario que no afectan el cálculo pero sí lo que puede hacer el medidor. */
  medidor_discount_enabled?: boolean;
  medidor_max_discount_pct?: number;
  installation_mode_default?: InstallationMode;
  iva_mode_default?: IvaMode;
}

export interface SnapshotProduct {
  code: string;
  name: string;
  kind: 'tela' | 'sistema';
  cenefa_mode: 'no' | 'opcional' | 'incluida';
  has_mechanism: boolean;
  price_m2: number | null;
  min_price: number | null;
  /** Solo en dobles: tela de atrás y de adelante según el catálogo. */
  components?: { fondo: string; frente: string };
}

export interface SnapshotAccessory {
  name: string;
  scope: 'cortina' | 'cotizacion';
  unit_price: number | null;
}

export interface CurtainInput {
  id: string;
  location_name: string;
  label: string | null;
  product_id: string;
  swap_layers: boolean;
  has_cenefa: boolean;
  layers: { role: 'unica' | 'fondo' | 'frente'; width_cm: number; height_cm: number; color_name: string | null; motorized: boolean }[];
  accessories: { accessory_id: string; quantity: number }[];
}

export interface QuoteOptions {
  installation_mode: InstallationMode;
  /** Solo en modo manual. */
  installation_manual: number | null;
  discount_type: DiscountType;
  discount_value: number;
  iva_mode: IvaMode;
  manual_adjustment: number;
  /** Cantidad por accesorio de cotización; si falta, se usa la sugerida. */
  quote_accessories: Record<string, number>;
  extras: { name: string; quantity: number; unit_price: number }[];
}

export type LineKind = 'cortina' | 'cenefa' | 'motor' | 'accesorio' | 'adicional';

export interface QuoteLine {
  kind: LineKind;
  curtain_id: string | null;
  location_name: string;
  description: string;
  product_code: string | null;
  color_name: string | null;
  width_cm: number | null;
  height_cm: number | null;
  area_m2: number | null;
  base_price: number | null;
  min_price_applied: boolean;
  unit_price: number;
  quantity: number;
  line_total: number;
  /** Telas del doble con su medida y precio, para el detalle. */
  layers?: { label: string; product_code: string; width_cm: number; height_cm: number; area_m2: number; price: number }[];
}

export interface QuoteResult {
  lines: QuoteLine[];
  subtotal_products: number;
  discount_amount: number;
  installation_amount: number;
  extras_amount: number;
  net_amount: number;
  iva_amount: number;
  total_calculated: number;
  manual_adjustment: number;
  total_final: number;
  motors: number;
  suggested_quote_accessories: Record<string, number>;
  /** Problemas que impiden cotizar (precios faltantes, etc.). */
  errors: string[];
  /** Avisos que no impiden cotizar. */
  warnings: string[];
}

export function roundTo(value: number, step = 1): number {
  const s = step > 0 ? step : 1;
  return Math.round(value / s) * s;
}

/** Área en m² con 4 decimales (170 × 220 → 3,74). */
export function areaM2(widthCm: number, heightCm: number): number {
  return Math.round(((widthCm * heightCm) / 10000) * 10000) / 10000;
}

const ROLE_NAME = { unica: '', fondo: 'Atrás', frente: 'Adelante' } as const;

export function calculateQuote(curtains: CurtainInput[], prices: PricingSnapshot, opts: QuoteOptions): QuoteResult {
  const step = prices.rounding_step || 1;
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines: QuoteLine[] = [];
  let motors = 0;

  for (const c of curtains) {
    const product = prices.products[c.product_id];
    if (!product) {
      errors.push(`Producto desconocido en ${c.location_name}.`);
      continue;
    }
    const layers = [...c.layers].sort((a, b) => a.role.localeCompare(b.role));
    let base = 0;
    let missing = false;
    const detail: NonNullable<QuoteLine['layers']> = [];
    for (const l of layers) {
      const layerId = layerProductId(product, c.product_id, l.role, c.swap_layers);
      const lp = layerId ? prices.products[layerId] : undefined;
      if (!lp || lp.price_m2 === null) {
        missing = true;
        errors.push(`Falta el precio por m² de ${lp?.code ?? product.code} en el tarifario.`);
        continue;
      }
      const area = areaM2(l.width_cm, l.height_cm);
      const price = area * lp.price_m2;
      base += price;
      detail.push({ label: ROLE_NAME[l.role], product_code: lp.code, width_cm: l.width_cm, height_cm: l.height_cm, area_m2: area, price: roundTo(price, step) });
    }
    if (missing) continue;

    const min = product.min_price ?? prices.general_min_price;
    const minApplied = base < min;
    const unit = roundTo(minApplied ? min : base, step);
    const first = layers[0];
    const colors = [...new Set(layers.map((l) => l.color_name).filter(Boolean))].join(' / ') || null;
    lines.push({
      kind: 'cortina',
      curtain_id: c.id,
      location_name: c.location_name,
      description: c.label ? `${product.name} · ${c.label}` : product.name,
      product_code: product.code,
      color_name: colors,
      width_cm: first?.width_cm ?? null,
      height_cm: first?.height_cm ?? null,
      area_m2: layers.length === 1 ? areaM2(first.width_cm, first.height_cm) : detail.reduce((s, d) => s + d.area_m2, 0),
      base_price: roundTo(base, step),
      min_price_applied: minApplied,
      unit_price: unit,
      quantity: 1,
      line_total: unit,
      layers: product.kind === 'sistema' ? detail : undefined,
    });

    if (c.has_cenefa && product.cenefa_mode === 'opcional') {
      if (prices.cenefa_price_ml === null) {
        errors.push('Falta el precio de la cenefa en el tarifario.');
      } else {
        const widthM = Math.max(...layers.map((l) => l.width_cm)) / 100;
        const price = roundTo(widthM * prices.cenefa_price_ml, step);
        lines.push(extraLine('cenefa', c, `Cenefa ${fmt(widthM)} m`, price, 1));
      }
    }

    const motorCount = product.has_mechanism ? layers.filter((l) => l.motorized).length : 0;
    if (motorCount > 0) {
      motors += motorCount;
      if (prices.motor_price === null) errors.push('Falta el precio del motor en el tarifario.');
      else lines.push(extraLine('motor', c, motorCount === 1 ? 'Motor' : `Motor (${motorCount})`, prices.motor_price, motorCount));
    }

    for (const a of c.accessories) {
      const acc = prices.accessories[a.accessory_id];
      if (!acc || a.quantity <= 0) continue;
      if (acc.unit_price === null) errors.push(`Falta el precio de ${acc.name} en el tarifario.`);
      else lines.push(extraLine('accesorio', c, acc.name, acc.unit_price, a.quantity));
    }
  }

  // Accesorios de la cotización (control remoto: 1 cada N motores, el medidor puede cambiarlo).
  const suggested: Record<string, number> = {};
  for (const [id, acc] of Object.entries(prices.accessories)) {
    if (acc.scope !== 'cotizacion') continue;
    const isRemote = /control/i.test(acc.name);
    suggested[id] = isRemote && motors > 0 ? Math.ceil(motors / Math.max(1, prices.remote_control_per_motors)) : 0;
    const qty = opts.quote_accessories[id] ?? suggested[id];
    if (qty <= 0) continue;
    if (acc.unit_price === null) {
      errors.push(`Falta el precio de ${acc.name} en el tarifario.`);
      continue;
    }
    lines.push({
      kind: 'accesorio', curtain_id: null, location_name: '', description: acc.name, product_code: null, color_name: null,
      width_cm: null, height_cm: null, area_m2: null, base_price: null, min_price_applied: false,
      unit_price: acc.unit_price, quantity: qty, line_total: roundTo(acc.unit_price * qty, step),
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);

  let discount = 0;
  if (opts.discount_type === 'porcentaje' && opts.discount_value > 0) {
    discount = roundTo((subtotal * Math.min(opts.discount_value, 100)) / 100, step);
  } else if (opts.discount_type === 'monto' && opts.discount_value > 0) {
    discount = Math.min(roundTo(opts.discount_value, step), subtotal);
    if (opts.discount_value > subtotal) warnings.push('El descuento era mayor que el subtotal; se limitó al subtotal.');
  }

  const curtainCount = curtains.length;
  let installation = 0;
  if (opts.installation_mode === 'proyecto') {
    if (prices.installation_project_price === null) errors.push('Falta el precio de instalación por proyecto en el tarifario.');
    else installation = prices.installation_project_price;
  } else if (opts.installation_mode === 'cortina') {
    if (prices.installation_per_curtain_price === null) errors.push('Falta el precio de instalación por cortina en el tarifario.');
    else installation = prices.installation_per_curtain_price * curtainCount;
  } else {
    installation = Math.max(0, opts.installation_manual ?? 0);
  }
  installation = roundTo(installation, step);

  const extrasLines: QuoteLine[] = opts.extras
    .filter((e) => e.name.trim() && e.quantity > 0)
    .map((e) => ({
      kind: 'adicional' as const, curtain_id: null, location_name: '', description: e.name.trim(), product_code: null,
      color_name: null, width_cm: null, height_cm: null, area_m2: null, base_price: null, min_price_applied: false,
      unit_price: e.unit_price, quantity: e.quantity, line_total: roundTo(e.unit_price * e.quantity, step),
    }));
  const extras = extrasLines.reduce((s, l) => s + l.line_total, 0);

  const net = subtotal - discount + installation + extras;
  let iva = 0;
  let total = net;
  if (opts.iva_mode === 'excluido') {
    iva = roundTo(net * prices.iva_rate, step);
    total = net + iva;
  } else if (opts.iva_mode === 'incluido') {
    iva = roundTo(net - net / (1 + prices.iva_rate), step);
    total = net;
  }

  return {
    lines: [...lines, ...extrasLines],
    subtotal_products: subtotal,
    discount_amount: discount,
    installation_amount: installation,
    extras_amount: extras,
    net_amount: net,
    iva_amount: iva,
    total_calculated: total,
    manual_adjustment: opts.manual_adjustment,
    total_final: total + opts.manual_adjustment,
    motors,
    suggested_quote_accessories: suggested,
    errors: [...new Set(errors)],
    warnings,
  };
}

function layerProductId(product: SnapshotProduct, productId: string, role: 'unica' | 'fondo' | 'frente', swapped: boolean): string | undefined {
  if (role === 'unica' || !product.components) return productId;
  const eff = swapped ? (role === 'fondo' ? 'frente' : 'fondo') : role;
  return product.components[eff];
}

function extraLine(kind: LineKind, c: CurtainInput, description: string, unit: number, qty: number): QuoteLine {
  return {
    kind, curtain_id: c.id, location_name: c.location_name, description, product_code: null, color_name: null,
    width_cm: null, height_cm: null, area_m2: null, base_price: null, min_price_applied: false,
    unit_price: unit, quantity: qty, line_total: unit * qty,
  };
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

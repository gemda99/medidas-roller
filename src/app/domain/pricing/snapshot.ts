/** Arma las entradas del motor desde los datos de la app (TypeScript puro). */
import { Accessory, Product } from '../models/catalog';
import { PriceListWithPrices } from '../models/pricing';
import { Rectification } from '../models/rectification';
import { CurtainInput, PricingSnapshot } from './pricing-engine';

/** Copia congelada del tarifario + catálogo, para guardar dentro de la cotización. */
export function buildSnapshot(list: PriceListWithPrices, products: Product[], accessories: Accessory[]): PricingSnapshot {
  const priceOf = new Map(list.product_prices.map((p) => [p.product_id, p]));
  const accOf = new Map(list.accessory_prices.map((a) => [a.accessory_id, a.unit_price]));
  return {
    price_list_id: list.id,
    price_list_name: list.name,
    general_min_price: list.general_min_price,
    motor_price: list.motor_price,
    remote_control_per_motors: list.remote_control_per_motors,
    cenefa_price_ml: list.cenefa_price_ml,
    installation_project_price: list.installation_project_price,
    installation_per_curtain_price: list.installation_per_curtain_price,
    iva_rate: list.iva_rate,
    rounding_step: list.rounding_step,
    medidor_discount_enabled: list.medidor_discount_enabled,
    medidor_max_discount_pct: list.medidor_max_discount_pct,
    installation_mode_default: list.installation_mode,
    iva_mode_default: list.iva_mode_default,
    products: Object.fromEntries(
      products.map((p) => {
        const pr = priceOf.get(p.id);
        const fondo = p.product_components.find((c) => c.role === 'fondo')?.component_product_id;
        const frente = p.product_components.find((c) => c.role === 'frente')?.component_product_id;
        return [
          p.id,
          {
            code: p.code,
            name: p.name,
            kind: p.kind,
            cenefa_mode: p.cenefa_mode,
            has_mechanism: p.has_mechanism,
            price_m2: pr?.price_m2 ?? null,
            min_price: pr?.min_price ?? null,
            ...(p.kind === 'sistema' && fondo && frente ? { components: { fondo, frente } } : {}),
          },
        ];
      }),
    ),
    accessories: Object.fromEntries(
      accessories.filter((a) => a.active).map((a) => [a.id, { name: a.name, scope: a.scope, unit_price: accOf.get(a.id) ?? null }]),
    ),
  };
}

/** Cortinas de la rectificación en orden (ubicación, luego cortina), listas para el motor. */
export function curtainInputs(rect: Rectification): CurtainInput[] {
  return rect.locations.flatMap((l) =>
    l.curtains.map((c) => ({
      id: c.id,
      location_name: l.name,
      label: c.label,
      product_id: c.product_id,
      swap_layers: c.swap_layers,
      has_cenefa: c.has_cenefa,
      layers: c.curtain_components.map((x) => ({
        role: x.role,
        width_cm: Number(x.width_cm),
        height_cm: Number(x.height_cm),
        color_name: x.color_name,
        motorized: x.motorized,
      })),
      accessories: c.curtain_accessories.map((a) => ({ ...a })),
    })),
  );
}

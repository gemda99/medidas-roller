/**
 * Motor de confección (HU-42): medidas de fábrica a partir de las medidas de terreno.
 * TypeScript puro, sin Angular ni Supabase. Reglas por producto (D-25, D-30), editables en el catálogo:
 *   tela ancho = ancho + conf_fabric_w   (−4)      tubo    = ancho + conf_tube    (−3,5)
 *   tela alto  = alto  + conf_fabric_h   (+20)     G polvo = ancho + conf_bottom  (−3,5)
 *   cenefa     = ancho + conf_cenefa     (−0,5, solo si la cortina lleva cenefa)
 *   rodillo    = ancho + conf_roller     (dúo: −4,5 = G polvo − 1)
 * Un doble usa las reglas de cada tela. Un producto con fabricated = false (verticales) no lleva piezas.
 */
import { ComponentRole, Product } from '../models/catalog';
import { Curtain, CurtainComponent, Location } from '../models/rectification';
import { layerProduct } from '../rectification/curtain-rules';

export interface ConfectionLayer {
  /** '' en una cortina simple; «Atrás» o «Adelante» en un doble. */
  label: string;
  product_code: string;
  color_name: string | null;
  width_cm: number;
  height_cm: number;
  fabric_w: number | null;
  fabric_h: number | null;
  tube: number | null;
  bottom: number | null;
  roller: number | null;
  fall: string | null;
  motorized: boolean;
}

export interface ConfectionCurtain {
  index: number;
  location_name: string;
  product_code: string;
  product_name: string;
  label: string | null;
  /** Fabricación externa (verticales): solo medidas de terreno. */
  external: boolean;
  /** El producto no tiene reglas cargadas: el administrador debe completarlas. */
  missing_rules: boolean;
  layers: ConfectionLayer[];
  cenefa: number | null;
  chain: string | null;
  installation: string | null;
  extras: string[];
  notes: string | null;
}

export interface ConfectionNames {
  options: Map<string, string>;
  accessories: Map<string, string>;
}

const ROLE_ORDER: Record<ComponentRole, number> = { fondo: 0, frente: 1, unica: 0 };

/** Suma la regla a la medida; null si la regla no existe. Redondea a 1 decimal (166,5). */
export function applyRule(base: number, rule: number | null | undefined): number | null {
  if (rule === null || rule === undefined || !Number.isFinite(Number(rule))) return null;
  return Math.round((Number(base) + Number(rule)) * 10) / 10;
}

function hasRules(p: Product | undefined): boolean {
  return !!p && [p.conf_fabric_w, p.conf_fabric_h, p.conf_tube, p.conf_bottom].some((v) => v !== null && v !== undefined);
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const fmt = (n: number) => String(n).replace('.', ',');

export function confectionForCurtain(
  c: Curtain,
  index: number,
  locationName: string,
  catalog: Product[],
  names: ConfectionNames,
): ConfectionCurtain {
  const product = catalog.find((p) => p.id === c.product_id);
  const external = product ? !product.fabricated : false;
  const comps: CurtainComponent[] = [...c.curtain_components].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

  let missing = false;
  const layers: ConfectionLayer[] = comps.map((x) => {
    const fabric = product ? layerProduct(x.role, product, catalog, c.swap_layers) : undefined;
    const rules = external ? undefined : fabric;
    if (!external && !hasRules(fabric)) missing = true;
    const w = Number(x.width_cm);
    const h = Number(x.height_cm);
    return {
      label: x.role === 'unica' ? '' : x.role === 'fondo' ? 'Atrás' : 'Adelante',
      product_code: fabric?.code ?? product?.code ?? '—',
      color_name: x.color_name,
      width_cm: w,
      height_cm: h,
      fabric_w: applyRule(w, rules?.conf_fabric_w),
      fabric_h: applyRule(h, rules?.conf_fabric_h),
      tube: applyRule(w, rules?.conf_tube),
      bottom: applyRule(w, rules?.conf_bottom),
      roller: applyRule(w, rules?.conf_roller),
      fall: x.fall,
      motorized: x.motorized,
    };
  });

  // Cenefa: una por cortina, sobre el ancho de la primera tela, con la regla de esa tela.
  const withCenefa = !!product && (product.cenefa_mode === 'incluida' || (product.cenefa_mode === 'opcional' && c.has_cenefa));
  const first = comps[0];
  const firstFabric = product && first ? layerProduct(first.role, product, catalog, c.swap_layers) : undefined;
  const cenefa = withCenefa && first && !external ? applyRule(Number(first.width_cm), firstFabric?.conf_cenefa) : null;

  let chain: string | null = null;
  if (product?.has_mechanism !== false && (c.chain_side || c.chain_length_m)) {
    chain = [c.chain_side ? cap(c.chain_side) : null, c.chain_length_m ? `${fmt(Number(c.chain_length_m))} m` : null]
      .filter(Boolean)
      .join(' · ');
  }
  const installation =
    [c.mounting ? cap(c.mounting) : null, c.surface ? (c.surface === 'otro' ? c.surface_other || 'Otra' : cap(c.surface)) : null]
      .filter(Boolean)
      .join(' · ') || null;
  const extras = [
    ...(withCenefa ? ['Cenefa'] : []),
    ...c.curtain_options.map((o) => names.options.get(o.product_option_id) ?? ''),
    ...c.curtain_accessories.map((a) => {
      const n = names.accessories.get(a.accessory_id) ?? '';
      return n && a.quantity > 1 ? `${n} ×${a.quantity}` : n;
    }),
  ].filter(Boolean);

  return {
    index,
    location_name: locationName,
    product_code: product?.code ?? '—',
    product_name: product?.name ?? '',
    label: c.label,
    external,
    missing_rules: missing,
    layers,
    cenefa,
    chain,
    installation,
    extras,
    notes: c.notes,
  };
}

/** Todas las cortinas de la rectificación, en el orden de ubicaciones y cortinas, numeradas. */
export function confectionSheet(locations: Location[], catalog: Product[], names: ConfectionNames): ConfectionCurtain[] {
  const out: ConfectionCurtain[] = [];
  const locs = [...locations].sort((a, b) => a.sort_order - b.sort_order);
  for (const l of locs) {
    for (const c of [...l.curtains].sort((a, b) => a.sort_order - b.sort_order)) {
      out.push(confectionForCurtain(c, out.length + 1, l.name, catalog, names));
    }
  }
  return out;
}

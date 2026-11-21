/**
 * Reglas de negocio de la cortina, en TypeScript puro (sin Angular ni Supabase).
 * La base de datos vuelve a validar lo mismo en save_curtain.
 */
import { ComponentRole, Product } from '../models/catalog';
import { Curtain, CurtainComponent, CurtainPayload } from '../models/rectification';

export const MIN_CM = 10;
export const MAX_CM = 1000;

const ROLE_LABEL: Record<ComponentRole, string> = { unica: 'Tela', fondo: 'Atrás (fondo)', frente: 'Adelante (frente)' };

/** Roles de tela que exige un producto: 1 en simple, fondo y frente en un doble. */
export function rolesFor(product: Product): ComponentRole[] {
  if (product.kind === 'tela') return ['unica'];
  const order: ComponentRole[] = ['fondo', 'frente'];
  return order.filter((r) => product.product_components.some((c) => c.role === r));
}

/** Producto tela que ocupa un rol, considerando si el doble está invertido. */
export function layerProduct(role: ComponentRole, product: Product, catalog: Product[], swapped = false): Product | undefined {
  if (role === 'unica') return product;
  const effective = swapped ? (role === 'fondo' ? 'frente' : 'fondo') : role;
  const id = product.product_components.find((c) => c.role === effective)?.component_product_id;
  return catalog.find((p) => p.id === id);
}

/** Nombre visible de cada tela: «Atrás (fondo) · Sunscreen». */
export function componentLabel(role: ComponentRole, product: Product, catalog: Product[], swapped = false): string {
  if (role === 'unica') return ROLE_LABEL.unica;
  const comp = layerProduct(role, product, catalog, swapped);
  return comp ? `${ROLE_LABEL[role]} · ${comp.name}` : ROLE_LABEL[role];
}

/**
 * Adapta las telas al cambiar de producto. Conserva lo ya escrito:
 * al pasar de simple a doble, la segunda tela copia la primera (el medidor la ajusta si difiere).
 */
export function reshapeComponents(product: Product, current: CurtainComponent[]): CurtainComponent[] {
  const roles = rolesFor(product);
  const base: CurtainComponent = current[0] ?? { role: 'unica', color_name: null, width_cm: 0, height_cm: 0, fall: null, motorized: false };
  return roles.map((role, i) => {
    const same = current.find((c) => c.role === role) ?? current[i] ?? base;
    return {
      role,
      color_name: same.color_name,
      width_cm: same.width_cm,
      height_cm: same.height_cm,
      fall: same.fall,
      motorized: product.has_mechanism ? same.motorized : false,
    };
  });
}

export interface CurtainIssue {
  field: string;
  message: string;
}

/** Errores que impiden guardar. Mensajes listos para mostrar. */
export function validateCurtain(p: CurtainPayload, product: Product | undefined): CurtainIssue[] {
  const issues: CurtainIssue[] = [];
  if (!product) {
    issues.push({ field: 'product', message: 'Elige el producto.' });
    return issues;
  }
  const expected = rolesFor(product);
  const roles = p.components.map((c) => c.role);
  if (expected.length !== roles.length || expected.some((r) => !roles.includes(r))) {
    issues.push({ field: 'components', message: 'Las telas no coinciden con el producto.' });
  }
  p.components.forEach((c, i) => {
    for (const [key, label] of [['width_cm', 'ancho'], ['height_cm', 'alto']] as const) {
      const v = c[key];
      if (!Number.isFinite(v) || v < MIN_CM || v > MAX_CM) {
        issues.push({ field: `components.${i}.${key}`, message: `Escribe el ${label} en cm (entre ${MIN_CM} y ${MAX_CM}).` });
      }
    }
  });
  if (p.surface === 'otro' && !p.surface_other?.trim()) {
    issues.push({ field: 'surface_other', message: 'Indica qué superficie es.' });
  }
  if (product.has_mechanism && p.chain_length_m !== '' && (p.chain_length_m < 0.3 || p.chain_length_m > 6)) {
    issues.push({ field: 'chain_length_m', message: 'El largo de cadena debe estar entre 0,3 y 6 m.' });
  }
  return issues;
}

const fmtCm = (n: number) => String(n).replace('.', ',');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const roleOrder = (a: CurtainComponent, b: CurtainComponent) => a.role.localeCompare(b.role);

/** Resumen de una línea (para confirmaciones): «RDBO · Beige-3 · 222 × 180 cm». */
export function curtainSummary(c: Curtain, product: Product | undefined): string {
  const comps = [...c.curtain_components].sort(roleOrder);
  const parts = [product?.code ?? '—'];
  const colors = [...new Set(comps.map((x) => x.color_name).filter(Boolean))];
  if (colors.length) parts.push(colors.join(' / '));
  parts.push(comps.map((x) => `${fmtCm(x.width_cm)} × ${fmtCm(x.height_cm)}`).join(' + ') + ' cm');
  return parts.join(' · ');
}

export interface CardLayer {
  label: string;
  measures: string;
  details: string;
}

export interface CurtainCard {
  code: string;
  name: string;
  layers: CardLayer[];
  details: string[];
}

/**
 * Datos de la tarjeta de una cortina, como el cuadro de la hoja física:
 * producto arriba, cada tela con su medida, color, caída y motor, y luego instalación y extras.
 */
export function curtainCard(
  c: Curtain,
  product: Product | undefined,
  catalog: Product[],
  names: { options: Map<string, string>; accessories: Map<string, string> },
): CurtainCard {
  const comps = [...c.curtain_components].sort(roleOrder);
  const layers = comps.map((x) => {
    const layer = product ? layerProduct(x.role, product, catalog, c.swap_layers) : undefined;
    const label = x.role === 'unica' ? '' : `${x.role === 'fondo' ? 'Atrás' : 'Adelante'} · ${layer?.code ?? ''}`;
    const details = [x.color_name, x.fall ? `Caída ${x.fall}` : null, x.motorized ? 'Motor' : null].filter(Boolean).join(' · ');
    return { label, measures: `${fmtCm(x.width_cm)} × ${fmtCm(x.height_cm)}`, details };
  });
  const details: string[] = [];
  const place = [c.mounting && cap(c.mounting), c.surface && (c.surface === 'otro' ? c.surface_other ?? 'Otra' : cap(c.surface))]
    .filter(Boolean)
    .join(' · ');
  if (place) details.push(place);
  if (product?.has_mechanism !== false && (c.chain_side || c.chain_length_m)) {
    const side = c.chain_side ? (c.chain_side === 'izquierda' ? 'izq.' : 'der.') : '';
    const len = c.chain_length_m ? `${fmtCm(c.chain_length_m)} m` : '';
    details.push(['Cadena', side, len].filter(Boolean).join(' '));
  }
  const extras = [
    c.has_cenefa && product?.cenefa_mode === 'opcional' ? 'Cenefa' : null,
    ...c.curtain_options.map((o) => names.options.get(o.product_option_id) ?? null),
    ...c.curtain_accessories.map((a) => {
      const n = names.accessories.get(a.accessory_id);
      return n ? `${n}${a.quantity > 1 ? ` ×${a.quantity}` : ''}` : null;
    }),
  ].filter(Boolean);
  if (extras.length) details.push(extras.join(' · '));
  return { code: product?.code ?? '—', name: product?.name ?? '', layers, details };
}

/** Copia una cortina para «Duplicar»: mismos datos, sin id, misma ubicación. */
export function duplicatePayload(c: Curtain): CurtainPayload {
  return {
    location_id: c.location_id,
    product_id: c.product_id,
    label: c.label,
    surface: c.surface ?? '',
    surface_other: c.surface_other,
    mounting: c.mounting ?? '',
    chain_side: c.chain_side ?? '',
    chain_length_m: c.chain_length_m ?? '',
    has_cenefa: c.has_cenefa,
    swap_layers: c.swap_layers,
    notes: c.notes,
    components: [...c.curtain_components].sort(roleOrder).map(({ role, color_name, width_cm, height_cm, fall, motorized }) => ({
      role, color_name, width_cm: Number(width_cm), height_cm: Number(height_cm), fall, motorized,
    })),
    option_ids: c.curtain_options.map((o) => o.product_option_id),
    accessories: c.curtain_accessories.map((a) => ({ ...a })),
  };
}

/** ¿Se puede marcar la rectificación como completa? */
export function completionIssues(locations: { name: string; curtains: unknown[] }[]): string[] {
  if (locations.length === 0) return ['Agrega al menos una ubicación.'];
  const empty = locations.filter((l) => l.curtains.length === 0).map((l) => l.name);
  return empty.length ? [`Sin cortinas: ${empty.join(', ')}.`] : [];
}

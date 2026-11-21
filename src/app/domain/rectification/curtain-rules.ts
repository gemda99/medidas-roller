/**
 * Reglas de negocio de la cortina, en TypeScript puro (sin Angular ni Supabase).
 * La base de datos vuelve a validar lo mismo en save_curtain.
 */
import { ComponentRole, Product } from '../models/catalog';
import { Curtain, CurtainComponent, CurtainPayload } from '../models/rectification';

export const MIN_CM = 10;
export const MAX_CM = 1000;

const ROLE_LABEL: Record<ComponentRole, string> = { unica: 'Tela', fondo: 'Tela de fondo', frente: 'Tela de frente' };

/** Roles de tela que exige un producto: 1 en simple, fondo y frente en un doble. */
export function rolesFor(product: Product): ComponentRole[] {
  if (product.kind === 'tela') return ['unica'];
  const order: ComponentRole[] = ['fondo', 'frente'];
  return order.filter((r) => product.product_components.some((c) => c.role === r));
}

/** Nombre visible de cada tela: «Tela de fondo · Sunscreen». */
export function componentLabel(role: ComponentRole, product: Product, catalog: Product[]): string {
  if (role === 'unica') return ROLE_LABEL.unica;
  const compId = product.product_components.find((c) => c.role === role)?.component_product_id;
  const comp = catalog.find((p) => p.id === compId);
  return comp ? `${ROLE_LABEL[role]} · ${comp.name}` : ROLE_LABEL[role];
}

/**
 * Adapta las telas al cambiar de producto. Conserva las medidas ya escritas:
 * al pasar de simple a doble, la segunda tela copia la primera (el medidor la ajusta si difiere).
 */
export function reshapeComponents(product: Product, current: CurtainComponent[]): CurtainComponent[] {
  const roles = rolesFor(product);
  const base: CurtainComponent = current[0] ?? { role: 'unica', color_name: null, width_cm: 0, height_cm: 0, motorized: false };
  return roles.map((role, i) => {
    const same = current.find((c) => c.role === role) ?? current[i] ?? base;
    return { role, color_name: same.color_name, width_cm: same.width_cm, height_cm: same.height_cm, motorized: same.motorized };
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
  if (p.chain_length_m !== '' && (p.chain_length_m < 0.3 || p.chain_length_m > 6)) {
    issues.push({ field: 'chain_length_m', message: 'El largo de cadena debe estar entre 0,3 y 6 m.' });
  }
  return issues;
}

const fmtCm = (n: number) => String(n).replace('.', ',');

/** Resumen de una línea para listas: «RDBO · Beige-3 · 222 × 180 cm · Muro · Cadena izq. 1,5 m». */
export function curtainSummary(c: Curtain, product: Product | undefined): string {
  const parts: string[] = [];
  const comps = [...c.curtain_components].sort((a, b) => a.role.localeCompare(b.role));
  parts.push(product?.code ?? '—');
  const colors = [...new Set(comps.map((x) => x.color_name).filter(Boolean))];
  if (colors.length) parts.push(colors.join(' / '));
  parts.push(comps.map((x) => `${fmtCm(x.width_cm)} × ${fmtCm(x.height_cm)}`).join(' + ') + ' cm');
  if (c.mounting) parts.push(c.mounting[0].toUpperCase() + c.mounting.slice(1));
  if (c.chain_side) {
    const len = c.chain_length_m ? ` ${fmtCm(c.chain_length_m)} m` : '';
    parts.push(`Cadena ${c.chain_side === 'izquierda' ? 'izq.' : 'der.'}${len}`);
  }
  if (comps.some((x) => x.motorized)) parts.push('Motor');
  if (c.has_cenefa && product?.cenefa_mode === 'opcional') parts.push('Cenefa');
  return parts.join(' · ');
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
    fall: c.fall ?? '',
    chain_side: c.chain_side ?? '',
    chain_length_m: c.chain_length_m ?? '',
    has_cenefa: c.has_cenefa,
    notes: c.notes,
    components: c.curtain_components.map(({ role, color_name, width_cm, height_cm, motorized }) => ({
      role, color_name, width_cm: Number(width_cm), height_cm: Number(height_cm), motorized,
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

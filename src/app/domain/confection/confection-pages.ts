/** Filas y páginas de la imagen de confección (HU-43). Alturas estimadas a 1080 px de ancho. */
import { paginate } from '../quote-image/quote-pages';
import { ConfectionCurtain } from './confection-engine';

export type ConfectionRow =
  | { type: 'group'; label: string; height: number }
  | { type: 'curtain'; curtain: ConfectionCurtain; height: number };

export const CONF_HEADER_FIRST = 640;
export const CONF_HEADER_NEXT = 330;
export const CONF_ROW_GROUP = 58;
export const CONF_LAYER = 58;
export const CONF_CURTAIN_BASE = 92;
export const CONF_DETAIL_LINE = 30;
export const CONF_FOOTER = 260;
export const CONF_PAGE_MAX = 2800;

/** Líneas de detalle bajo la cortina (cadena, instalación, cenefa, rodillo, extras, nota). */
export function detailLines(c: ConfectionCurtain): number {
  const roller = c.layers.some((l) => l.roller !== null);
  const facts = [c.chain, c.installation, c.cenefa !== null, roller, c.extras.length > 0].filter(Boolean).length;
  return (facts ? 1 : 0) + (c.notes ? Math.ceil(c.notes.length / 80) : 0) + (c.missing_rules || c.external ? 1 : 0);
}

export function confectionRows(curtains: ConfectionCurtain[]): ConfectionRow[] {
  const rows: ConfectionRow[] = [];
  let current: string | null = null;
  for (const c of curtains) {
    if (c.location_name !== current) {
      rows.push({ type: 'group', label: c.location_name, height: CONF_ROW_GROUP });
      current = c.location_name;
    }
    rows.push({ type: 'curtain', curtain: c, height: CONF_CURTAIN_BASE + c.layers.length * CONF_LAYER + detailLines(c) * CONF_DETAIL_LINE });
  }
  return rows;
}

export function confectionPages(curtains: ConfectionCurtain[], observationsLength = 0): ConfectionRow[][] {
  const footer = CONF_FOOTER + Math.ceil(observationsLength / 85) * 30;
  return paginate(confectionRows(curtains), footer, CONF_PAGE_MAX, CONF_HEADER_FIRST, CONF_HEADER_NEXT);
}

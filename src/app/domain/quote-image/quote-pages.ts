/**
 * Arma las páginas de la imagen de cotización (HU-33). TypeScript puro y probado.
 * Cada fila tiene un alto estimado en px (a 1080 px de ancho). Si todo cabe, es una sola imagen;
 * si no, se divide en varias numeradas 1/n sin achicar la letra. El encabezado del cliente va en
 * la primera; los totales, condiciones y garantía, en la última. Un título de ubicación nunca queda solo al final.
 */
import { TextBlock } from '../models/business';
import { QuoteLine } from '../pricing/pricing-engine';

export type ImageRow =
  | { type: 'group'; label: string; height: number }
  | { type: 'line'; line: QuoteLine; sub: boolean; index: number | null; height: number };

/** Alto máximo por imagen: una cotización normal (hasta ~6 cortinas con condiciones y garantía) cabe en una sola. */
export const PAGE_MAX = 2800;
export const HEADER_FIRST = 760;
export const HEADER_NEXT = 330;
export const ROW_GROUP = 58;
export const ROW_ITEM = 96;
export const ROW_LAYER = 40;
export const ROW_SUB = 54;
export const FOOTER_BASE = 480;
export const TEXT_TITLE = 48;
export const TEXT_LINE = 28;
/** Caracteres por renglón aprox. del texto de condiciones a 19 px en 960 px útiles. */
export const TEXT_CHARS_PER_LINE = 92;

export function buildRows(lines: QuoteLine[]): ImageRow[] {
  const rows: ImageRow[] = [];
  let current: string | null = null;
  let n = 0;
  for (const l of lines) {
    const group = l.location_name || 'Adicionales';
    if (group !== current) {
      rows.push({ type: 'group', label: group, height: ROW_GROUP });
      current = group;
    }
    const sub = l.kind !== 'cortina' && !!l.curtain_id;
    const index = l.kind === 'cortina' ? ++n : null;
    const height = sub ? ROW_SUB : ROW_ITEM + (l.layers?.length ?? 0) * ROW_LAYER;
    rows.push({ type: 'line', line: l, sub, index, height });
  }
  return rows;
}

/** Alto de un bloque de texto (condiciones o garantía) según el largo de cada renglón. */
export function textHeight(blocks: TextBlock[]): number {
  if (!blocks.length) return 0;
  return (
    TEXT_TITLE +
    blocks.reduce(
      (s, b) => s + (b.kind === 'title' ? TEXT_TITLE : Math.ceil(b.text.length / TEXT_CHARS_PER_LINE) * TEXT_LINE + 6),
      0,
    )
  );
}

export function footerHeight(...texts: TextBlock[][]): number {
  return FOOTER_BASE + texts.reduce((s, t) => s + textHeight(t), 0);
}

/** Divide las filas en páginas. La última página debe dejar espacio para el pie (totales + textos). */
export function paginate(rows: ImageRow[], footer: number, max = PAGE_MAX): ImageRow[][] {
  const pages: ImageRow[][] = [];
  let page: ImageRow[] = [];
  let used = HEADER_FIRST;
  for (const r of rows) {
    if (used + r.height > max && page.length) {
      // No dejar un título de ubicación huérfano al final de la página.
      const last = page[page.length - 1];
      const carry = last?.type === 'group' ? [page.pop()!] : [];
      pages.push(page);
      page = carry;
      used = HEADER_NEXT + carry.reduce((s, x) => s + x.height, 0);
    }
    page.push(r);
    used += r.height;
  }
  // ¿Cabe el pie en la última página? Si no, pasa a una página propia (las condiciones largas pueden
  // hacer esa página más alta que el máximo: se acepta, la letra no se achica).
  if (used + footer > max && page.length) {
    pages.push(page);
    page = [];
  }
  pages.push(page);
  return pages;
}

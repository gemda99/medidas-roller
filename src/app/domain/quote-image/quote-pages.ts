/**
 * Arma las páginas de la imagen de cotización (HU-33). TypeScript puro y probado.
 * Cada fila tiene un alto estimado en px (a 1080 px de ancho). Si todo cabe, es una sola imagen;
 * si no, se divide en varias numeradas 1/n sin achicar la letra. El encabezado del cliente va en
 * la primera; los totales y condiciones, en la última. Un título de ubicación nunca queda solo al final.
 */
import { QuoteLine } from '../pricing/pricing-engine';

export type ImageRow =
  | { type: 'group'; label: string; height: number }
  | { type: 'line'; line: QuoteLine; sub: boolean; height: number };

export const PAGE_MAX = 1900;
export const HEADER_FIRST = 640;
export const HEADER_NEXT = 170;
export const ROW_GROUP = 64;
export const ROW_ITEM = 104;
export const ROW_SUB = 66;
export const FOOTER_BASE = 470;
export const FOOTER_PER_CONDITION = 36;

export function buildRows(lines: QuoteLine[]): ImageRow[] {
  const rows: ImageRow[] = [];
  let current: string | null = null;
  for (const l of lines) {
    const group = l.location_name || 'Adicionales';
    if (group !== current) {
      rows.push({ type: 'group', label: group, height: ROW_GROUP });
      current = group;
    }
    const sub = l.kind !== 'cortina' && !!l.curtain_id;
    rows.push({ type: 'line', line: l, sub, height: sub ? ROW_SUB : ROW_ITEM + (l.layers?.length ? 30 : 0) });
  }
  return rows;
}

export function footerHeight(conditionCount: number): number {
  return FOOTER_BASE + conditionCount * FOOTER_PER_CONDITION;
}

/** Divide las filas en páginas. La última página debe dejar espacio para el pie (totales + condiciones). */
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
  // ¿Cabe el pie en la última página? Si no, pasa a una página propia.
  if (used + footer > max && page.length) {
    pages.push(page);
    page = [];
  }
  pages.push(page);
  return pages;
}

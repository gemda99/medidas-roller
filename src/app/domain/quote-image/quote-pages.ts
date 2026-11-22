/**
 * Arma las páginas de la imagen de cotización (HU-33). TypeScript puro y probado.
 * Cada fila tiene un alto estimado en px (a 1080 px de ancho). Si todo cabe, es una sola imagen;
 * si no, se divide en varias numeradas 1/n sin achicar la letra. El encabezado del cliente va en
 * la primera; los totales, condiciones y garantía, en la última. Un título de ubicación nunca queda solo al final.
 */
import { TextBlock } from '../models/business';
import { QuoteLine } from '../pricing/pricing-engine';

/** Una cortina (o un adicional suelto) con sus cargos asociados (motor, cenefa, accesorios). */
export interface QuoteCard {
  /** N° de cortina; null en adicionales sueltos (control remoto, extras). */
  index: number | null;
  line: QuoteLine;
  subs: QuoteLine[];
  /** Total de la tarjeta: la cortina más sus cargos. */
  total: number;
}

export type ImageRow =
  | { type: 'group'; label: string; height: number }
  | { type: 'cards'; cards: QuoteCard[]; height: number };

/** Alto máximo por imagen: una cotización normal (hasta ~9 cortinas con condiciones y garantía) cabe en una sola. */
export const PAGE_MAX = 2600;
export const HEADER_FIRST = 560;
export const HEADER_NEXT = 250;
export const ROW_GROUP = 50;
/** Tarjetas por fila (1080 px de ancho). */
export const CARDS_PER_ROW = 3;
export const CARD_BASE = 150;
export const CARD_LAYER = 26;
export const CARD_SUB = 26;
export const CARD_GAP = 12;
export const FOOTER_BASE = 420;
export const TEXT_TITLE = 40;
export const TEXT_LINE = 24;
/** Caracteres por renglón aprox. del texto de condiciones a 17 px en 990 px útiles. */
export const TEXT_CHARS_PER_LINE = 108;

export function cardHeight(c: QuoteCard): number {
  return CARD_BASE + (c.line.layers?.length ?? 0) * CARD_LAYER + c.subs.length * CARD_SUB;
}

/** Agrupa las líneas por ubicación y arma tarjetas: cada cortina junto con su motor, cenefa y accesorios. */
export function buildCards(lines: QuoteLine[]): { label: string; cards: QuoteCard[] }[] {
  const groups: { label: string; cards: QuoteCard[] }[] = [];
  let n = 0;
  let last: QuoteCard | null = null;
  for (const l of lines) {
    const label = l.location_name || 'Adicionales';
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) {
      g = { label, cards: [] };
      groups.push(g);
      last = null;
    }
    const isSub = l.kind !== 'cortina' && !!l.curtain_id && last?.line.curtain_id === l.curtain_id;
    if (isSub && last) {
      last.subs.push(l);
      last.total += l.line_total;
      continue;
    }
    last = { index: l.kind === 'cortina' ? ++n : null, line: l, subs: [], total: l.line_total };
    g.cards.push(last);
  }
  return groups;
}

export function buildRows(lines: QuoteLine[], perRow = CARDS_PER_ROW): ImageRow[] {
  const rows: ImageRow[] = [];
  for (const g of buildCards(lines)) {
    rows.push({ type: 'group', label: g.label, height: ROW_GROUP });
    for (let i = 0; i < g.cards.length; i += perRow) {
      const cards = g.cards.slice(i, i + perRow);
      rows.push({ type: 'cards', cards, height: Math.max(...cards.map(cardHeight)) + CARD_GAP });
    }
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

export interface PageRow {
  type: string;
  height: number;
}

/**
 * Divide las filas en páginas. La última página debe dejar espacio para el pie (totales + textos).
 * Genérica: la usan la cotización y la hoja de confección (filas 'group' = título de ubicación).
 */
export function paginate<T extends PageRow>(
  rows: T[],
  footer: number,
  max = PAGE_MAX,
  headerFirst = HEADER_FIRST,
  headerNext = HEADER_NEXT,
): T[][] {
  const pages: T[][] = [];
  let page: T[] = [];
  let used = headerFirst;
  for (const r of rows) {
    if (used + r.height > max && page.length) {
      // No dejar un título de ubicación huérfano al final de la página.
      const last = page[page.length - 1];
      const carry = last?.type === 'group' ? [page.pop()!] : [];
      pages.push(page);
      page = carry;
      used = headerNext + carry.reduce((s, x) => s + x.height, 0);
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

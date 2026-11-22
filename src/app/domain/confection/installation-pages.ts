/**
 * Filas y páginas de la guía del instalador: por ubicación, las cortinas en tarjetas consecutivas
 * (3 por fila), igual que la cotización. Alturas estimadas a 1080 px de ancho.
 */
import { paginate } from '../quote-image/quote-pages';
import { ConfectionCurtain } from './confection-engine';

export interface GuideCard {
  curtain: ConfectionCurtain;
  photos: string[];
}

export type GuideRow =
  | { type: 'group'; label: string; height: number }
  | { type: 'cards'; cards: GuideCard[]; height: number };

export const GUIDE_HEADER_FIRST = 470;
export const GUIDE_HEADER_NEXT = 200;
export const GUIDE_GROUP = 50;
export const GUIDE_PER_ROW = 3;
export const GUIDE_CARD_BASE = 96;
export const GUIDE_LAYER = 30;
export const GUIDE_FACT = 24;
export const GUIDE_NOTE_LINE = 22;
export const GUIDE_PHOTO_MAIN = 190;
export const GUIDE_PHOTO_THUMBS = 74;
export const GUIDE_GAP = 12;
export const GUIDE_FOOTER = 170;
export const GUIDE_SIGNATURE = 250;
export const GUIDE_PAGE_MAX = 2600;
/** Hasta 3 fotos por cortina en la guía (más fotos alargan la imagen sin ayudar al instalador). */
export const GUIDE_MAX_PHOTOS = 3;

/** Datos de instalación que van como líneas en la tarjeta. */
export function guideFacts(c: ConfectionCurtain): [string, string][] {
  const out: [string, string][] = [];
  if (c.installation) out.push(['Instalación', c.installation]);
  if (c.chain) out.push(['Cadena', c.chain]);
  if (c.cenefa !== null) out.push(['Cenefa', 'Sí']);
  const extras = c.extras.filter((e) => e !== 'Cenefa');
  if (extras.length) out.push(['Lleva', extras.join(', ')]);
  return out;
}

export function guideCardHeight(card: GuideCard): number {
  const c = card.curtain;
  const notes = c.notes ? Math.ceil(c.notes.length / 34) * GUIDE_NOTE_LINE + 12 : 0;
  const photos = card.photos.length ? GUIDE_PHOTO_MAIN + (card.photos.length > 1 ? GUIDE_PHOTO_THUMBS : 0) : 0;
  return GUIDE_CARD_BASE + c.layers.length * GUIDE_LAYER + guideFacts(c).length * GUIDE_FACT + notes + photos;
}

export function guideRows(curtains: ConfectionCurtain[], photos: Map<string, string[]>, perRow = GUIDE_PER_ROW): GuideRow[] {
  const rows: GuideRow[] = [];
  const groups: { label: string; cards: GuideCard[] }[] = [];
  for (const c of curtains) {
    let g = groups[groups.length - 1];
    if (!g || g.label !== c.location_name) {
      g = { label: c.location_name, cards: [] };
      groups.push(g);
    }
    g.cards.push({ curtain: c, photos: (photos.get(c.curtain_id) ?? []).slice(0, GUIDE_MAX_PHOTOS) });
  }
  for (const g of groups) {
    rows.push({ type: 'group', label: g.label, height: GUIDE_GROUP });
    for (let i = 0; i < g.cards.length; i += perRow) {
      const cards = g.cards.slice(i, i + perRow);
      rows.push({ type: 'cards', cards, height: Math.max(...cards.map(guideCardHeight)) + GUIDE_GAP });
    }
  }
  return rows;
}

export function guidePages(
  curtains: ConfectionCurtain[],
  photos: Map<string, string[]>,
  opts: { observationsLength?: number; signed?: boolean } = {},
): GuideRow[][] {
  const footer = GUIDE_FOOTER + Math.ceil((opts.observationsLength ?? 0) / 100) * 26 + (opts.signed ? GUIDE_SIGNATURE : 0);
  return paginate(guideRows(curtains, photos), footer, GUIDE_PAGE_MAX, GUIDE_HEADER_FIRST, GUIDE_HEADER_NEXT);
}

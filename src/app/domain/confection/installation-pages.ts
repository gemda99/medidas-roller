/** Filas y páginas de la guía del instalador. Alturas estimadas a 1080 px de ancho. */
import { paginate } from '../quote-image/quote-pages';
import { ConfectionCurtain } from './confection-engine';

export type GuideRow =
  | { type: 'group'; label: string; height: number }
  | { type: 'curtain'; curtain: ConfectionCurtain; photos: string[]; height: number };

export const GUIDE_HEADER_FIRST = 660;
export const GUIDE_HEADER_NEXT = 250;
export const GUIDE_GROUP = 58;
export const GUIDE_BASE = 84;
export const GUIDE_LAYER = 40;
export const GUIDE_FACTS = 52;
export const GUIDE_PHOTOS = 236;
export const GUIDE_FOOTER = 200;
export const GUIDE_SIGNATURE = 300;
export const GUIDE_PAGE_MAX = 2800;
/** Hasta 3 fotos por cortina en la guía (más fotos alargan la imagen sin ayudar al instalador). */
export const GUIDE_MAX_PHOTOS = 3;

export function guideRows(curtains: ConfectionCurtain[], photos: Map<string, string[]>): GuideRow[] {
  const rows: GuideRow[] = [];
  let current: string | null = null;
  for (const c of curtains) {
    if (c.location_name !== current) {
      rows.push({ type: 'group', label: c.location_name, height: GUIDE_GROUP });
      current = c.location_name;
    }
    const p = (photos.get(c.curtain_id) ?? []).slice(0, GUIDE_MAX_PHOTOS);
    const facts = c.installation || c.chain || c.cenefa !== null || c.extras.length ? GUIDE_FACTS : 0;
    const notes = c.notes ? Math.ceil(c.notes.length / 80) * 30 + 10 : 0;
    rows.push({
      type: 'curtain',
      curtain: c,
      photos: p,
      height: GUIDE_BASE + c.layers.length * GUIDE_LAYER + facts + notes + (p.length ? GUIDE_PHOTOS : 0),
    });
  }
  return rows;
}

export function guidePages(
  curtains: ConfectionCurtain[],
  photos: Map<string, string[]>,
  opts: { observationsLength?: number; signed?: boolean } = {},
): GuideRow[][] {
  const footer = GUIDE_FOOTER + Math.ceil((opts.observationsLength ?? 0) / 85) * 30 + (opts.signed ? GUIDE_SIGNATURE : 0);
  return paginate(guideRows(curtains, photos), footer, GUIDE_PAGE_MAX, GUIDE_HEADER_FIRST, GUIDE_HEADER_NEXT);
}

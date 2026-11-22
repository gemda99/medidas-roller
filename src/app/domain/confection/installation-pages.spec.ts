import { ConfectionCurtain } from './confection-engine';
import { GUIDE_PHOTO_MAIN, GUIDE_PHOTO_THUMBS, guideCardHeight, guidePages, guideRows } from './installation-pages';

const c = (i: number, loc: string): ConfectionCurtain => ({
  curtain_id: `c${i}`, index: i, location_name: loc, product_code: 'BO', product_name: 'Blackout', label: null, external: false, missing_rules: false,
  layers: [{ label: '', product_code: 'BO', color_name: null, width_cm: 170, height_cm: 220, fabric_w: 166, fabric_h: 240, tube: 166.5, bottom: 166.5, roller: null, fall: null, motorized: false }],
  cenefa: null, chain: null, installation: null, extras: [], notes: null,
});

describe('páginas de la guía del instalador', () => {
  it('tarjetas por ubicación, 3 por fila, máximo 3 fotos por cortina', () => {
    const photos = new Map([['c1', ['a', 'b', 'c', 'd']]]);
    const rows = guideRows([c(1, 'Living'), c(2, 'Living'), c(3, 'Living'), c(4, 'Living'), c(5, 'Hab. 1')], photos);
    expect(rows.map((r) => (r.type === 'group' ? `#${r.label}` : r.cards.length))).toEqual(['#Living', 3, 1, '#Hab. 1', 1]);
    const first = rows[1];
    expect(first.type === 'cards' && first.cards[0].photos.length).toBe(3);
    expect(guideCardHeight({ curtain: c(1, 'x'), photos: ['a', 'b'] }) - guideCardHeight({ curtain: c(1, 'x'), photos: [] })).toBe(GUIDE_PHOTO_MAIN + GUIDE_PHOTO_THUMBS);
  });

  it('muchas cortinas con fotos se dividen sin perder ninguna', () => {
    const list = Array.from({ length: 40 }, (_, i) => c(i + 1, `Hab. ${Math.floor(i / 4)}`));
    const photos = new Map(list.map((x) => [x.curtain_id, ['a']]));
    const pages = guidePages(list, photos, { signed: true });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().flatMap((r) => (r.type === 'cards' ? r.cards : [])).length).toBe(40);
  });
});

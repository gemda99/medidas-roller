import { ConfectionCurtain } from './confection-engine';
import { GUIDE_PHOTOS, guidePages, guideRows } from './installation-pages';

const c = (i: number, loc: string): ConfectionCurtain => ({
  curtain_id: `c${i}`, index: i, location_name: loc, product_code: 'BO', product_name: 'Blackout', label: null, external: false, missing_rules: false,
  layers: [{ label: '', product_code: 'BO', color_name: null, width_cm: 170, height_cm: 220, fabric_w: 166, fabric_h: 240, tube: 166.5, bottom: 166.5, roller: null, fall: null, motorized: false }],
  cenefa: null, chain: null, installation: null, extras: [], notes: null,
});

describe('páginas de la guía del instalador', () => {
  it('máximo 3 fotos por cortina y suma su alto', () => {
    const photos = new Map([['c1', ['a', 'b', 'c', 'd']]]);
    const rows = guideRows([c(1, 'Living'), c(2, 'Living')], photos);
    const [, first, second] = rows;
    expect(first.type === 'curtain' && first.photos.length).toBe(3);
    expect(first.height - second.height).toBe(GUIDE_PHOTOS);
  });

  it('muchas cortinas con fotos se dividen sin perder ninguna', () => {
    const list = Array.from({ length: 20 }, (_, i) => c(i + 1, `Hab. ${Math.floor(i / 3)}`));
    const photos = new Map(list.map((x) => [x.curtain_id, ['a']]));
    const pages = guidePages(list, photos, { signed: true });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().filter((r) => r.type === 'curtain').length).toBe(20);
  });
});

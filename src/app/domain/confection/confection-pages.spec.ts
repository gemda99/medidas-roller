import { ConfectionCurtain } from './confection-engine';
import { confectionPages, confectionRows, detailLines } from './confection-pages';

const c = (i: number, loc: string, extra: Partial<ConfectionCurtain> = {}): ConfectionCurtain => ({
  curtain_id: `c${i}`, index: i, location_name: loc, product_code: 'BO', product_name: 'Blackout', label: null, external: false, missing_rules: false,
  layers: [{ label: '', product_code: 'BO', color_name: null, width_cm: 170, height_cm: 220, fabric_w: 166, fabric_h: 240, tube: 166.5, bottom: 166.5, roller: null, fall: null, motorized: false }],
  cenefa: null, chain: null, installation: null, extras: [], notes: null, ...extra,
});

describe('páginas de confección', () => {
  it('agrupa por ubicación y suma alto por detalles y notas', () => {
    const rows = confectionRows([c(1, 'Living'), c(2, 'Living'), c(3, 'Hab. 1')]);
    expect(rows.map((r) => r.type)).toEqual(['group', 'curtain', 'curtain', 'group', 'curtain']);
    expect(detailLines(c(1, 'x', { chain: 'Derecha', notes: 'x'.repeat(100) }))).toBe(3);
  });

  it('una rectificación normal cabe en una imagen; una de 30 cortinas se divide sin perder ninguna', () => {
    expect(confectionPages([c(1, 'Living'), c(2, 'Living')]).length).toBe(1);
    const many = Array.from({ length: 30 }, (_, i) => c(i + 1, `Hab. ${Math.floor(i / 4)}`));
    const pages = confectionPages(many);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().filter((r) => r.type === 'curtain').length).toBe(30);
  });
});

import { QuoteLine } from '../pricing/pricing-engine';
import { buildRows, footerHeight, paginate, textHeight } from './quote-pages';
import { textBlocks } from '../models/business';

const line = (loc: string, kind: QuoteLine['kind'] = 'cortina', curtain: string | null = 'c'): QuoteLine => ({
  kind, curtain_id: curtain, location_name: loc, description: 'x', product_code: 'BO', color_name: null,
  width_cm: 170, height_cm: 220, area_m2: 3.74, base_price: 78540, min_price_applied: false,
  unit_price: 78540, quantity: 1, line_total: 78540,
});

const lines4 = textBlocks('a\nb\nc\nd');
const long = textBlocks(Array.from({ length: 30 }, (_, i) => `Condición número ${i} con un texto de largo normal`).join('\n'));

describe('páginas de la imagen', () => {
  it('agrupa por ubicación y marca las sublíneas (motor, cenefa) de cada cortina', () => {
    const rows = buildRows([line('Living'), line('Living', 'motor'), line('Hab. 1'), line('', 'adicional', null)]);
    expect(rows.map((r) => (r.type === 'group' ? `#${r.label}` : r.sub ? 'sub' : 'item'))).toEqual([
      '#Living', 'item', 'sub', '#Hab. 1', 'item', '#Adicionales', 'item',
    ]);
  });

  it('numera solo las cortinas', () => {
    const rows = buildRows([line('Living'), line('Living', 'motor'), line('Hab. 1')]);
    expect(rows.flatMap((r) => (r.type === 'line' ? [r.index] : []))).toEqual([1, null, 2]);
  });

  it('los textos largos ocupan más alto y los subtítulos se reconocen', () => {
    const b = textBlocks('Garantía:\n* 5 años en roller\nCasos no cubiertos:\n- Desmontaje por el cliente');
    expect(b.map((x) => x.kind)).toEqual(['title', 'item', 'title', 'item']);
    expect(b[0].text).toBe('Garantía');
    expect(textHeight(textBlocks('x'.repeat(200)))).toBeGreaterThan(textHeight(textBlocks('x')));
    expect(textHeight([])).toBe(0);
  });

  it('el caso del Excel (2 cortinas) cabe en una sola imagen', () => {
    const pages = paginate(buildRows([line('Living'), line('Living')]), footerHeight(lines4));
    expect(pages.length).toBe(1);
  });

  it('25 cortinas se dividen en varias imágenes sin perder filas', () => {
    const lines = Array.from({ length: 25 }, (_, i) => line(`Hab. ${Math.floor(i / 3)}`));
    const rows = buildRows(lines);
    const pages = paginate(rows, footerHeight(lines4));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().length).toBe(rows.length);
  });

  it('ninguna página termina con un título de ubicación suelto', () => {
    const lines = Array.from({ length: 40 }, (_, i) => line(`Ubicación ${i}`));
    const pages = paginate(buildRows(lines), footerHeight(lines4));
    for (const p of pages.slice(0, -1)) expect(p[p.length - 1]?.type).not.toBe('group');
  });

  it('si los totales no caben en la última página, van en una página propia', () => {
    const lines = Array.from({ length: 11 }, () => line('Living'));
    const pages = paginate(buildRows(lines), footerHeight(long));
    expect(pages[pages.length - 1].length).toBe(0);
  });
});

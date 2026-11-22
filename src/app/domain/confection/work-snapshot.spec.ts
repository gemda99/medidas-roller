import { Product } from '../models/catalog';
import { Rectification } from '../models/rectification';
import { buildWorkSnapshot } from './work-snapshot';

const bo: Product = {
  id: 'bo', code: 'BO', name: 'Blackout', kind: 'tela', cenefa_mode: 'opcional', fabricated: true, has_mechanism: true, active: true,
  sort_order: 0, product_components: [], product_options: [{ id: 'o1', product_id: 'bo', name: 'Velcro', active: true }] as never,
  conf_fabric_w: -4, conf_fabric_h: 20, conf_tube: -3.5, conf_bottom: -3.5, conf_cenefa: -0.5, conf_roller: null,
};

const rect = {
  id: 'R', customer_id: 'C', visit_date: '2026-11-21', installation_date: '2026-11-28', observations: 'Conserjería', executive_name: 'Gabriel',
  address_line: 'Calle 1', comuna: 'Ñuñoa', address_reference: 'Depto 4', status: 'completa',
  signature_path: 'R/firma-1.png', signed_name: 'Ana', signed_rut: '12345678-5', signed_at: '2026-11-21T18:00:00Z',
  customers: { full_name: 'Ana Pérez', phone: '+56 9 1111 1111' },
  locations: [{ id: 'L', rectification_id: 'R', name: 'Living', notes: null, sort_order: 10, curtains: [{
    id: 'c1', location_id: 'L', product_id: 'bo', label: null, surface: null, surface_other: null, mounting: null, chain_side: null, chain_length_m: null,
    has_cenefa: false, swap_layers: false, notes: null, sort_order: 0, curtain_options: [{ product_option_id: 'o1' }], curtain_accessories: [],
    curtain_components: [{ role: 'unica', color_name: 'Blanco', width_cm: 170, height_cm: 220, fall: null, motorized: false }],
    curtain_photos: [{ id: 'p1', storage_path: 'R/c1/a.jpg' }, { id: 'p2', storage_path: 'R/c1/b.jpg' }],
  }] }],
} as unknown as Rectification;

describe('copia del trabajo para la cotización', () => {
  it('guarda medidas de confección, datos del trabajo, firma y rutas de fotos', () => {
    const w = buildWorkSnapshot(rect, { products: [bo], accessories: [] });
    expect(w.curtains[0].layers[0]).toMatchObject({ width_cm: 170, fabric_w: 166, fabric_h: 240, tube: 166.5 });
    expect(w.curtains[0].extras).toEqual(['Velcro']);
    expect(w.job).toMatchObject({ customer_name: 'Ana Pérez', address: 'Calle 1, Ñuñoa', signed_name: 'Ana', signature_path: 'R/firma-1.png' });
    expect(w.photos).toEqual({ c1: ['R/c1/a.jpg', 'R/c1/b.jpg'] });
  });

  it('es una copia: cambiar la rectificación después no la altera', () => {
    const r = structuredClone(rect);
    const w = buildWorkSnapshot(r, { products: [bo], accessories: [] });
    r.locations[0].curtains[0].curtain_components[0].width_cm = 200;
    expect(w.curtains[0].layers[0].width_cm).toBe(170);
  });
});

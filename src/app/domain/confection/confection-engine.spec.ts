import { Product } from '../models/catalog';
import { Curtain, Location } from '../models/rectification';
import { applyRule, confectionForCurtain, confectionSheet } from './confection-engine';

const R = { conf_fabric_w: -4, conf_fabric_h: 20, conf_tube: -3.5, conf_bottom: -3.5, conf_cenefa: -0.5, conf_roller: null };
const prod = (id: string, code: string, extra: Partial<Product> = {}): Product => ({
  id, code, name: code, kind: 'tela', cenefa_mode: 'opcional', fabricated: true, has_mechanism: true, active: true, sort_order: 0,
  product_components: [], product_options: [], ...R, ...extra,
});
const catalog: Product[] = [
  prod('se', 'SE'), prod('bo', 'BO'),
  prod('rdbo', 'RDBO', { cenefa_mode: 'incluida', conf_roller: -4.5 }),
  prod('ve', 'VE', { fabricated: false, cenefa_mode: 'no', conf_fabric_w: null, conf_fabric_h: null, conf_tube: null, conf_bottom: null, conf_cenefa: null }),
  prod('vc', 'VC', { has_mechanism: false, cenefa_mode: 'no', conf_fabric_w: null, conf_fabric_h: null, conf_tube: null, conf_bottom: null, conf_cenefa: null }),
  prod('sebo', 'SE+BO', { kind: 'sistema', cenefa_mode: 'no', conf_fabric_w: null, conf_fabric_h: null, conf_tube: null, conf_bottom: null, conf_cenefa: null,
    product_components: [{ role: 'fondo', component_product_id: 'se' }, { role: 'frente', component_product_id: 'bo' }] }),
];
const names = { options: new Map([['o1', 'Velcro']]), accessories: new Map([['a1', 'Peso']]) };

const curtain = (product_id: string, comps: Partial<Curtain['curtain_components'][number]>[], extra: Partial<Curtain> = {}): Curtain => ({
  id: 'c', location_id: 'l', product_id, label: null, surface: null, surface_other: null, mounting: null, chain_side: null, chain_length_m: null,
  has_cenefa: false, swap_layers: false, notes: null, sort_order: 0, curtain_options: [], curtain_accessories: [],
  curtain_components: comps.map((c) => ({ role: 'unica', color_name: null, width_cm: 170, height_cm: 220, fall: null, motorized: false, ...c })),
  ...extra,
});

describe('motor de confección', () => {
  it('caso del Excel: BO 170 × 220 → tela 166 × 240, tubo y G polvo 166,5', () => {
    const r = confectionForCurtain(curtain('bo', [{}]), 1, 'Living', catalog, names);
    expect(r.layers[0]).toMatchObject({ fabric_w: 166, fabric_h: 240, tube: 166.5, bottom: 166.5, roller: null });
    expect(r.cenefa).toBeNull();
    expect(r.missing_rules).toBe(false);
  });

  it('cenefa −0,5 solo si la cortina la lleva; en el dúo siempre, con rodillo = G polvo − 1', () => {
    expect(confectionForCurtain(curtain('bo', [{}], { has_cenefa: true }), 1, '', catalog, names).cenefa).toBe(169.5);
    const duo = confectionForCurtain(curtain('rdbo', [{}]), 1, '', catalog, names);
    expect(duo.cenefa).toBe(169.5);
    expect(duo.layers[0].roller).toBe(165.5);
    expect(duo.extras).toContain('Cenefa');
  });

  it('doble: cada tela con su medida y sus reglas; invertido cambia qué tela va atrás', () => {
    const c = curtain('sebo', [{ role: 'frente', width_cm: 150, height_cm: 200 }, { role: 'fondo', width_cm: 152, height_cm: 200 }]);
    const r = confectionForCurtain(c, 1, '', catalog, names);
    expect(r.layers.map((l) => `${l.label} ${l.product_code} ${l.fabric_w}`)).toEqual(['Atrás SE 148', 'Adelante BO 146']);
    const swapped = confectionForCurtain({ ...c, swap_layers: true }, 1, '', catalog, names);
    expect(swapped.layers.map((l) => l.product_code)).toEqual(['BO', 'SE']);
  });

  it('verticales: fabricación externa, sin piezas', () => {
    const r = confectionForCurtain(curtain('ve', [{}]), 1, '', catalog, names);
    expect(r.external).toBe(true);
    expect(r.missing_rules).toBe(false);
    expect(r.layers[0].fabric_w).toBeNull();
  });

  it('VC sin reglas: se marca para que el administrador las complete', () => {
    const r = confectionForCurtain(curtain('vc', [{}], { chain_side: 'izquierda' }), 1, '', catalog, names);
    expect(r.missing_rules).toBe(true);
    expect(r.chain).toBeNull();
  });

  it('cadena, instalación, opciones, accesorios y medidas con decimales', () => {
    const r = confectionForCurtain(
      curtain('bo', [{ width_cm: 170.5 }], { chain_side: 'derecha', chain_length_m: 1.5, mounting: 'muro', surface: 'concreto',
        curtain_options: [{ product_option_id: 'o1' }], curtain_accessories: [{ accessory_id: 'a1', quantity: 2 }] }),
      1, '', catalog, names);
    expect(r.layers[0].fabric_w).toBe(166.5);
    expect(r.chain).toBe('Derecha · 1,5 m');
    expect(r.installation).toBe('Muro · Concreto');
    expect(r.extras).toEqual(['Velcro', 'Peso ×2']);
    expect(applyRule(100, null)).toBeNull();
  });

  it('hoja completa: numera en orden de ubicaciones y cortinas', () => {
    const locs = [
      { id: 'l2', rectification_id: 'r', name: 'Hab. 1', notes: null, sort_order: 20, curtains: [curtain('se', [{}])] },
      { id: 'l1', rectification_id: 'r', name: 'Living', notes: null, sort_order: 10, curtains: [curtain('bo', [{}], { sort_order: 2 }), curtain('ve', [{}], { sort_order: 1 })] },
    ] as Location[];
    const s = confectionSheet(locs, catalog, names);
    expect(s.map((x) => `${x.index} ${x.location_name} ${x.product_code}`)).toEqual(['1 Living VE', '2 Living BO', '3 Hab. 1 SE']);
  });
});

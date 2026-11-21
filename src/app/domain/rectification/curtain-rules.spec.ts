import { Product } from '../models/catalog';
import { Curtain, CurtainPayload } from '../models/rectification';
import {
  completionIssues,
  componentLabel,
  curtainCard,
  curtainSummary,
  duplicatePayload,
  reshapeComponents,
  rolesFor,
  validateCurtain,
} from './curtain-rules';

const mk = (code: string, kind: 'tela' | 'sistema', extra: Partial<Product> = {}): Product => ({
  id: code, code, name: code, kind, cenefa_mode: 'no', fabricated: true, has_mechanism: true, active: true, sort_order: 0,
  product_components: [], product_options: [], ...extra,
});
const SE = mk('SE', 'tela', { name: 'Sunscreen', cenefa_mode: 'opcional' });
const BO = mk('BO', 'tela', { name: 'Blackout', cenefa_mode: 'opcional' });
const RDBO = mk('RDBO', 'tela', { cenefa_mode: 'incluida' });
const VC = mk('VC', 'tela', { name: 'Velcro con contrapeso', has_mechanism: false });
const DOBLE = mk('SE+BO', 'sistema', {
  product_components: [
    { role: 'frente', component_product_id: 'BO' },
    { role: 'fondo', component_product_id: 'SE' },
  ],
});
const catalog = [SE, BO, RDBO, VC, DOBLE];
const names = { options: new Map<string, string>(), accessories: new Map([['peso', 'Peso']]) };

const payload = (extra: Partial<CurtainPayload> = {}): CurtainPayload => ({
  location_id: 'L', product_id: 'BO', label: null, surface: 'concreto', surface_other: null, mounting: 'muro',
  chain_side: 'izquierda', chain_length_m: 1.5, has_cenefa: false, swap_layers: false, notes: null,
  components: [{ role: 'unica', color_name: 'Beige', width_cm: 170, height_cm: 220, fall: 'externa', motorized: false }],
  option_ids: [], accessories: [], ...extra,
});

const curtain = (extra: Partial<Curtain> = {}): Curtain => ({
  id: 'c1', location_id: 'L', product_id: 'RDBO', label: null, surface: 'concreto', surface_other: null,
  mounting: 'muro', chain_side: 'izquierda', chain_length_m: 1.5, has_cenefa: true, swap_layers: false, notes: 'Bien arriba',
  sort_order: 0,
  curtain_components: [{ role: 'unica', color_name: 'Beige-3', width_cm: 222, height_cm: 180, fall: 'externa', motorized: false }],
  curtain_options: [], curtain_accessories: [{ accessory_id: 'peso', quantity: 1 }],
  ...extra,
});

describe('reglas de cortina', () => {
  it('roles: simple = única; doble = fondo y frente en ese orden', () => {
    expect(rolesFor(BO)).toEqual(['unica']);
    expect(rolesFor(DOBLE)).toEqual(['fondo', 'frente']);
  });

  it('etiqueta de cada tela del doble, normal e invertido', () => {
    expect(componentLabel('fondo', DOBLE, catalog)).toBe('Atrás (fondo) · Sunscreen');
    expect(componentLabel('frente', DOBLE, catalog)).toBe('Adelante (frente) · Blackout');
    expect(componentLabel('fondo', DOBLE, catalog, true)).toBe('Atrás (fondo) · Blackout');
    expect(componentLabel('frente', DOBLE, catalog, true)).toBe('Adelante (frente) · Sunscreen');
  });

  it('al pasar de simple a doble, la segunda tela copia medidas y caída', () => {
    const r = reshapeComponents(DOBLE, [{ role: 'unica', color_name: 'Beige', width_cm: 150, height_cm: 160, fall: 'interna', motorized: false }]);
    expect(r.map((c) => [c.role, c.width_cm, c.height_cm, c.fall])).toEqual([
      ['fondo', 150, 160, 'interna'],
      ['frente', 150, 160, 'interna'],
    ]);
  });

  it('al elegir velcro (sin mecanismo) se quita el motor', () => {
    const r = reshapeComponents(VC, [{ role: 'unica', color_name: null, width_cm: 47, height_cm: 204, fall: null, motorized: true }]);
    expect(r[0].motorized).toBe(false);
  });

  it('valida medidas, producto y superficie «otra»', () => {
    expect(validateCurtain(payload(), BO)).toEqual([]);
    expect(validateCurtain(payload(), undefined)[0].message).toBe('Elige el producto.');
    const bad = validateCurtain(payload({ components: [{ role: 'unica', color_name: null, width_cm: 0, height_cm: 2000, fall: null, motorized: false }] }), BO);
    expect(bad.map((i) => i.field)).toEqual(['components.0.width_cm', 'components.0.height_cm']);
    expect(validateCurtain(payload({ surface: 'otro', surface_other: ' ' }), BO)[0].field).toBe('surface_other');
  });

  it('el doble con una sola tela no es válido', () => {
    expect(validateCurtain(payload({ product_id: 'SE+BO' }), DOBLE)[0].field).toBe('components');
  });

  it('cadena opcional; en velcro no se valida', () => {
    expect(validateCurtain(payload({ chain_side: '', chain_length_m: '' }), BO)).toEqual([]);
    expect(validateCurtain(payload({ chain_length_m: 10 }), BO)[0].field).toBe('chain_length_m');
    expect(validateCurtain(payload({ product_id: 'VC', chain_length_m: 10 }), VC)).toEqual([]);
  });

  it('resumen corto para confirmaciones', () => {
    expect(curtainSummary(curtain(), RDBO)).toBe('RDBO · Beige-3 · 222 × 180 cm');
  });

  it('tarjeta de cortina simple, como el cuadro de la hoja', () => {
    expect(curtainCard(curtain(), RDBO, catalog, names)).toEqual({
      code: 'RDBO',
      name: 'RDBO',
      layers: [{ label: '', measures: '222 × 180', details: 'Beige-3 · Caída externa' }],
      details: ['Muro · Concreto', 'Cadena izq. 1,5 m', 'Peso'],
    });
  });

  it('tarjeta de doble invertido con caída y motor por tela', () => {
    const c = curtain({
      product_id: 'SE+BO', swap_layers: true, chain_side: null, chain_length_m: null, curtain_accessories: [],
      curtain_components: [
        { role: 'frente', color_name: 'Blanco', width_cm: 148.5, height_cm: 160, fall: 'externa', motorized: true },
        { role: 'fondo', color_name: 'Gris', width_cm: 150, height_cm: 160, fall: 'interna', motorized: false },
      ],
    });
    const card = curtainCard(c, DOBLE, catalog, names);
    expect(card.layers).toEqual([
      { label: 'Atrás · BO', measures: '150 × 160', details: 'Gris · Caída interna' },
      { label: 'Adelante · SE', measures: '148,5 × 160', details: 'Blanco · Caída externa · Motor' },
    ]);
  });

  it('tarjeta de velcro: no muestra cadena aunque venga dato', () => {
    const card = curtainCard(curtain({ product_id: 'VC', mounting: null, surface: null, curtain_accessories: [] }), VC, catalog, names);
    expect(card.details).toEqual([]);
  });

  it('duplicar copia todo menos el id, incluido el orden del doble', () => {
    const d = duplicatePayload(curtain({ swap_layers: true }));
    expect(d.id).toBeUndefined();
    expect(d.swap_layers).toBe(true);
    expect(d.components[0]).toMatchObject({ width_cm: 222, fall: 'externa' });
    expect(d.accessories).toEqual([{ accessory_id: 'peso', quantity: 1 }]);
  });

  it('completar exige ubicaciones con cortinas', () => {
    expect(completionIssues([])).toEqual(['Agrega al menos una ubicación.']);
    expect(completionIssues([{ name: 'Living', curtains: [] }, { name: 'Hab', curtains: [1] }])).toEqual(['Sin cortinas: Living.']);
    expect(completionIssues([{ name: 'Hab', curtains: [1] }])).toEqual([]);
  });
});

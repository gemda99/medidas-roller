import { Product } from '../models/catalog';
import { Curtain, CurtainPayload } from '../models/rectification';
import {
  completionIssues,
  componentLabel,
  curtainSummary,
  duplicatePayload,
  reshapeComponents,
  rolesFor,
  validateCurtain,
} from './curtain-rules';

const mk = (code: string, kind: 'tela' | 'sistema', extra: Partial<Product> = {}): Product => ({
  id: code, code, name: code, kind, cenefa_mode: 'no', fabricated: true, active: true, sort_order: 0,
  product_components: [], product_options: [], ...extra,
});
const SE = mk('SE', 'tela', { name: 'Sunscreen', cenefa_mode: 'opcional' });
const BO = mk('BO', 'tela', { name: 'Blackout', cenefa_mode: 'opcional' });
const RDBO = mk('RDBO', 'tela', { cenefa_mode: 'incluida' });
const DOBLE = mk('SE+BO', 'sistema', {
  product_components: [
    { role: 'frente', component_product_id: 'BO' },
    { role: 'fondo', component_product_id: 'SE' },
  ],
});
const catalog = [SE, BO, RDBO, DOBLE];

const payload = (extra: Partial<CurtainPayload> = {}): CurtainPayload => ({
  location_id: 'L', product_id: 'BO', label: null, surface: 'concreto', surface_other: null, mounting: 'muro',
  fall: 'externa', chain_side: 'izquierda', chain_length_m: 1.5, has_cenefa: false, notes: null,
  components: [{ role: 'unica', color_name: 'Beige', width_cm: 170, height_cm: 220, motorized: false }],
  option_ids: [], accessories: [], ...extra,
});

describe('reglas de cortina', () => {
  it('roles: simple = única; doble = fondo y frente en ese orden', () => {
    expect(rolesFor(BO)).toEqual(['unica']);
    expect(rolesFor(DOBLE)).toEqual(['fondo', 'frente']);
  });

  it('etiqueta de cada tela del doble con su producto', () => {
    expect(componentLabel('fondo', DOBLE, catalog)).toBe('Tela de fondo · Sunscreen');
    expect(componentLabel('frente', DOBLE, catalog)).toBe('Tela de frente · Blackout');
  });

  it('al pasar de simple a doble, la segunda tela copia las medidas de la primera', () => {
    const r = reshapeComponents(DOBLE, [{ role: 'unica', color_name: 'Beige', width_cm: 150, height_cm: 160, motorized: false }]);
    expect(r.map((c) => [c.role, c.width_cm, c.height_cm])).toEqual([
      ['fondo', 150, 160],
      ['frente', 150, 160],
    ]);
  });

  it('al volver a simple conserva la primera tela', () => {
    const r = reshapeComponents(BO, [
      { role: 'fondo', color_name: null, width_cm: 150, height_cm: 160, motorized: true },
      { role: 'frente', color_name: null, width_cm: 148, height_cm: 160, motorized: false },
    ]);
    expect(r).toEqual([{ role: 'unica', color_name: null, width_cm: 150, height_cm: 160, motorized: true }]);
  });

  it('valida medidas, producto y superficie «otra»', () => {
    expect(validateCurtain(payload(), BO)).toEqual([]);
    expect(validateCurtain(payload(), undefined)[0].message).toBe('Elige el producto.');
    const bad = validateCurtain(payload({ components: [{ role: 'unica', color_name: null, width_cm: 0, height_cm: 2000, motorized: false }] }), BO);
    expect(bad.map((i) => i.field)).toEqual(['components.0.width_cm', 'components.0.height_cm']);
    expect(validateCurtain(payload({ surface: 'otro', surface_other: ' ' }), BO)[0].field).toBe('surface_other');
  });

  it('el doble con una sola tela no es válido', () => {
    expect(validateCurtain(payload({ product_id: 'SE+BO' }), DOBLE)[0].field).toBe('components');
  });

  it('cadena opcional: vacía es válida; fuera de rango no', () => {
    expect(validateCurtain(payload({ chain_side: '', chain_length_m: '' }), BO)).toEqual([]);
    expect(validateCurtain(payload({ chain_length_m: 10 }), BO)[0].field).toBe('chain_length_m');
  });

  const curtain = (extra: Partial<Curtain> = {}): Curtain => ({
    id: 'c1', location_id: 'L', product_id: 'RDBO', label: null, surface: 'concreto', surface_other: null,
    mounting: 'muro', fall: 'externa', chain_side: 'izquierda', chain_length_m: 1.5, has_cenefa: true, notes: 'Bien arriba',
    sort_order: 0,
    curtain_components: [{ role: 'unica', color_name: 'Beige-3', width_cm: 222, height_cm: 180, motorized: false }],
    curtain_options: [{ product_option_id: 'velcro' }], curtain_accessories: [{ accessory_id: 'peso', quantity: 1 }],
    ...extra,
  });

  it('resumen de una línea como en la hoja física', () => {
    expect(curtainSummary(curtain(), RDBO)).toBe('RDBO · Beige-3 · 222 × 180 cm · Muro · Cadena izq. 1,5 m');
  });

  it('resumen del doble con motor y cenefa opcional', () => {
    const c = curtain({
      product_id: 'SE', chain_side: null, chain_length_m: null,
      curtain_components: [
        { role: 'fondo', color_name: 'Blanco', width_cm: 150, height_cm: 160, motorized: false },
        { role: 'frente', color_name: 'Gris', width_cm: 148.5, height_cm: 160, motorized: true },
      ],
    });
    expect(curtainSummary(c, SE)).toBe('SE · Blanco / Gris · 150 × 160 + 148,5 × 160 cm · Muro · Motor · Cenefa');
  });

  it('duplicar copia todo menos el id', () => {
    const d = duplicatePayload(curtain());
    expect(d.id).toBeUndefined();
    expect(d.components[0].width_cm).toBe(222);
    expect(d.option_ids).toEqual(['velcro']);
    expect(d.accessories).toEqual([{ accessory_id: 'peso', quantity: 1 }]);
  });

  it('completar exige ubicaciones con cortinas', () => {
    expect(completionIssues([])).toEqual(['Agrega al menos una ubicación.']);
    expect(completionIssues([{ name: 'Living', curtains: [] }, { name: 'Hab', curtains: [1] }])).toEqual(['Sin cortinas: Living.']);
    expect(completionIssues([{ name: 'Hab', curtains: [1] }])).toEqual([]);
  });
});

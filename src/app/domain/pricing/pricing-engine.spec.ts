import { areaM2, calculateQuote, CurtainInput, PricingSnapshot, QuoteOptions, roundTo } from './pricing-engine';

/**
 * Precios: BO $21.000, mínimos $40.000 / $70.000, motor $100.000, cenefa $10.000, instalación $50.000
 * e IVA 19% son los informados por Gabriel. SE $18.000, RD $30.000, peso $5.000 y control $25.000
 * son VALORES DE PRUEBA (no reales), solo para ejercitar las reglas.
 */
const snap = (extra: Partial<PricingSnapshot> = {}): PricingSnapshot => ({
  price_list_id: 'P', price_list_name: 'Prueba', general_min_price: 40000, motor_price: 100000,
  remote_control_per_motors: 15, cenefa_price_ml: 10000, installation_project_price: 50000,
  installation_per_curtain_price: 8000, iva_rate: 0.19, rounding_step: 1,
  products: {
    BO: { code: 'BO', name: 'Roller Blackout', kind: 'tela', cenefa_mode: 'opcional', has_mechanism: true, price_m2: 21000, min_price: null },
    SE: { code: 'SE', name: 'Roller Sunscreen', kind: 'tela', cenefa_mode: 'opcional', has_mechanism: true, price_m2: 18000, min_price: null },
    RDBO: { code: 'RDBO', name: 'Dúo blackout', kind: 'tela', cenefa_mode: 'incluida', has_mechanism: true, price_m2: 30000, min_price: null },
    VC: { code: 'VC', name: 'Velcro con contrapeso', kind: 'tela', cenefa_mode: 'no', has_mechanism: false, price_m2: 15000, min_price: null },
    'SE+BO': { code: 'SE+BO', name: 'Sistema doble', kind: 'sistema', cenefa_mode: 'no', has_mechanism: true, price_m2: null, min_price: 70000, components: { fondo: 'SE', frente: 'BO' } },
  },
  accessories: {
    peso: { name: 'Peso', scope: 'cortina', unit_price: 5000 },
    control: { name: 'Control remoto', scope: 'cotizacion', unit_price: 25000 },
  },
  ...extra,
});

const opts = (extra: Partial<QuoteOptions> = {}): QuoteOptions => ({
  installation_mode: 'proyecto', installation_manual: null, discount_type: 'ninguno', discount_value: 0,
  iva_mode: 'excluido', manual_adjustment: 0, quote_accessories: {}, extras: [], ...extra,
});

const simple = (id: string, product: string, w: number, h: number, extra: Partial<CurtainInput> = {}): CurtainInput => ({
  id, location_name: 'Living', label: null, product_id: product, swap_layers: false, has_cenefa: false,
  layers: [{ role: 'unica', width_cm: w, height_cm: h, color_name: null, motorized: false }], accessories: [], ...extra,
});

describe('motor de cotización', () => {
  it('caso oficial (Excel de Gabriel): 2 × BO 170 × 220 + instalación $50.000 → total $246.425', () => {
    const r = calculateQuote([simple('a', 'BO', 170, 220), simple('b', 'BO', 170, 220)], snap(), opts());
    expect(r.errors).toEqual([]);
    expect(r.lines.map((l) => l.line_total)).toEqual([78540, 78540]);
    expect(r.lines[0].area_m2).toBe(3.74);
    expect(r.subtotal_products).toBe(157080);
    expect(r.installation_amount).toBe(50000);
    expect(r.net_amount).toBe(207080);
    expect(r.iva_amount).toBe(39345);
    expect(r.total_calculated).toBe(246425);
    expect(r.total_final).toBe(246425);
  });

  it('área: 4 decimales', () => {
    expect(areaM2(170, 220)).toBe(3.74);
    expect(areaM2(148.5, 160)).toBe(2.376);
  });

  it('mínimo general: BO 50 × 60 cobra $40.000 y lo marca', () => {
    const r = calculateQuote([simple('a', 'BO', 50, 60)], snap(), opts());
    expect(r.lines[0]).toMatchObject({ base_price: 6300, unit_price: 40000, min_price_applied: true });
  });

  it('mínimo propio del producto reemplaza al general', () => {
    const s = snap();
    s.products['BO'].min_price = 45000;
    expect(calculateQuote([simple('a', 'BO', 50, 60)], s, opts()).lines[0].unit_price).toBe(45000);
  });

  const doble = (w1: number, w2: number, h: number, swap = false): CurtainInput => ({
    id: 'd', location_name: 'Hab. 1', label: null, product_id: 'SE+BO', swap_layers: swap, has_cenefa: false,
    layers: [
      { role: 'fondo', width_cm: w1, height_cm: h, color_name: 'Blanco', motorized: false },
      { role: 'frente', width_cm: w2, height_cm: h, color_name: 'Gris', motorized: true },
    ],
    accessories: [],
  });

  it('doble chico: suma de telas bajo $70.000 → cobra $70.000', () => {
    const r = calculateQuote([doble(80, 80, 100)], snap(), opts({ installation_mode: 'manual' }));
    // SE 0,8 m² × 18.000 = 14.400 + BO 0,8 m² × 21.000 = 16.800 = 31.200 < 70.000
    expect(r.lines[0]).toMatchObject({ base_price: 31200, unit_price: 70000, min_price_applied: true });
  });

  it('doble grande: cobra SE + BO, cada tela con su medida, y su motor aparte', () => {
    const r = calculateQuote([doble(200, 198, 220)], snap(), opts({ installation_mode: 'manual' }));
    // SE 4,4 × 18.000 = 79.200 ; BO 4,356 × 21.000 = 91.476 → 170.676
    expect(r.lines[0]).toMatchObject({ unit_price: 170676, min_price_applied: false });
    expect(r.lines[0].layers?.map((l) => [l.product_code, l.price])).toEqual([['SE', 79200], ['BO', 91476]]);
    expect(r.lines[1]).toMatchObject({ kind: 'motor', unit_price: 100000, quantity: 1, line_total: 100000 });
    expect(r.motors).toBe(1);
  });

  it('doble invertido: cada medida se cobra con la tela que realmente ocupa esa posición', () => {
    const r = calculateQuote([doble(200, 100, 100, true)], snap(), opts({ installation_mode: 'manual' }));
    // invertido: fondo = BO (2 m² × 21.000 = 42.000), frente = SE (1 m² × 18.000 = 18.000) → 60.000 → mínimo 70.000
    expect(r.lines[0].layers?.map((l) => [l.product_code, l.price])).toEqual([['BO', 42000], ['SE', 18000]]);
    expect(r.lines[0].unit_price).toBe(70000);
  });

  it('cenefa opcional: ancho en metros × $10.000; incluida (RDBO) no se cobra', () => {
    const r = calculateQuote(
      [simple('a', 'SE', 200, 200, { has_cenefa: true }), simple('b', 'RDBO', 200, 200, { has_cenefa: true })],
      snap(), opts(),
    );
    const cenefas = r.lines.filter((l) => l.kind === 'cenefa');
    expect(cenefas.map((l) => [l.description, l.line_total])).toEqual([['Cenefa 2 m', 20000]]);
  });

  it('velcro (sin mecanismo) nunca cobra motor', () => {
    const c = simple('a', 'VC', 47, 204);
    c.layers[0].motorized = true;
    const r = calculateQuote([c], snap(), opts());
    expect(r.lines.filter((l) => l.kind === 'motor')).toEqual([]);
  });

  it('accesorios por cortina y control remoto sugerido (1 cada 15 motores), editable', () => {
    const cs = [simple('a', 'BO', 100, 100, { accessories: [{ accessory_id: 'peso', quantity: 2 }] })];
    cs[0].layers[0].motorized = true;
    let r = calculateQuote(cs, snap(), opts());
    expect(r.lines.find((l) => l.description === 'Peso')).toMatchObject({ quantity: 2, line_total: 10000 });
    expect(r.suggested_quote_accessories['control']).toBe(1);
    expect(r.lines.find((l) => l.description === 'Control remoto')).toMatchObject({ quantity: 1, line_total: 25000 });
    r = calculateQuote(cs, snap(), opts({ quote_accessories: { control: 0 } }));
    expect(r.lines.find((l) => l.description === 'Control remoto')).toBeUndefined();
  });

  it('16 motores sugieren 2 controles', () => {
    const cs = Array.from({ length: 16 }, (_, i) => {
      const c = simple(`c${i}`, 'BO', 100, 100);
      c.layers[0].motorized = true;
      return c;
    });
    expect(calculateQuote(cs, snap(), opts()).suggested_quote_accessories['control']).toBe(2);
  });

  it('descuento 10%: solo sobre productos, no sobre la instalación', () => {
    const r = calculateQuote([simple('a', 'BO', 170, 220), simple('b', 'BO', 170, 220)], snap(), opts({ discount_type: 'porcentaje', discount_value: 10 }));
    expect(r.discount_amount).toBe(15708);
    expect(r.net_amount).toBe(157080 - 15708 + 50000);
    expect(r.iva_amount).toBe(roundTo(191372 * 0.19));
  });

  it('descuento por monto no supera el subtotal', () => {
    const r = calculateQuote([simple('a', 'BO', 50, 60)], snap(), opts({ discount_type: 'monto', discount_value: 999999 }));
    expect(r.discount_amount).toBe(40000);
    expect(r.warnings.length).toBe(1);
  });

  it('instalación por cortina y manual', () => {
    const cs = [simple('a', 'BO', 100, 100), simple('b', 'BO', 100, 100), simple('c', 'BO', 100, 100)];
    expect(calculateQuote(cs, snap(), opts({ installation_mode: 'cortina' })).installation_amount).toBe(24000);
    expect(calculateQuote(cs, snap(), opts({ installation_mode: 'manual', installation_manual: 35000 })).installation_amount).toBe(35000);
  });

  it('IVA incluido y sin IVA', () => {
    const c = [simple('a', 'BO', 170, 220)];
    const inc = calculateQuote(c, snap(), opts({ iva_mode: 'incluido', installation_mode: 'manual' }));
    expect(inc.total_calculated).toBe(78540);
    expect(inc.iva_amount).toBe(roundTo(78540 - 78540 / 1.19));
    const sin = calculateQuote(c, snap(), opts({ iva_mode: 'sin', installation_mode: 'manual' }));
    expect(sin.iva_amount).toBe(0);
    expect(sin.total_calculated).toBe(78540);
  });

  it('ajuste manual: conserva el total calculado y muestra el final', () => {
    const r = calculateQuote([simple('a', 'BO', 170, 220), simple('b', 'BO', 170, 220)], snap(), opts({ manual_adjustment: -6425 }));
    expect(r.total_calculated).toBe(246425);
    expect(r.total_final).toBe(240000);
  });

  it('adicionales personalizados: suman al neto y no se descuentan', () => {
    const r = calculateQuote([simple('a', 'BO', 170, 220)], snap(), opts({
      discount_type: 'porcentaje', discount_value: 10, extras: [{ name: 'Retiro de cortinas antiguas', quantity: 1, unit_price: 15000 }],
    }));
    expect(r.extras_amount).toBe(15000);
    expect(r.discount_amount).toBe(7854);
    expect(r.net_amount).toBe(78540 - 7854 + 50000 + 15000);
  });

  it('redondeo configurable a $100', () => {
    const r = calculateQuote([simple('a', 'BO', 148.5, 160)], snap({ rounding_step: 100 }), opts({ installation_mode: 'manual' }));
    // 2,376 × 21.000 = 49.896 → 49.900
    expect(r.lines[0].unit_price).toBe(49900);
  });

  it('precios faltantes impiden cotizar y dicen cuál', () => {
    const s = snap();
    s.products['SE'].price_m2 = null;
    s.motor_price = null;
    const c = simple('a', 'SE', 100, 100);
    const r = calculateQuote([c], s, opts());
    expect(r.errors).toEqual(['Falta el precio por m² de SE en el tarifario.']);
    const m = simple('b', 'BO', 100, 100);
    m.layers[0].motorized = true;
    expect(calculateQuote([m], s, opts()).errors).toEqual(['Falta el precio del motor en el tarifario.']);
  });

  it('es determinista: mismas entradas, mismo resultado', () => {
    const a = calculateQuote([doble(200, 198, 220)], snap(), opts());
    const b = calculateQuote([doble(200, 198, 220)], snap(), opts());
    expect(a).toEqual(b);
  });
});

// Sprint 4: cotizaciones con snapshot, reglas de descuento/ajuste, numeración y bloqueo de emitidas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, rejects, ADMIN, MEDIDOR, MEDIDOR2 } from './harness.mjs';

let db;
let as;
let rect;
let listOff;
let listOn;

before(async () => {
  ({ db, as } = await setupDb());
  listOff = (await db.query(`select id from public.price_lists where name = 'Tarifario inicial'`)).rows[0].id;
  listOn = (await as(ADMIN, (tx) => tx.query(`select public.clone_price_list($1, 'Con descuento') as id`, [listOff]))).rows[0].id;
  await as(ADMIN, (tx) => tx.query(`update public.price_lists set medidor_discount_enabled = true, medidor_max_discount_pct = 10 where id = $1`, [listOn]));
  rect = await as(MEDIDOR, async (tx) => {
    const c = await tx.query(`select id from public.create_customer_with_address('Cliente Cot', '912345678', null, null, 'Calle 1', 'Maipú', null)`);
    const r = await tx.query(`insert into public.rectifications (customer_id, address_line, comuna) values ($1, 'Calle 1', 'Maipú') returning id`, [c.rows[0].id]);
    return r.rows[0].id;
  });
});

// Caso oficial del Excel: 2 × BO 170 × 220, instalación 50.000, IVA 19% → 246.425
const payload = (extra = {}) => ({
  rectification_id: rect, price_list_id: listOff, iva_mode: 'excluido', discount_type: 'ninguno', discount_value: 0,
  installation_mode: 'proyecto', subtotal_products: 157080, discount_amount: 0, installation_amount: 50000,
  extras_amount: 0, net_amount: 207080, iva_amount: 39345, total_calculated: 246425, manual_adjustment: 0,
  total_final: 246425, customer_snapshot: { full_name: 'Cliente Cot' }, pricing_snapshot: { price_list_name: 'Tarifario inicial', bo: 21000 },
  lines: [
    { kind: 'cortina', location_name: 'Living', description: 'Roller Blackout', product_code: 'BO', width_cm: 170, height_cm: 220, area_m2: 3.74, base_price: 78540, unit_price: 78540, quantity: 1, line_total: 78540 },
    { kind: 'cortina', location_name: 'Living', description: 'Roller Blackout', product_code: 'BO', width_cm: 170, height_cm: 220, area_m2: 3.74, base_price: 78540, unit_price: 78540, quantity: 1, line_total: 78540 },
  ],
  ...extra,
});
const save = (user, p) => as(user, async (tx) => (await tx.query(`select public.save_quotation($1) as r`, [JSON.stringify(p)])).rows[0].r);

test('el medidor guarda una cotización con número correlativo y sus líneas', async () => {
  const r = await save(MEDIDOR, payload());
  assert.match(r.number, /^COT-\d{4}-0001$/);
  const q = (await db.query(`select total_final, status from public.quotations where id = $1`, [r.id])).rows[0];
  assert.deepEqual(q, { total_final: 246425, status: 'borrador' });
  const items = (await db.query(`select sort_order, line_total, area_m2::text from public.quotation_items where quotation_id = $1 order by sort_order`, [r.id])).rows;
  assert.deepEqual(items, [{ sort_order: 0, line_total: 78540, area_m2: '3.7400' }, { sort_order: 1, line_total: 78540, area_m2: '3.7400' }]);
  const r2 = await save(MEDIDOR, payload());
  assert.match(r2.number, /-0002$/);
});

test('la base rechaza totales que no cuadran', async () => {
  await rejects(save(MEDIDOR, payload({ total_final: 200000 })), /quotations_final_ok/);
  await rejects(save(MEDIDOR, payload({ net_amount: 1 })), /quotations_net_ok/);
  await rejects(save(MEDIDOR, payload({ iva_mode: 'sin' })), /quotations_total_ok|quotations_no_iva/);
});

test('descuento del medidor: no si está deshabilitado; sí hasta el máximo; nunca por monto', async () => {
  const d = (list, type, value, amount) => payload({
    price_list_id: list, discount_type: type, discount_value: value, discount_amount: amount,
    net_amount: 207080 - amount, iva_amount: Math.round((207080 - amount) * 0.19),
    total_calculated: 207080 - amount + Math.round((207080 - amount) * 0.19),
    total_final: 207080 - amount + Math.round((207080 - amount) * 0.19),
  });
  await rejects(save(MEDIDOR, d(listOff, 'porcentaje', 5, 7854)), /no está habilitado/);
  await rejects(save(MEDIDOR, d(listOn, 'porcentaje', 15, 23562)), /máximo permitido es 10/);
  const ok = await save(MEDIDOR, d(listOn, 'porcentaje', 10, 15708));
  const adj = (await db.query(`select type, value::text, amount from public.quotation_adjustments where quotation_id = $1`, [ok.id])).rows;
  assert.deepEqual(adj, [{ type: 'descuento_porcentaje', value: '10.00', amount: 15708 }]);
  await rejects(save(MEDIDOR, d(listOn, 'monto', 5000, 5000)), /Solo el administrador puede aplicar descuentos por monto/);
  const admin = await save(ADMIN, d(listOff, 'monto', 5000, 5000));
  assert.ok(admin.id);
});

test('ajuste manual: solo el administrador, y queda registrado', async () => {
  await rejects(save(MEDIDOR, payload({ manual_adjustment: -6425, total_final: 240000 })), /Solo el administrador puede ajustar/);
  const r = await save(ADMIN, payload({ manual_adjustment: -6425, total_final: 240000, adjustment_reason: 'Redondeo comercial' }));
  const q = (await db.query(`select total_calculated, total_final from public.quotations where id = $1`, [r.id])).rows[0];
  assert.deepEqual(q, { total_calculated: 246425, total_final: 240000 });
  const adj = (await db.query(`select type, amount, reason from public.quotation_adjustments where quotation_id = $1`, [r.id])).rows;
  assert.deepEqual(adj, [{ type: 'ajuste_manual', amount: -6425, reason: 'Redondeo comercial' }]);
});

test('una cotización emitida no cambia: ni montos ni líneas; solo pasa a aceptada o rechazada', async () => {
  const r = await save(MEDIDOR, payload());
  await as(MEDIDOR, (tx) => tx.query(`update public.quotations set work_snapshot = '{"curtains":[]}' where id = $1`, [r.id]));
  await as(MEDIDOR, (tx) => tx.query(`update public.quotations set status = 'emitida', issued_at = now() where id = $1`, [r.id]));
  await rejects(save(MEDIDOR, payload({ id: r.id })), /ya fue emitida/);
  await rejects(as(MEDIDOR, (tx) => tx.query(`delete from public.quotation_items where quotation_id = $1`, [r.id])), /ya fue emitida/);
  await rejects(as(MEDIDOR, (tx) => tx.query(`update public.quotations set status = 'borrador' where id = $1`, [r.id])), /no vuelve a borrador/);
  await as(MEDIDOR, (tx) => tx.query(`update public.quotations set status = 'aceptada' where id = $1`, [r.id]));
  const del = await as(MEDIDOR, (tx) => tx.query(`delete from public.quotations where id = $1 returning id`, [r.id]));
  assert.equal(del.rows.length, 0);
});

test('otro medidor no ve las cotizaciones; el admin sí', async () => {
  const r = await save(MEDIDOR, payload());
  assert.equal((await as(MEDIDOR2, (tx) => tx.query(`select id from public.quotations where id = $1`, [r.id]))).rows.length, 0);
  assert.equal((await as(ADMIN, (tx) => tx.query(`select id from public.quotations where id = $1`, [r.id]))).rows.length, 1);
  await rejects(save(MEDIDOR2, payload()), /row-level security/);
});

test('cambiar el tarifario no altera la copia guardada en la cotización (criterio 25)', async () => {
  const r = await save(MEDIDOR, payload());
  const before = (await db.query(`select pricing_snapshot, total_final from public.quotations where id = $1`, [r.id])).rows[0];
  await as(ADMIN, (tx) => tx.query(`update public.product_prices set price_m2 = 99999 where price_list_id = $1`, [listOn]));
  const after = (await db.query(`select pricing_snapshot, total_final from public.quotations where id = $1`, [r.id])).rows[0];
  assert.deepEqual(after, before);
});

test('no se borra una rectificación que tiene cotizaciones', async () => {
  await rejects(as(ADMIN, (tx) => tx.query(`delete from public.rectifications where id = $1`, [rect])), /foreign key/);
});

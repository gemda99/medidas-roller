// Borrado completo por el administrador.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, rejects, ADMIN, MEDIDOR } from './harness.mjs';

let db, as, list, bo;
before(async () => {
  ({ db, as } = await setupDb());
  list = (await db.query(`select id from public.price_lists limit 1`)).rows[0].id;
  bo = (await db.query(`select id from public.products where code = 'BO'`)).rows[0].id;
});

/** Cliente con una rectificación (1 cortina con foto) y una cotización aceptada con imágenes. */
async function setup(name) {
  return as(MEDIDOR, async (tx) => {
    const c = (await tx.query(`select id from public.create_customer_with_address($1, '912345678', null, null, 'Calle 1', 'Maipú', null)`, [name])).rows[0].id;
    const r = (await tx.query(`insert into public.rectifications (customer_id, address_line, comuna) values ($1, 'Calle 1', 'Maipú') returning id`, [c])).rows[0].id;
    const l = (await tx.query(`insert into public.locations (rectification_id, name) values ($1, 'Living') returning id`, [r])).rows[0].id;
    const cur = (await tx.query(`select public.save_curtain($1) as id`, [JSON.stringify({ location_id: l, product_id: bo,
      components: [{ role: 'unica', width_cm: 170, height_cm: 220, color_name: null, fall: null, motorized: false }] })])).rows[0].id;
    await tx.query(`insert into public.curtain_photos (curtain_id, storage_path, width, height, size_bytes) values ($1, $2, 10, 10, 10)`, [cur, `${r}/${cur}/a.jpg`]);
    const p = { rectification_id: r, price_list_id: list, iva_mode: 'sin', discount_type: 'ninguno', discount_value: 0, installation_mode: 'manual',
      subtotal_products: 40000, discount_amount: 0, installation_amount: 0, extras_amount: 0, net_amount: 40000, iva_amount: 0,
      total_calculated: 40000, manual_adjustment: 0, total_final: 40000, customer_snapshot: {}, pricing_snapshot: {},
      lines: [{ kind: 'cortina', curtain_id: cur, location_name: 'Living', description: 'BO', unit_price: 40000, quantity: 1, line_total: 40000 }] };
    const q = (await tx.query(`select public.save_quotation($1) as r`, [JSON.stringify(p)])).rows[0].r.id;
    await tx.query(`update public.quotations set work_snapshot = '{}' where id = $1`, [q]);
    await tx.query(`select public.issue_quotation($1)`, [q]);
    await tx.query(`insert into public.generated_documents (quotation_id, kind, page, page_count, storage_path) values ($1, 'cotizacion', 1, 1, $2)`, [q, `${r}/${q}/cot.png`]);
    await tx.query(`update public.quotations set status = 'aceptada' where id = $1`, [q]);
    return { c, r, q };
  });
}

test('con cotizaciones, el medidor no puede borrar la rectificación ni usar el borrado completo', async () => {
  const { r } = await setup('Cliente A');
  await rejects(as(MEDIDOR, (tx) => tx.query(`delete from public.rectifications where id = $1`, [r])), /foreign key|violates/i);
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.admin_delete_rectification($1)`, [r])), /administrador/);
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.rectification_file_paths($1)`, [r])), /permission denied/i);
});

test('el administrador borra la rectificación con cotización aceptada y recibe las rutas de archivos', async () => {
  const { r, q } = await setup('Cliente B');
  const paths = (await as(ADMIN, (tx) => tx.query(`select public.admin_delete_rectification($1) as p`, [r]))).rows[0].p;
  assert.equal(paths.photos.length, 1);
  assert.deepEqual(paths.documents, [`${r}/${q}/cot.png`]);
  const left = await db.query(`select (select count(*) from public.rectifications where id = $1)::int a, (select count(*) from public.quotations where id = $2)::int b,
    (select count(*) from public.quotation_items where quotation_id = $2)::int c, (select count(*) from public.generated_documents where quotation_id = $2)::int d`, [r, q]);
  assert.deepEqual(left.rows[0], { a: 0, b: 0, c: 0, d: 0 });
});

test('el administrador borra el cliente con todo; la protección de cotizaciones emitidas sigue activa fuera de esto', async () => {
  const { c, q } = await setup('Cliente C');
  await rejects(as(ADMIN, (tx) => tx.query(`delete from public.quotation_items where quotation_id = $1`, [q])), /emitida/);
  const paths = (await as(ADMIN, (tx) => tx.query(`select public.admin_delete_customer($1) as p`, [c]))).rows[0].p;
  assert.equal(paths.photos.length, 1);
  assert.equal((await db.query(`select count(*)::int n from public.customers where id = $1`, [c])).rows[0].n, 0);
});

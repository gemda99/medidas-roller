// RUT del cliente y firma de conformidad.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, rejects, ADMIN, MEDIDOR, MEDIDOR2 } from './harness.mjs';

let db, as, rect, bo;
before(async () => {
  ({ db, as } = await setupDb());
  bo = (await db.query(`select id from public.products where code = 'BO'`)).rows[0].id;
  rect = await as(MEDIDOR, async (tx) => {
    const c = await tx.query(`select id from public.create_customer_with_address('Cliente Firma', '912345678', null, null, 'Calle 1', 'Maipú', null, '11111111-1')`);
    return (await tx.query(`insert into public.rectifications (customer_id, address_line, comuna) values ($1, 'Calle 1', 'Maipú') returning id`, [c.rows[0].id])).rows[0].id;
  });
});

test('rut_is_valid: dígito verificador, K y formato normalizado', async () => {
  const q = async (r) => (await db.query(`select public.rut_is_valid($1) as ok`, [r])).rows[0].ok;
  assert.equal(await q('12345678-5'), true);
  assert.equal(await q('11111111-1'), true);
  assert.equal(await q('10000013-K'), true);
  assert.equal(await q('12345678-4'), false);
  assert.equal(await q('12.345.678-5'), false);
  assert.equal(await q('10000013-k'), false);
});

test('RUT del cliente: opcional, válido y sin repetir', async () => {
  await as(MEDIDOR, (tx) => tx.query(`select public.create_customer_with_address('Sin RUT', '912345679', null, null, 'Calle 2', 'Maipú', null)`));
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.create_customer_with_address('Repetido', '912345670', null, null, 'Calle 3', 'Maipú', null, '11111111-1')`)), /duplicate|unique/i);
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.create_customer_with_address('Malo', '912345671', null, null, 'Calle 3', 'Maipú', null, '12345678-4')`)), /check|violates/i);
  const r = await as(MEDIDOR, (tx) => tx.query(`select full_name from public.customers where rut ilike '%11111111%'`));
  assert.equal(r.rows[0].full_name, 'Cliente Firma');
});

test('firma: exige cortinas, solo por sign_rectification, y se borra al volver a borrador', async () => {
  const path = `${rect}/firma-1.png`;
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.sign_rectification($1, $2, 'Cliente Firma', '11111111-1')`, [rect, path])), /cortina/);
  await as(MEDIDOR, async (tx) => {
    const l = await tx.query(`insert into public.locations (rectification_id, name) values ($1, 'Living') returning id`, [rect]);
    await tx.query(`select public.save_curtain($1)`, [JSON.stringify({ location_id: l.rows[0].id, product_id: bo,
      components: [{ role: 'unica', width_cm: 170, height_cm: 220, color_name: null, fall: null, motorized: false }] })]);
  });
  // No se puede escribir la firma directo.
  await rejects(as(MEDIDOR, (tx) => tx.query(`update public.rectifications set signed_name = 'X' where id = $1`, [rect])), /firma/);
  // Ruta de otra rectificación: rechazada.
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.sign_rectification($1, 'otra/firma-1.png', 'X Y', null)`, [rect])), /no válida/);
  // Otro medidor no ve la rectificación.
  await rejects(as(MEDIDOR2, (tx) => tx.query(`select public.sign_rectification($1, $2, 'X Y', null)`, [rect, path])), /no encontrada/);

  await as(MEDIDOR, (tx) => tx.query(`select public.sign_rectification($1, $2, '  Cliente Firma ', '11111111-1')`, [rect, path]));
  let r = (await as(MEDIDOR, (tx) => tx.query(`select status, signature_path, signed_name, signed_rut, signed_at from public.rectifications where id = $1`, [rect]))).rows[0];
  assert.equal(r.status, 'completa');
  assert.equal(r.signed_name, 'Cliente Firma');
  assert.ok(r.signed_at);
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.sign_rectification($1, $2, 'Otra', null)`, [rect, path])), /ya está completa/);

  await as(MEDIDOR, (tx) => tx.query(`update public.rectifications set status = 'borrador' where id = $1`, [rect]));
  r = (await as(ADMIN, (tx) => tx.query(`select status, signature_path, signed_at from public.rectifications where id = $1`, [rect]))).rows[0];
  assert.deepEqual(r, { status: 'borrador', signature_path: null, signed_at: null });
});

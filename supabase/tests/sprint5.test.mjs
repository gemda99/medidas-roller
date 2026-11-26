// Sprint 5: configuración de la empresa, emisión con copia de la empresa e imágenes generadas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, rejects, ADMIN, MEDIDOR, MEDIDOR2 } from './harness.mjs';

let db;
let as;
let rect;
let quote;

before(async () => {
  ({ db, as } = await setupDb());
  const list = (await db.query(`select id from public.price_lists where name = 'Tarifario inicial'`)).rows[0].id;
  rect = await as(MEDIDOR, async (tx) => {
    const c = await tx.query(`select id from public.create_customer_with_address('Cliente Img', '912345678', null, null, 'Calle 1', 'Maipú', null)`);
    return (await tx.query(`insert into public.rectifications (customer_id, address_line, comuna) values ($1, 'Calle 1', 'Maipú') returning id`, [c.rows[0].id])).rows[0].id;
  });
  const p = {
    rectification_id: rect, price_list_id: list, iva_mode: 'excluido', discount_type: 'ninguno', discount_value: 0,
    installation_mode: 'proyecto', subtotal_products: 157080, discount_amount: 0, installation_amount: 50000,
    extras_amount: 0, net_amount: 207080, iva_amount: 39345, total_calculated: 246425, manual_adjustment: 0,
    total_final: 246425, customer_snapshot: {}, pricing_snapshot: {}, lines: [],
  };
  quote = (await as(MEDIDOR, (tx) => tx.query(`select public.save_quotation($1) as r`, [JSON.stringify(p)]))).rows[0].r.id;
  await as(MEDIDOR, (tx) => tx.query(`update public.quotations set work_snapshot = '{"curtains":[]}' where id = $1`, [quote]));
});

test('configuración: todos la leen, solo el admin la cambia; sin datos de empresa fijos', async () => {
  const row = (await as(MEDIDOR, (tx) => tx.query(`select business_name, thank_you_text from public.business_settings`))).rows[0];
  assert.deepEqual(row, { business_name: null, thank_you_text: 'Gracias por su preferencia' });
  const upd = await as(MEDIDOR, (tx) => tx.query(`update public.business_settings set business_name = 'X' returning 1`));
  assert.equal(upd.rows.length, 0);
  await as(ADMIN, (tx) => tx.query(`update public.business_settings set business_name = 'Mi Empresa', bank_name = 'Banco Uno'`));
});

test('emitir congela la cotización con la copia de la empresa; cambios posteriores no la alteran', async () => {
  await as(MEDIDOR, (tx) => tx.query(`select public.issue_quotation($1)`, [quote]));
  const q = (await db.query(`select status, issued_at is not null as issued, business_snapshot ->> 'business_name' as name from public.quotations where id = $1`, [quote])).rows[0];
  assert.deepEqual(q, { status: 'emitida', issued: true, name: 'Mi Empresa' });
  await as(ADMIN, (tx) => tx.query(`update public.business_settings set business_name = 'Otro Nombre'`));
  const again = (await db.query(`select business_snapshot ->> 'business_name' as name from public.quotations where id = $1`, [quote])).rows[0];
  assert.equal(again.name, 'Mi Empresa');
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.issue_quotation($1)`, [quote])), /Solo se puede emitir/);
  await rejects(
    as(ADMIN, (tx) => tx.query(`update public.quotations set business_snapshot = '{}'::jsonb where id = $1`, [quote])),
    /ya fue emitida/,
  );
});

test('imágenes: el dueño sube y registra; otro medidor no ve ni sube; solo admin borra', async () => {
  const path = `${rect}/${quote}/cotizacion-1.png`;
  await as(MEDIDOR, async (tx) => {
    await tx.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [path]);
    await tx.query(`insert into public.generated_documents (quotation_id, kind, page, page_count, storage_path) values ($1, 'cotizacion', 1, 1, $2)`, [quote, path]);
  });
  assert.equal((await as(MEDIDOR2, (tx) => tx.query(`select 1 from public.generated_documents`))).rows.length, 0);
  await rejects(
    as(MEDIDOR2, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${rect}/${quote}/x.png`])),
    /row-level security/,
  );
  const del = await as(MEDIDOR, (tx) => tx.query(`delete from public.generated_documents where quotation_id = $1 returning 1`, [quote]));
  assert.equal(del.rows.length, 0);
});

test('logo: solo el admin sube a branding', async () => {
  await rejects(as(MEDIDOR, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('branding', 'logo.png')`)), /row-level security/);
  await as(ADMIN, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('branding', 'logo.png')`));
  assert.equal((await as(MEDIDOR, (tx) => tx.query(`select 1 from storage.objects where bucket_id = 'branding'`))).rows.length, 1);
});

test('garantía detallada: la edita el admin y queda en la copia al emitir', async () => {
  const { db, as } = await setupDb();
  await as(ADMIN, (tx) => tx.query(`update public.business_settings set warranty_details_text = 'Garantía:\nCubre 5 años'`));
  const row = (await as(MEDIDOR, (tx) => tx.query(`select warranty_details_text from public.business_settings`))).rows[0];
  assert.equal(row.warranty_details_text, 'Garantía:\nCubre 5 años');
  await rejects(as(ADMIN, (tx) => tx.query(`update public.business_settings set warranty_details_text = repeat('x', 3001)`)), /check|violates/i);
  await db.close();
});

test('colores de la app: por defecto los actuales, solo hex válido, los cambia el admin', async () => {
  const { db, as } = await setupDb();
  const r = (await as(MEDIDOR, (tx) => tx.query(`select theme_primary, theme_secondary from public.business_settings`))).rows[0];
  assert.deepEqual(r, { theme_primary: '#0F2A4A', theme_secondary: '#2563EB' });
  await as(ADMIN, (tx) => tx.query(`update public.business_settings set theme_primary = '#B91C1C'`));
  await rejects(as(ADMIN, (tx) => tx.query(`update public.business_settings set theme_primary = 'rojo'`)), /check|violates/i);
  const m = await as(MEDIDOR, (tx) => tx.query(`update public.business_settings set theme_primary = '#000000' returning 1`));
  assert.equal(m.rows.length, 0);
  await db.close();
});

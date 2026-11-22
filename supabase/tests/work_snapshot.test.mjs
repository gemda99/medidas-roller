// Confección e instalación desde la cotización aceptada (copia del trabajo congelada).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, rejects, MEDIDOR } from './harness.mjs';

let db, as, rect, list;
before(async () => {
  ({ db, as } = await setupDb());
  list = (await db.query(`select id from public.price_lists limit 1`)).rows[0].id;
  rect = await as(MEDIDOR, async (tx) => {
    const c = await tx.query(`select id from public.create_customer_with_address('Cliente Copia', '912345678', null, null, 'Calle 1', 'Maipú', null)`);
    return (await tx.query(`insert into public.rectifications (customer_id, address_line, comuna) values ($1, 'Calle 1', 'Maipú') returning id`, [c.rows[0].id])).rows[0].id;
  });
});

const newQuote = async () => {
  const p = {
    rectification_id: rect, price_list_id: list, iva_mode: 'sin', discount_type: 'ninguno', discount_value: 0,
    installation_mode: 'manual', subtotal_products: 40000, discount_amount: 0, installation_amount: 0,
    extras_amount: 0, net_amount: 40000, iva_amount: 0, total_calculated: 40000, manual_adjustment: 0,
    total_final: 40000, customer_snapshot: {}, pricing_snapshot: {}, lines: [],
  };
  return (await as(MEDIDOR, (tx) => tx.query(`select public.save_quotation($1) as r`, [JSON.stringify(p)]))).rows[0].r.id;
};
const doc = (q, kind) => as(MEDIDOR, (tx) => tx.query(
  `insert into public.generated_documents (quotation_id, kind, page, page_count, storage_path) values ($1, $2, 1, 1, $3)`,
  [q, kind, `${rect}/${q}/${kind}-${Math.random()}.png`]));

test('sin copia del trabajo no se puede emitir', async () => {
  const q = await newQuote();
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.issue_quotation($1)`, [q])), /Vuelve a guardar/);
});

test('la copia se fija al emitir; confección e instalación solo con la cotización aceptada', async () => {
  const q = await newQuote();
  await as(MEDIDOR, (tx) => tx.query(`update public.quotations set work_snapshot = '{"curtains":[{"index":1}]}' where id = $1`, [q]));
  await as(MEDIDOR, (tx) => tx.query(`select public.issue_quotation($1)`, [q]));
  await rejects(as(MEDIDOR, (tx) => tx.query(`update public.quotations set work_snapshot = '{}' where id = $1`, [q])), /ya fue emitida/);
  await doc(q, 'cotizacion');
  await rejects(doc(q, 'confeccion'), /acepta/);
  await as(MEDIDOR, (tx) => tx.query(`update public.quotations set status = 'aceptada' where id = $1`, [q]));
  await doc(q, 'confeccion');
  await doc(q, 'instalacion');
  const kinds = (await as(MEDIDOR, (tx) => tx.query(`select kind from public.generated_documents where quotation_id = $1 order by kind`, [q]))).rows.map((r) => r.kind);
  assert.deepEqual(kinds, ['confeccion', 'cotizacion', 'instalacion']);
  await rejects(doc(q, 'otra'), /check|violates/i);
});

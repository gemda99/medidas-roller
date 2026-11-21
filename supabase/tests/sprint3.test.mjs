// Sprint 3: tarifarios con versiones y fotos (tabla + Storage).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, rejects, ADMIN, MEDIDOR, MEDIDOR2 } from './harness.mjs';

let db;
let as;
const ids = {};
let initial;

before(async () => {
  ({ db, as } = await setupDb());
  for (const r of (await db.query(`select id, code from public.products`)).rows) ids[r.code] = r.id;
  initial = (await db.query(`select id from public.price_lists where name = 'Tarifario inicial'`)).rows[0].id;
});

test('el tarifario inicial queda en borrador con solo los valores informados', async () => {
  const l = (await db.query(`select status, general_min_price, motor_price, cenefa_price_ml, installation_project_price, iva_rate::text
                             from public.price_lists where id = $1`, [initial])).rows[0];
  assert.deepEqual(l, { status: 'borrador', general_min_price: 40000, motor_price: 100000, cenefa_price_ml: 10000,
    installation_project_price: 50000, iva_rate: '0.1900' });
  const prices = (await db.query(`select p.code, pp.price_m2, pp.min_price from public.product_prices pp
    join public.products p on p.id = pp.product_id where price_list_id = $1 and (pp.price_m2 is not null or pp.min_price is not null) order by p.code`, [initial])).rows;
  assert.deepEqual(prices, [
    { code: 'BO', price_m2: 21000, min_price: null },
    { code: 'SE+BO', price_m2: null, min_price: 70000 },
    { code: 'SE+BOP', price_m2: null, min_price: 70000 },
  ]);
});

test('no se activa si faltan precios por m²; dice cuáles', async () => {
  await rejects(as(ADMIN, (tx) => tx.query(`select public.activate_price_list($1)`, [initial])), /Falta el precio por m² de: SE, RD, RDBO, BOP, VC, VE/);
});

test('el medidor no ve borradores ni puede editar ni activar tarifarios', async () => {
  const seen = await as(MEDIDOR, (tx) => tx.query(`select id from public.price_lists`));
  assert.equal(seen.rows.length, 0);
  await rejects(as(MEDIDOR, (tx) => tx.query(`select public.activate_price_list($1)`, [initial])), /Solo el administrador/);
  const upd = await as(MEDIDOR, (tx) => tx.query(`update public.product_prices set price_m2 = 1 where price_list_id = $1 returning 1`, [initial]));
  assert.equal(upd.rows.length, 0);
});

test('activar, bloquear el vigente, copiar y reemplazar', async () => {
  await as(ADMIN, (tx) => tx.query(`update public.product_prices set price_m2 = 20000 where price_list_id = $1 and price_m2 is null
    and product_id in (select id from public.products where kind = 'tela')`, [initial]));
  await as(ADMIN, (tx) => tx.query(`select public.activate_price_list($1)`, [initial]));
  assert.equal((await db.query(`select status from public.price_lists where id = $1`, [initial])).rows[0].status, 'vigente');

  // El medidor ahora ve el vigente y sus precios.
  const mine = await as(MEDIDOR, (tx) => tx.query(`select price_m2 from public.product_prices where price_list_id = $1 and product_id = $2`, [initial, ids.BO]));
  assert.equal(mine.rows[0].price_m2, 21000);

  // El vigente no se edita.
  await rejects(
    as(ADMIN, (tx) => tx.query(`update public.product_prices set price_m2 = 25000 where price_list_id = $1 and product_id = $2`, [initial, ids.BO])),
    /ya está en uso/,
  );
  await rejects(as(ADMIN, (tx) => tx.query(`update public.price_lists set motor_price = 1 where id = $1`, [initial])), /ya está en uso/);

  // Copia → editar → activar: el anterior queda archivado con sus precios intactos.
  const copy = (await as(ADMIN, (tx) => tx.query(`select public.clone_price_list($1, 'Diciembre') as id`, [initial]))).rows[0].id;
  await as(ADMIN, (tx) => tx.query(`update public.product_prices set price_m2 = 23000 where price_list_id = $1 and product_id = $2`, [copy, ids.BO]));
  await as(ADMIN, (tx) => tx.query(`select public.activate_price_list($1)`, [copy]));
  const states = (await db.query(`select name, status from public.price_lists order by created_at`)).rows;
  assert.deepEqual(states, [{ name: 'Tarifario inicial', status: 'archivada' }, { name: 'Diciembre', status: 'vigente' }]);
  const old = (await db.query(`select price_m2 from public.product_prices where price_list_id = $1 and product_id = $2`, [initial, ids.BO])).rows[0];
  assert.equal(old.price_m2, 21000);
});

test('solo se borran tarifarios en borrador', async () => {
  await rejects(as(ADMIN, (tx) => tx.query(`delete from public.price_lists where id = $1`, [initial])), /Solo se pueden eliminar/);
  const draft = (await as(ADMIN, (tx) => tx.query(`select public.clone_price_list($1) as id`, [initial]))).rows[0].id;
  const del = await as(ADMIN, (tx) => tx.query(`delete from public.price_lists where id = $1 returning id`, [draft]));
  assert.equal(del.rows.length, 1);
});

async function curtainOf(user) {
  return as(user, async (tx) => {
    const c = await tx.query(`select id from public.create_customer_with_address('Foto Cliente', '911112222', null, null, 'Calle 9', 'Maipú', null)`);
    const r = await tx.query(`insert into public.rectifications (customer_id, address_line, comuna) values ($1, 'Calle 9', 'Maipú') returning id`, [c.rows[0].id]);
    const l = await tx.query(`insert into public.locations (rectification_id, name) values ($1, 'Living') returning id`, [r.rows[0].id]);
    const cur = await tx.query(`select public.save_curtain($1) as id`, [JSON.stringify({
      location_id: l.rows[0].id, product_id: ids.BO, components: [{ role: 'unica', width_cm: 100, height_cm: 100 }],
    })]);
    return { rect: r.rows[0].id, curtain: cur.rows[0].id };
  });
}

test('fotos: el dueño sube y registra; otro medidor no ve ni sube', async () => {
  const { rect, curtain } = await curtainOf(MEDIDOR);
  const path = `${rect}/${curtain}/a.jpg`;
  await as(MEDIDOR, async (tx) => {
    await tx.query(`insert into storage.objects (bucket_id, name) values ('curtain-photos', $1)`, [path]);
    await tx.query(`insert into public.curtain_photos (curtain_id, storage_path, width, height, size_bytes) values ($1, $2, 1600, 1200, 300000)`, [curtain, path]);
  });
  const other = await as(MEDIDOR2, (tx) => tx.query(`select name from storage.objects where bucket_id = 'curtain-photos'`));
  assert.equal(other.rows.length, 0);
  await rejects(
    as(MEDIDOR2, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('curtain-photos', $1)`, [`${rect}/${curtain}/b.jpg`])),
    /row-level security/,
  );
  await rejects(
    as(MEDIDOR2, (tx) => tx.query(`insert into public.curtain_photos (curtain_id, storage_path) values ($1, $2)`, [curtain, `${rect}/${curtain}/c.jpg`])),
    /row-level security/,
  );
  const admin = await as(ADMIN, (tx) => tx.query(`select storage_path from public.curtain_photos where curtain_id = $1`, [curtain]));
  assert.equal(admin.rows.length, 1);
});

test('fotos: rutas que no empiezan con una rectificación válida se rechazan', async () => {
  await rejects(
    as(MEDIDOR, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('curtain-photos', 'cualquier/cosa.jpg')`)),
    /row-level security/,
  );
});

// Sprint 2: catálogo base, rectificaciones, ubicaciones, cortinas y save_curtain.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, rejects, ADMIN, MEDIDOR, MEDIDOR2 } from './harness.mjs';

let db;
let as;
let customerId;
const ids = {};

before(async () => {
  ({ db, as } = await setupDb());
  const { rows } = await db.query(`select id, code from public.products`);
  for (const r of rows) ids[r.code] = r.id;
  const acc = await db.query(`select id, name from public.accessories`);
  for (const r of acc.rows) ids[r.name] = r.id;
  customerId = await as(MEDIDOR, async (tx) => {
    const r = await tx.query(
      `select id from public.create_customer_with_address('Cliente Rect', '912345678', null, null, 'Calle 1 123', 'San Bernardo', null)`,
    );
    return r.rows[0].id;
  });
});

async function newRect(user) {
  return as(user, async (tx) => {
    const r = await tx.query(
      `insert into public.rectifications (customer_id, address_line, comuna) values ($1, 'Calle 1 123', 'San Bernardo') returning id, executive_name`,
      [customerId],
    );
    const l = await tx.query(`insert into public.locations (rectification_id, name) values ($1, 'Living') returning id`, [r.rows[0].id]);
    return { rect: r.rows[0].id, executiveName: r.rows[0].executive_name, loc: l.rows[0].id };
  });
}

const simple = (loc, extra = {}) => ({
  location_id: loc,
  product_id: ids.BO,
  surface: 'concreto',
  mounting: 'muro',
  fall: 'externa',
  chain_side: 'izquierda',
  chain_length_m: '1.5',
  components: [{ role: 'unica', width_cm: 170, height_cm: 220, color_name: 'Beige', motorized: false }],
  ...extra,
});

test('el catálogo inicial tiene los 8 productos y los dobles con fondo y frente', async () => {
  const { rows } = await db.query(`select code from public.products order by sort_order`);
  assert.deepEqual(rows.map((r) => r.code), ['SE', 'BO', 'SE+BO', 'RD', 'RDBO', 'BOP', 'SE+BOP', 'VE']);
  const comps = await db.query(
    `select s.code sys, pc.role, c.code comp from public.product_components pc
     join public.products s on s.id = pc.system_product_id join public.products c on c.id = pc.component_product_id
     order by 1, 2`,
  );
  assert.deepEqual(comps.rows, [
    { sys: 'SE+BO', role: 'fondo', comp: 'SE' },
    { sys: 'SE+BO', role: 'frente', comp: 'BO' },
    { sys: 'SE+BOP', role: 'fondo', comp: 'SE' },
    { sys: 'SE+BOP', role: 'frente', comp: 'BOP' },
  ]);
});

test('un medidor no puede modificar el catálogo', async () => {
  await rejects(
    as(MEDIDOR, (tx) => tx.query(`insert into public.colors (name) values ('Rosado')`)),
    /row-level security/,
  );
});

test('la rectificación copia el nombre del ejecutivo', async () => {
  const { executiveName } = await newRect(MEDIDOR2);
  assert.equal(executiveName, 'Otro Medidor');
});

test('un medidor no ve las rectificaciones de otro; el admin ve todas', async () => {
  const { rect } = await newRect(MEDIDOR2);
  const seenByOther = await as(MEDIDOR, (tx) => tx.query(`select id from public.rectifications where id = $1`, [rect]));
  assert.equal(seenByOther.rows.length, 0);
  const seenByAdmin = await as(ADMIN, (tx) => tx.query(`select id from public.rectifications where id = $1`, [rect]));
  assert.equal(seenByAdmin.rows.length, 1);
});

test('un medidor no puede agregar ubicaciones ni cortinas a una rectificación ajena', async () => {
  const { rect, loc } = await newRect(MEDIDOR2);
  await rejects(
    as(MEDIDOR, (tx) => tx.query(`insert into public.locations (rectification_id, name) values ($1, 'Intruso')`, [rect])),
    /row-level security/,
  );
  await rejects(
    as(MEDIDOR, (tx) => tx.query(`select public.save_curtain($1)`, [JSON.stringify(simple(loc))])),
    /row-level security/,
  );
});

test('save_curtain guarda una cortina simple con accesorios y opciones válidas', async () => {
  const { loc } = await newRect(MEDIDOR);
  const velcro = (await db.query(`select id from public.product_options where product_id = $1 and name = 'Velcro'`, [ids.BO])).rows[0].id;
  const id = await as(MEDIDOR, async (tx) => {
    const r = await tx.query(`select public.save_curtain($1) as id`, [
      JSON.stringify(simple(loc, { option_ids: [velcro], accessories: [{ accessory_id: ids.Peso, quantity: 2 }], has_cenefa: true })),
    ]);
    return r.rows[0].id;
  });
  const c = await db.query(`select has_cenefa, chain_length_m::text from public.curtains where id = $1`, [id]);
  assert.deepEqual(c.rows[0], { has_cenefa: true, chain_length_m: '1.50' });
  const comps = await db.query(`select role, width_cm::text, height_cm::text from public.curtain_components where curtain_id = $1`, [id]);
  assert.deepEqual(comps.rows, [{ role: 'unica', width_cm: '170.0', height_cm: '220.0' }]);
  assert.equal((await db.query(`select 1 from public.curtain_options where curtain_id = $1`, [id])).rows.length, 1);
  assert.equal((await db.query(`select quantity from public.curtain_accessories where curtain_id = $1`, [id])).rows[0].quantity, 2);
});

test('el doble exige fondo y frente, y cada tela toma su producto', async () => {
  const { loc } = await newRect(MEDIDOR);
  await rejects(
    as(MEDIDOR, (tx) =>
      tx.query(`select public.save_curtain($1)`, [JSON.stringify(simple(loc, { product_id: ids['SE+BO'] }))]),
    ),
    /no coinciden/,
  );
  const id = await as(MEDIDOR, async (tx) => {
    const r = await tx.query(`select public.save_curtain($1) as id`, [
      JSON.stringify(
        simple(loc, {
          product_id: ids['SE+BO'],
          components: [
            { role: 'fondo', width_cm: 150, height_cm: 160, motorized: false },
            { role: 'frente', width_cm: 148, height_cm: 160, motorized: true },
          ],
        }),
      ),
    ]);
    return r.rows[0].id;
  });
  const { rows } = await db.query(
    `select cc.role, p.code, cc.width_cm::text, cc.motorized from public.curtain_components cc
     join public.products p on p.id = cc.product_id where curtain_id = $1 order by role`,
    [id],
  );
  assert.deepEqual(rows, [
    { role: 'fondo', code: 'SE', width_cm: '150.0', motorized: false },
    { role: 'frente', code: 'BO', width_cm: '148.0', motorized: true },
  ]);
});

test('cenefa: incluida en RDBO aunque no se marque; imposible en BOP', async () => {
  const { loc } = await newRect(MEDIDOR);
  const save = (code, has) =>
    as(MEDIDOR, async (tx) => {
      const r = await tx.query(`select public.save_curtain($1) as id`, [
        JSON.stringify(simple(loc, { product_id: ids[code], has_cenefa: has })),
      ]);
      return (await tx.query(`select has_cenefa from public.curtains where id = $1`, [r.rows[0].id])).rows[0].has_cenefa;
    });
  assert.equal(await save('RDBO', false), true);
  assert.equal(await save('BOP', true), false);
});

test('cortina sin cadena (velcro) se guarda con lado y largo vacíos', async () => {
  const { loc } = await newRect(MEDIDOR);
  const id = await as(MEDIDOR, async (tx) => {
    const r = await tx.query(`select public.save_curtain($1) as id`, [
      JSON.stringify(simple(loc, { chain_side: '', chain_length_m: '' })),
    ]);
    return r.rows[0].id;
  });
  const c = await db.query(`select chain_side, chain_length_m from public.curtains where id = $1`, [id]);
  assert.deepEqual(c.rows[0], { chain_side: null, chain_length_m: null });
});

test('medidas fuera de rango se rechazan', async () => {
  const { loc } = await newRect(MEDIDOR);
  await rejects(
    as(MEDIDOR, (tx) =>
      tx.query(`select public.save_curtain($1)`, [
        JSON.stringify(simple(loc, { components: [{ role: 'unica', width_cm: 5, height_cm: 220 }] })),
      ]),
    ),
    /check constraint/,
  );
});

test('editar una cortina reemplaza sus telas sin duplicarlas', async () => {
  const { loc } = await newRect(MEDIDOR);
  const id = await as(MEDIDOR, async (tx) => (await tx.query(`select public.save_curtain($1) as id`, [JSON.stringify(simple(loc))])).rows[0].id);
  await as(MEDIDOR, (tx) =>
    tx.query(`select public.save_curtain($1)`, [
      JSON.stringify(simple(loc, { id, components: [{ role: 'unica', width_cm: 200, height_cm: 210 }] })),
    ]),
  );
  const { rows } = await db.query(`select width_cm::text from public.curtain_components where curtain_id = $1`, [id]);
  assert.deepEqual(rows, [{ width_cm: '200.0' }]);
});

test('move_location intercambia el orden con la vecina', async () => {
  const { rect } = await newRect(MEDIDOR);
  await as(MEDIDOR, async (tx) => {
    await tx.query(`insert into public.locations (rectification_id, name) values ($1, 'Hab 1'), ($1, 'Hab 2')`, [rect]);
  });
  const order = async () =>
    (await db.query(`select name from public.locations where rectification_id = $1 order by sort_order, created_at, id`, [rect])).rows.map((r) => r.name);
  const before = await order();
  const last = (await db.query(`select id from public.locations where rectification_id = $1 and name = $2`, [rect, before[2]])).rows[0].id;
  await as(MEDIDOR, (tx) => tx.query(`select public.move_location($1, -1)`, [last]));
  const after = await order();
  assert.deepEqual(after, [before[0], before[2], before[1]]);
});

test('el medidor borra su borrador pero no una rectificación completa; el admin sí', async () => {
  const { rect } = await newRect(MEDIDOR);
  await as(MEDIDOR, (tx) => tx.query(`update public.rectifications set status = 'completa' where id = $1`, [rect]));
  const byMedidor = await as(MEDIDOR, (tx) => tx.query(`delete from public.rectifications where id = $1 returning id`, [rect]));
  assert.equal(byMedidor.rows.length, 0);
  const byAdmin = await as(ADMIN, (tx) => tx.query(`delete from public.rectifications where id = $1 returning id`, [rect]));
  assert.equal(byAdmin.rows.length, 1);
});

test('no se puede borrar un cliente que tiene rectificaciones', async () => {
  await newRect(MEDIDOR);
  await rejects(
    as(ADMIN, (tx) => tx.query(`delete from public.customers where id = $1`, [customerId])),
    /foreign key/,
  );
});

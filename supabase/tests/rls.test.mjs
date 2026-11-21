// Pruebas de las migraciones y de RLS sin Supabase real.
// Usa PGlite (PostgreSQL en WebAssembly) con una imitación mínima del esquema
// auth de Supabase: auth.users, auth.uid() y los roles anon/authenticated.
// Ejecutar: npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, rejects, ADMIN, MEDIDOR, INACTIVO } from './harness.mjs';

let db;
let as;

before(async () => {
  ({ db, as } = await setupDb());
});

test('el trigger crea el perfil como medidor con nombre por defecto', async () => {
  const { rows } = await db.query(`select full_name, role from public.profiles where id = $1`, [MEDIDOR]);
  assert.deepEqual(rows[0], { full_name: 'medidor', role: 'medidor' });
});

test('un medidor solo ve su propio perfil; el admin ve todos', async () => {
  const mine = await as(MEDIDOR, (tx) => tx.query(`select id from public.profiles`));
  assert.equal(mine.rows.length, 1);
  const all = await as(ADMIN, (tx) => tx.query(`select id from public.profiles`));
  assert.equal(all.rows.length, 4);
});

test('un medidor no puede subirse a administrador', async () => {
  const res = await as(MEDIDOR, (tx) =>
    tx.query(`update public.profiles set role = 'admin' where id = $1 returning id`, [MEDIDOR]),
  );
  assert.equal(res.rows.length, 0);
  const { rows } = await db.query(`select role from public.profiles where id = $1`, [MEDIDOR]);
  assert.equal(rows[0].role, 'medidor');
});

test('no se puede dejar la app sin administrador activo', async () => {
  await rejects(
    as(ADMIN, (tx) => tx.query(`update public.profiles set role = 'medidor' where id = $1`, [ADMIN])),
    /al menos un administrador/,
  );
});

test('anónimo no ve clientes', async () => {
  await rejects(as(null, (tx) => tx.query(`select * from public.customers`)), /permission denied/);
});

test('medidor crea cliente y dirección; created_by es el usuario actual', async () => {
  const id = await as(MEDIDOR, async (tx) => {
    const c = await tx.query(
      `insert into public.customers (full_name, phone) values ('Cliente Prueba', '+56 9 1234 5678') returning id, created_by`,
    );
    assert.equal(c.rows[0].created_by, MEDIDOR);
    await tx.query(
      `insert into public.customer_addresses (customer_id, address_line, comuna, is_default) values ($1, 'Calle 1 123', 'San Bernardo', true)`,
      [c.rows[0].id],
    );
    return c.rows[0].id;
  });
  const seen = await as(ADMIN, (tx) => tx.query(`select id from public.customers where id = $1`, [id]));
  assert.equal(seen.rows.length, 1);
});

test('un medidor no puede crear clientes a nombre de otro usuario', async () => {
  await rejects(
    as(MEDIDOR, (tx) =>
      tx.query(`insert into public.customers (full_name, phone, created_by) values ('X Y', '912345678', $1)`, [ADMIN]),
    ),
    /row-level security/,
  );
});

test('usuario desactivado no ve ni crea clientes', async () => {
  const res = await as(INACTIVO, (tx) => tx.query(`select id from public.customers`));
  assert.equal(res.rows.length, 0);
  await rejects(
    as(INACTIVO, (tx) => tx.query(`insert into public.customers (full_name, phone) values ('X Y', '912345678')`)),
    /row-level security/,
  );
});

test('validaciones: teléfono y correo inválidos se rechazan', async () => {
  await rejects(
    as(MEDIDOR, (tx) => tx.query(`insert into public.customers (full_name, phone) values ('Ana Pérez', 'abc')`)),
    /check constraint/,
  );
  await rejects(
    as(MEDIDOR, (tx) =>
      tx.query(`insert into public.customers (full_name, phone, email) values ('Ana Pérez', '912345678', 'no-es-correo')`),
    ),
    /check constraint/,
  );
});

test('solo el admin borra clientes', async () => {
  const id = await as(MEDIDOR, async (tx) => {
    const r = await tx.query(`insert into public.customers (full_name, phone) values ('Borrar Me', '987654321') returning id`);
    return r.rows[0].id;
  });
  const byMedidor = await as(MEDIDOR, (tx) => tx.query(`delete from public.customers where id = $1 returning id`, [id]));
  assert.equal(byMedidor.rows.length, 0);
  const byAdmin = await as(ADMIN, (tx) => tx.query(`delete from public.customers where id = $1 returning id`, [id]));
  assert.equal(byAdmin.rows.length, 1);
});

test('una sola dirección principal; set_default_address la cambia', async () => {
  const { customerId, a1, a2 } = await as(MEDIDOR, async (tx) => {
    const c = await tx.query(`insert into public.customers (full_name, phone) values ('Dos Direcciones', '911112222') returning id`);
    const customerId = c.rows[0].id;
    const a1 = (await tx.query(
      `insert into public.customer_addresses (customer_id, address_line, comuna, is_default) values ($1, 'Uno 1', 'Maipú', true) returning id`,
      [customerId],
    )).rows[0].id;
    const a2 = (await tx.query(
      `insert into public.customer_addresses (customer_id, address_line, comuna) values ($1, 'Dos 2', 'Maipú') returning id`,
      [customerId],
    )).rows[0].id;
    return { customerId, a1, a2 };
  });
  await rejects(
    as(MEDIDOR, (tx) => tx.query(`update public.customer_addresses set is_default = true where id = $1`, [a2])),
    /duplicate key/,
  );
  await as(MEDIDOR, (tx) => tx.query(`select public.set_default_address($1)`, [a2]));
  const { rows } = await db.query(
    `select id from public.customer_addresses where customer_id = $1 and is_default`,
    [customerId],
  );
  assert.deepEqual(rows.map((r) => r.id), [a2]);
  assert.notEqual(rows[0].id, a1);
});

test('búsqueda por teléfono sin espacios usa phone_digits', async () => {
  await as(MEDIDOR, (tx) => tx.query(`insert into public.customers (full_name, phone) values ('Fono Espacios', '+56 9 4444 5555')`));
  const { rows } = await as(MEDIDOR, (tx) =>
    tx.query(`select full_name from public.customers where phone_digits like '%944445555%'`),
  );
  assert.deepEqual(rows.map((r) => r.full_name), ['Fono Espacios']);
});

test('create_customer_with_address es atómica: si la dirección falla, no queda el cliente', async () => {
  await rejects(
    as(MEDIDOR, (tx) =>
      tx.query(`select * from public.create_customer_with_address('Atomico Prueba', '933334444', null, null, 'x', 'Maipú', null)`),
    ),
    /check constraint/,
  );
  const { rows } = await db.query(`select id from public.customers where full_name = 'Atomico Prueba'`);
  assert.equal(rows.length, 0);
  const ok = await as(MEDIDOR, (tx) =>
    tx.query(`select * from public.create_customer_with_address('Atomico Bien', '933334444', null, null, 'Calle 5 55', 'Maipú', null)`),
  );
  const addr = await db.query(`select is_default from public.customer_addresses where customer_id = $1`, [ok.rows[0].id]);
  assert.deepEqual(addr.rows, [{ is_default: true }]);
});

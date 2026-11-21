// Base común de las pruebas de base de datos: PGlite + imitación mínima de Supabase
// (auth.users, auth.uid(), roles anon/authenticated) + todas las migraciones en orden.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

export const ADMIN = '00000000-0000-0000-0000-00000000000a';
export const MEDIDOR = '00000000-0000-0000-0000-00000000000b';
export const INACTIVO = '00000000-0000-0000-0000-00000000000c';
export const MEDIDOR2 = '00000000-0000-0000-0000-00000000000d';

const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export async function setupDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ADMIN}', 'admin@ejemplo.cl', '{"full_name":"Admin Prueba"}'),
      ('${MEDIDOR}', 'medidor@ejemplo.cl', '{}'),
      ('${INACTIVO}', 'inactivo@ejemplo.cl', '{}'),
      ('${MEDIDOR2}', 'otro@ejemplo.cl', '{"full_name":"Otro Medidor"}');
    update public.profiles set role = 'admin' where id = '${ADMIN}';
    update public.profiles set active = false where id = '${INACTIVO}';
  `);
  /** Ejecuta fn como usuario autenticado (o anónimo si id es null) dentro de una transacción. */
  const as = (id, fn) =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [id ?? '']);
      await tx.exec(`set local role ${id ? 'authenticated' : 'anon'}`);
      return fn(tx);
    });
  return { db, as };
}

export async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => pattern.test(String(err.message)));
}

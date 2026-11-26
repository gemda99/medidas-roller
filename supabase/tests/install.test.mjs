// El instalador único debe correr completo en una base nueva y dejar todo lo de las migraciones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SUPABASE_SHIM } from './harness.mjs';

test('instalar_todo.sql está al día (incluye todas las migraciones; si falla: npm run install-sql)', () => {
  const sql = readFileSync(new URL('../instalar_todo.sql', import.meta.url), 'utf8');
  for (const f of readdirSync(new URL('../migrations', import.meta.url)).filter((x) => x.endsWith('.sql'))) {
    assert.ok(sql.includes(`-- >>>>>>>>>> ${f}`), `falta ${f}`);
  }
});

test('instalar_todo.sql corre de una vez en una base vacía', async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  await db.exec(readFileSync(new URL('../instalar_todo.sql', import.meta.url), 'utf8'));
  const r = (await db.query(`select
      to_regclass('public.business_settings') is not null as a,
      to_regprocedure('public.admin_delete_rectification(uuid)') is not null as b,
      exists(select 1 from information_schema.columns where table_name='business_settings' and column_name='theme_primary') as c,
      exists(select 1 from information_schema.columns where table_name='quotations' and column_name='work_snapshot') as d,
      (select count(*) from public.products)::int > 0 as e`)).rows[0];
  assert.deepEqual(r, { a: true, b: true, c: true, d: true, e: true });
  await db.close();
});

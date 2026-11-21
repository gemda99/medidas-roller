// Sprint 6: reglas de confección por producto.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, rejects, ADMIN, MEDIDOR } from './harness.mjs';

let db, as;
before(async () => {
  ({ db, as } = await setupDb());
});

const rules = async (code) =>
  (await as(MEDIDOR, (tx) => tx.query(
    `select conf_fabric_w, conf_fabric_h, conf_tube, conf_bottom, conf_cenefa, conf_roller from public.products where code = $1`, [code],
  ))).rows[0];

test('valores iniciales de confección según el Excel y D-25', async () => {
  assert.deepEqual(await rules('BO'), { conf_fabric_w: '-4.0', conf_fabric_h: '20.0', conf_tube: '-3.5', conf_bottom: '-3.5', conf_cenefa: '-0.5', conf_roller: null });
  assert.equal((await rules('BOP')).conf_tube, '-3.5');
  assert.equal((await rules('RDBO')).conf_roller, '-4.5');
  assert.equal((await rules('VE')).conf_fabric_w, null);
  assert.equal((await rules('VC')).conf_fabric_w, null);
  assert.equal((await rules('SE+BO')).conf_fabric_w, null);
});

test('solo el administrador cambia las reglas, dentro de rangos razonables', async () => {
  const r = await as(MEDIDOR, (tx) => tx.query(`update public.products set conf_tube = -3 where code = 'BO' returning 1`));
  assert.equal(r.rows.length, 0);
  await as(ADMIN, (tx) => tx.query(`update public.products set conf_fabric_w = -3, conf_fabric_h = 15, conf_tube = -3, conf_bottom = -3.5 where code = 'VC'`));
  assert.equal((await rules('VC')).conf_fabric_h, '15.0');
  await rejects(as(ADMIN, (tx) => tx.query(`update public.products set conf_tube = -80 where code = 'BO'`)), /check|violates/i);
});

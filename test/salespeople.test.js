// Salesperson register: validation, uniqueness, deactivate-not-delete, and audit trail.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, createClient } from './helpers/server.js';
import { createUser, login } from './helpers/fixtures.js';
import { query } from './helpers/testDb.js';

let server;
let admin;

before(async () => {
  server = await startTestServer();
  await createUser('boss', 'admin');
  admin = createClient(server.baseUrl);
  await login(admin, 'boss');
});

after(async () => {
  await server?.close();
});

async function auditFor(id) {
  return (await admin.request('GET', `/api/admin/audit?entity_type=salesperson&entity_id=${id}`)).body;
}

test('create validates required fields, email and uniqueness', async () => {
  assert.equal((await admin.request('POST', '/api/admin/salespeople', { name: 'No Code' })).status, 400);
  assert.equal((await admin.request('POST', '/api/admin/salespeople', { employee_code: 'SE-1' })).status, 400);
  const badEmail = await admin.request('POST', '/api/admin/salespeople', { employee_code: 'SE-1', name: 'A', email: 'nope' });
  assert.equal(badEmail.status, 400);
  const badErp = await admin.request('POST', '/api/admin/salespeople', { employee_code: 'SE-1', name: 'A', erp_sales_engineer_id: 'x' });
  assert.equal(badErp.status, 400);

  const created = await admin.request('POST', '/api/admin/salespeople', {
    employee_code: ' SE-1 ', name: ' Ravi Kumar ', email: 'ravi@example.com', erp_sales_engineer_id: 12,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.employee_code, 'SE-1');
  assert.equal(created.body.name, 'Ravi Kumar');
  assert.equal(created.body.erp_sales_engineer_id, 12);

  const dupCode = await admin.request('POST', '/api/admin/salespeople', { employee_code: 'SE-1', name: 'Other' });
  assert.equal(dupCode.status, 409);
  assert.match(dupCode.body.error, /employee code/);
  const dupErp = await admin.request('POST', '/api/admin/salespeople', { employee_code: 'SE-2', name: 'Other', erp_sales_engineer_id: 12 });
  assert.equal(dupErp.status, 409);
  assert.match(dupErp.body.error, /ERP sales engineer/);

  assert.equal((await auditFor(created.body.id))[0].action, 'salesperson.created');
});

test('update is partial and audited with before/after', async () => {
  const { body: sp } = await admin.request('POST', '/api/admin/salespeople', { employee_code: 'SE-3', name: 'Priya', phone: '111' });
  const res = await admin.request('PUT', `/api/admin/salespeople/${sp.id}`, { phone: '999', erp_sales_engineer_id: null });
  assert.equal(res.status, 200);
  assert.equal(res.body.phone, '999');
  assert.equal(res.body.name, 'Priya');
  assert.equal((await admin.request('PUT', `/api/admin/salespeople/${sp.id}`, { name: '  ' })).status, 400);

  const [entry] = await auditFor(sp.id);
  assert.equal(entry.action, 'salesperson.updated');
  assert.equal(entry.before.phone, '111');
  assert.equal(entry.after.phone, '999');
});

test('a salesperson with an active login cannot be deactivated until the login is', async () => {
  const { body: sp } = await admin.request('POST', '/api/admin/salespeople', { employee_code: 'SE-4', name: 'Arjun' });
  const { body: user } = await admin.request('POST', '/api/admin/users', {
    username: 'arjun', password: 'arjun-password', role: 'salesperson', salesperson_id: sp.id,
  });

  const blocked = await admin.request('POST', `/api/admin/salespeople/${sp.id}/deactivate`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /Deactivate the login "arjun"/);

  assert.equal((await admin.request('POST', `/api/admin/users/${user.id}/deactivate`)).status, 200);
  const done = await admin.request('POST', `/api/admin/salespeople/${sp.id}/deactivate`);
  assert.equal(done.status, 200);
  assert.equal(done.body.is_active, false);
  assert.equal((await auditFor(sp.id))[0].action, 'salesperson.deactivated');

  // Reactivating the login now fails: its salesperson record is inactive.
  const reactivateUser = await admin.request('POST', `/api/admin/users/${user.id}/reactivate`);
  assert.equal(reactivateUser.status, 400);
  assert.match(reactivateUser.body.error, /inactive/);

  assert.equal((await admin.request('POST', `/api/admin/salespeople/${sp.id}/reactivate`)).status, 200);
  assert.equal((await admin.request('POST', `/api/admin/users/${user.id}/reactivate`)).status, 200);
});

test('salespeople cannot be deleted', async () => {
  const { body: sp } = await admin.request('POST', '/api/admin/salespeople', { employee_code: 'SE-5', name: 'Keep' });
  const res = await admin.request('DELETE', `/api/admin/salespeople/${sp.id}`);
  assert.equal(res.status, 405);
  assert.equal((await query(`SELECT COUNT(*)::int c FROM salesperson WHERE id = $1`, [sp.id]))[0].c, 1);
});

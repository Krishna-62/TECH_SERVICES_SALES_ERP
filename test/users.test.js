// Account lifecycle: roles, salesperson links, deactivation instead of deletion, and the audit trail.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, createClient } from './helpers/server.js';
import { createSalesperson, createUser, login, PASSWORD } from './helpers/fixtures.js';
import { query } from './helpers/testDb.js';

let server;
let admin;
let adminId;
let personA;
let personB;
let inactivePerson;

before(async () => {
  server = await startTestServer();
  personA = await createSalesperson('Anil');
  personB = await createSalesperson('Bhavna');
  inactivePerson = await createSalesperson('Former', { active: false });
  adminId = await createUser('boss', 'admin');
  admin = createClient(server.baseUrl);
  await login(admin, 'boss');
});

after(async () => {
  await server?.close();
});

async function auditFor(userId) {
  return (await admin.request('GET', `/api/admin/audit?entity_type=app_user&entity_id=${userId}`)).body;
}

test('creating a salesperson requires an active, unlinked salesperson record', async () => {
  const missing = await admin.request('POST', '/api/admin/users', { username: 'rep', password: PASSWORD, role: 'salesperson' });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /linked to a salesperson record/);

  const inactive = await admin.request('POST', '/api/admin/users', {
    username: 'rep', password: PASSWORD, role: 'salesperson', salesperson_id: inactivePerson,
  });
  assert.equal(inactive.status, 400);

  const badRole = await admin.request('POST', '/api/admin/users', { username: 'rep', password: PASSWORD, role: 'superuser' });
  assert.equal(badRole.status, 400);

  const created = await admin.request('POST', '/api/admin/users', {
    username: 'rep', password: PASSWORD, role: 'salesperson', salesperson_id: personA,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.salesperson_name, 'Anil');
  assert.equal(created.body.is_active, true);

  const duplicateLink = await admin.request('POST', '/api/admin/users', {
    username: 'rep2', password: PASSWORD, role: 'salesperson', salesperson_id: personA,
  });
  assert.equal(duplicateLink.status, 409);
  assert.match(duplicateLink.body.error, /already linked/);

  const [entry] = await auditFor(created.body.id);
  assert.equal(entry.action, 'user.created');
  assert.equal(entry.actor_username, 'boss');
  assert.equal(entry.after.role, 'salesperson');
  assert.equal(entry.after.password_hash, undefined);
});

test('updating role, salesperson and manager is validated and audited with before/after', async () => {
  const managerId = await createUser('mgr', 'sales_manager');
  const repId = await createUser('rep3', 'office_staff');

  const selfManaged = await admin.request('PUT', `/api/admin/users/${repId}`, { manager_user_id: repId });
  assert.equal(selfManaged.status, 400);

  const notAManager = await admin.request('PUT', `/api/admin/users/${repId}`, { manager_user_id: adminId + 999 });
  assert.equal(notAManager.status, 400);

  const res = await admin.request('PUT', `/api/admin/users/${repId}`, {
    role: 'salesperson', salesperson_id: personB, manager_user_id: managerId,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'salesperson');
  assert.equal(res.body.manager_username, 'mgr');

  const [entry] = await auditFor(repId);
  assert.equal(entry.action, 'user.updated');
  assert.equal(entry.before.role, 'office_staff');
  assert.equal(entry.after.role, 'salesperson');
  assert.equal(entry.after.salesperson_id, personB);
});

test('deactivation signs the user out everywhere, blocks login and deletes nothing', async () => {
  const personId = await createSalesperson('Leaver');
  const leaverId = await createUser('leaver', 'salesperson', { salespersonId: personId });
  const leaver = createClient(server.baseUrl);
  await login(leaver, 'leaver');
  assert.equal((await leaver.request('GET', '/api/auth/me')).status, 200);

  const res = await admin.request('POST', `/api/admin/users/${leaverId}/deactivate`, { reason: 'Resigned' });
  assert.equal(res.status, 200);
  assert.equal(res.body.is_active, false);
  assert.ok(res.body.deactivated_at);

  assert.equal((await leaver.request('GET', '/api/auth/me')).status, 401);
  const relogin = await leaver.request('POST', '/api/auth/login', { username: 'leaver', password: PASSWORD });
  assert.equal(relogin.status, 403);
  assert.match(relogin.body.error, /deactivated/);

  const [row] = await query(`SELECT username, salesperson_id FROM app_user WHERE id = $1`, [leaverId]);
  assert.equal(row.username, 'leaver');
  assert.equal(row.salesperson_id, personId);

  const [entry] = await auditFor(leaverId);
  assert.equal(entry.action, 'user.deactivated');
  assert.match(entry.summary, /Resigned/);

  assert.equal((await admin.request('POST', `/api/admin/users/${leaverId}/deactivate`)).status, 409);

  const back = await admin.request('POST', `/api/admin/users/${leaverId}/reactivate`);
  assert.equal(back.status, 200);
  assert.equal(back.body.is_active, true);
  await login(leaver, 'leaver');
  assert.equal((await auditFor(leaverId))[0].action, 'user.reactivated');
});

test('an existing session stops working as soon as the account is deactivated directly in the DB', async () => {
  const id = await createUser('direct', 'office_staff');
  const c = createClient(server.baseUrl);
  await login(c, 'direct');
  await query(`UPDATE app_user SET is_active = FALSE, deactivated_at = NOW() WHERE id = $1`, [id]);
  assert.equal((await c.request('GET', '/api/auth/me')).status, 401);
});

test('users cannot be deleted', async () => {
  const id = await createUser('keepme', 'office_staff');
  const res = await admin.request('DELETE', `/api/admin/users/${id}`);
  assert.equal(res.status, 405);
  assert.match(res.body.error, /Deactivate/);
  assert.equal((await query(`SELECT COUNT(*)::int c FROM app_user WHERE id = $1`, [id]))[0].c, 1);
});

test('the last active administrator cannot be deactivated or demoted, nor can you deactivate yourself', async () => {
  assert.equal((await admin.request('POST', `/api/admin/users/${adminId}/deactivate`)).status, 400);
  assert.equal((await admin.request('PUT', `/api/admin/users/${adminId}`, { role: 'office_staff' })).status, 400);

  const mdId = await createUser('md', 'managing_director');
  const md = createClient(server.baseUrl);
  await login(md, 'md');
  // With two administrators the MD may deactivate the admin, but then can't demote themself.
  assert.equal((await md.request('POST', `/api/admin/users/${adminId}/deactivate`)).status, 200);
  const bossAgain = createClient(server.baseUrl);
  assert.equal((await bossAgain.request('POST', '/api/auth/login', { username: 'boss', password: PASSWORD })).status, 403);
  assert.equal((await md.request('PUT', `/api/admin/users/${mdId}`, { role: 'office_staff' })).status, 400);
  assert.equal((await md.request('POST', `/api/admin/users/${adminId}/reactivate`)).status, 200);
  // Deactivation revoked the admin's session; sign back in for the remaining tests.
  await login(admin, 'boss');
});

test('password reset is audited and revokes sessions', async () => {
  const id = await createUser('forgetful', 'office_staff');
  const c = createClient(server.baseUrl);
  await login(c, 'forgetful');
  assert.equal((await admin.request('POST', `/api/admin/users/${id}/reset-password`, { password: 'new-password' })).status, 200);
  assert.equal((await c.request('GET', '/api/auth/me')).status, 401);
  await login(c, 'forgetful', 'new-password');
  assert.equal((await auditFor(id))[0].action, 'user.password_reset');
});

test('audit_log is append-only', async () => {
  await assert.rejects(query(`UPDATE audit_log SET summary = 'tampered'`), /append-only/);
  await assert.rejects(query(`DELETE FROM audit_log`), /append-only/);
  await assert.rejects(query(`TRUNCATE audit_log`), /append-only/);
});

test('database constraints back up the API rules', async () => {
  await assert.rejects(createUser('nolink', 'salesperson'), /app_user_salesperson_has_record/);
  await assert.rejects(createUser('weird', 'superuser'), /app_user_role_check/);
});

// Parent/branch companies and merging duplicates.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, createClient } from './helpers/server.js';
import { createCompany, createUser, dealFieldsFor, login, signedInSalesperson } from './helpers/fixtures.js';
import { query } from './helpers/testDb.js';

let server;
let ravi;
let manager;
let office;

before(async () => {
  server = await startTestServer();
  ravi = await signedInSalesperson(server.baseUrl, 'Ravi', createClient);
  await createUser('manager', 'sales_manager');
  manager = createClient(server.baseUrl);
  await login(manager, 'manager');
  await createUser('office', 'office_staff');
  office = createClient(server.baseUrl);
  await login(office, 'office');
});

after(async () => {
  await server?.close();
});

test('a branch can share its parent’s name in another city; the same city is refused', async () => {
  const { body: parent } = await manager.request('POST', '/api/companies', { name: 'Aurobindo Labs', city: 'Hyderabad' });
  assert.equal((await manager.request('POST', '/api/companies', { name: 'Aurobindo Labs', city: 'Vizag' })).status, 409, 'not without saying it is a branch');

  const branch = await manager.request('POST', '/api/companies', { name: 'Aurobindo Labs', city: 'Vizag', parent_company_id: parent.id, confirm_new: true });
  assert.equal(branch.status, 201, JSON.stringify(branch.body));
  assert.equal(branch.body.parent_company_id, parent.id);
  const again = await manager.request('POST', '/api/companies', { name: 'Aurobindo Labs', city: 'vizag ', parent_company_id: parent.id, confirm_new: true });
  assert.equal(again.status, 409);

  const parentView = (await ravi.client.request('GET', `/api/companies/${parent.id}`)).body;
  assert.deepEqual(parentView.branches.map((b) => b.city), ['Vizag']);
  const branchView = (await ravi.client.request('GET', `/api/companies/${branch.body.id}`)).body;
  assert.equal(branchView.parent.name, 'Aurobindo Labs');
  const found = (await ravi.client.request('GET', '/api/companies?q=Aurobindo')).body.find((c) => c.id === branch.body.id);
  assert.equal(found.parent_name, 'Aurobindo Labs');
});

test('the structure is one level deep and only a manager changes a parent', async () => {
  const { body: top } = await manager.request('POST', '/api/companies', { name: 'Top Co' });
  const { body: mid } = await manager.request('POST', '/api/companies', { name: 'Mid Co', parent_company_id: top.id, confirm_new: true });
  const deep = await manager.request('POST', '/api/companies', { name: 'Deep Co', parent_company_id: mid.id, confirm_new: true });
  assert.equal(deep.status, 400, 'a branch cannot have branches');
  const { body: other } = await manager.request('POST', '/api/companies', { name: 'Independent Works' });
  assert.equal((await ravi.client.request('PUT', `/api/companies/${other.id}`, { parent_company_id: top.id })).status, 403);
  assert.equal((await manager.request('PUT', `/api/companies/${other.id}`, { parent_company_id: other.id })).status, 400);
  assert.equal((await manager.request('PUT', `/api/companies/${top.id}`, { parent_company_id: other.id })).status, 409, 'a company with branches cannot become one');
  const set = await manager.request('PUT', `/api/companies/${other.id}`, { parent_company_id: top.id });
  assert.equal(set.body.parent_company_id, top.id);
  const cleared = await manager.request('PUT', `/api/companies/${other.id}`, { parent_company_id: null });
  assert.equal(cleared.body.parent_company_id, null);
  const [audit] = await query(`SELECT before, after FROM audit_log WHERE action = 'company.updated' AND entity_id = $1 ORDER BY id DESC LIMIT 1`, [other.id]);
  assert.equal(audit.before.parent_company_id, top.id);
});

test('merging moves everything to the company kept, archives the duplicate and is audited', async () => {
  const keep = await createCompany('Keep Pharma', { createdBy: ravi.userId });
  const dup = await createCompany('Kep Pharma Ltd', { createdBy: ravi.userId });
  await query(`UPDATE company SET phone = '0401234567', state = 'Telangana' WHERE id = $1`, [dup]);
  const { body: contact } = await ravi.client.request('POST', `/api/companies/${dup}/contacts`, { name: 'Dr. Rao', phone: '9111100001' });
  const { body: visit } = await ravi.client.request('POST', '/api/visits', { company_id: dup, contact_id: contact.id });
  const { body: task } = await ravi.client.request('POST', '/api/tasks', { company_id: dup, title: 'Call', due_date: '2099-01-01' });
  const { body: requirement } = await ravi.client.request('POST', '/api/requirements', { company_id: dup, description: 'A balance' });
  const fields = await dealFieldsFor('MERGE-1');
  const { body: deal } = await ravi.client.request('POST', '/api/opportunities', { company_id: dup, title: 'Merged deal', contact_id: contact.id, ...fields });

  assert.equal((await ravi.client.request('POST', `/api/companies/${dup}/merge`, { into_company_id: keep, reason: 'x' })).status, 403);
  assert.equal((await office.request('POST', `/api/companies/${dup}/merge`, { into_company_id: keep, reason: 'x' })).status, 403);
  assert.equal((await manager.request('POST', `/api/companies/${dup}/merge`, { into_company_id: keep })).status, 400, 'a reason is required');
  assert.equal((await manager.request('POST', `/api/companies/${dup}/merge`, { into_company_id: dup, reason: 'x' })).status, 400);

  const res = await manager.request('POST', `/api/companies/${dup}/merge`, { into_company_id: keep, reason: 'Same company, typo in the name' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.moved, { contacts: 1, visits: 1, follow_ups: 1, requirements: 1, deals: 1, instruments: 0, reorders: 0, contact_log: 0 });

  const kept = (await manager.request('GET', `/api/companies/${keep}`)).body;
  assert.equal(kept.contacts[0].id, contact.id);
  assert.ok(kept.visits.some((v) => v.id === visit.id));
  assert.ok(kept.tasks.some((t) => t.id === task.id));
  assert.ok(kept.requirements.some((r) => r.id === requirement.id));
  assert.ok(kept.opportunities.some((o) => o.id === deal.id));
  assert.equal(kept.phone, '0401234567', 'details the kept company lacked are carried over');
  assert.equal(kept.state, 'Telangana');

  const gone = await manager.request('GET', `/api/companies/${dup}`);
  assert.equal(gone.status, 404);
  assert.equal(gone.body.merged_into_company_id, keep, 'an old link can find the new home');
  assert.equal((await query(`SELECT COUNT(*)::int c FROM company WHERE id = $1`, [dup]))[0].c, 1, 'kept, not deleted');
  assert.ok(!(await manager.request('GET', '/api/companies?q=Kep')).body.some((c) => c.id === dup));

  const dealNow = (await ravi.client.request('GET', `/api/opportunities/${deal.id}`)).body;
  assert.equal(dealNow.company_id, keep);
  assert.equal(dealNow.history[0].field, 'Company');
  assert.equal(dealNow.history[0].from_value, 'Kep Pharma Ltd');

  const [audit] = await query(`SELECT summary, after FROM audit_log WHERE action = 'company.merged' AND entity_id = $1`, [dup]);
  assert.match(audit.summary, /typo in the name/);
  assert.deepEqual(audit.after.moved.deals, [deal.id]);

  // A change queued on a phone before the merge still lands on the company kept.
  const late = await ravi.client.request('POST', '/api/visits', { company_id: dup });
  assert.equal(late.status, 201);
  assert.equal(late.body.company_id, keep);
  const lateTask = await ravi.client.request('POST', '/api/tasks', { company_id: dup, title: 'Late', due_date: '2099-01-01' });
  assert.equal(lateTask.body.company_id, keep);

  assert.equal((await manager.request('POST', `/api/companies/${dup}/merge`, { into_company_id: keep, reason: 'again' })).status, 404);
});

test('merge rules: target must be approved; branches move with the duplicate', async () => {
  const pending = await createCompany('Pending Target', { createdBy: ravi.userId, approvalStatus: 'pending' });
  const source = await createCompany('Source Works', { createdBy: ravi.userId });
  const refused = await manager.request('POST', `/api/companies/${source}/merge`, { into_company_id: pending, reason: 'x' });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /must be approved/);

  const { body: branch } = await manager.request('POST', '/api/companies', { name: 'Source Works', city: 'Pune', parent_company_id: source, confirm_new: true });
  const target = await createCompany('Target Works', { createdBy: ravi.userId });
  assert.equal((await manager.request('POST', `/api/companies/${source}/merge`, { into_company_id: target, reason: 'Duplicate' })).status, 200);
  assert.equal((await manager.request('GET', `/api/companies/${branch.id}`)).body.parent_company_id, target);
  assert.equal((await query(`SELECT COUNT(*)::int c FROM company WHERE id = $1`, [source]))[0].c, 1);

  // Merging a parent into its own branch leaves that branch at the top.
  const parent = await createCompany('Parent Merge', { createdBy: ravi.userId });
  const { body: child } = await manager.request('POST', '/api/companies', { name: 'Parent Merge', city: 'Goa', parent_company_id: parent, confirm_new: true });
  assert.equal((await manager.request('POST', `/api/companies/${parent}/merge`, { into_company_id: child.id, reason: 'Keep the plant record' })).status, 200);
  assert.equal((await manager.request('GET', `/api/companies/${child.id}`)).body.parent_company_id, null);
});

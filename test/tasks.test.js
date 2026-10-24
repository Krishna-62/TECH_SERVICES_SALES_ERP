import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, createClient } from './helpers/server.js';
import { createCompany, createUser, login, signedInSalesperson } from './helpers/fixtures.js';
import { query } from './helpers/testDb.js';

let server;
let ravi;
let priya;
let manager;
let companyId;
let today;

function shift(days) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

before(async () => {
  server = await startTestServer();
  ravi = await signedInSalesperson(server.baseUrl, 'Ravi', createClient);
  priya = await signedInSalesperson(server.baseUrl, 'Priya', createClient);
  await createUser('manager', 'sales_manager');
  manager = createClient(server.baseUrl);
  await login(manager, 'manager');
  companyId = await createCompany('Sigma Motors', { createdBy: ravi.userId });
  [{ today }] = await query(`SELECT ((NOW() AT TIME ZONE 'Asia/Kolkata')::date)::text AS today`);
});

after(async () => {
  await server?.close();
});

async function addTask(client, fields) {
  const res = await client.request('POST', '/api/tasks', { company_id: companyId, title: 'Follow up', ...fields });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('tasks are scoped to the assignee and flagged overdue in India time', async () => {
  const overdue = await addTask(ravi.client, { due_date: shift(-2), title: 'Overdue call' });
  const dueToday = await addTask(ravi.client, { due_date: today, title: 'Today call' });
  await addTask(ravi.client, { due_date: shift(3), title: 'Later call' });
  await addTask(priya.client, { due_date: today, title: 'Priya call' });

  assert.equal(overdue.is_overdue, true);
  assert.equal(dueToday.is_overdue, false);

  const mine = await ravi.client.request('GET', '/api/tasks');
  assert.deepEqual(mine.body.map((t) => t.title), ['Overdue call', 'Today call', 'Later call']);
  assert.deepEqual((await ravi.client.request('GET', '/api/tasks?due=overdue')).body.map((t) => t.title), ['Overdue call']);
  assert.deepEqual((await ravi.client.request('GET', '/api/tasks?due=today')).body.map((t) => t.title), ['Today call']);
  assert.equal((await ravi.client.request('GET', `/api/tasks/${overdue.id}`)).body.title, 'Overdue call');
  assert.equal((await priya.client.request('GET', `/api/tasks/${overdue.id}`)).body.error, 'Task not found');
  assert.equal((await priya.client.request('POST', `/api/tasks/${overdue.id}/complete`, {})).status, 404);
  assert.equal((await manager.request('GET', '/api/tasks')).body.length, 4);
});

test('Today groups follow-ups and drafts, scoped per salesperson', async () => {
  const res = await ravi.client.request('GET', '/api/today');
  assert.equal(res.status, 200);
  assert.equal(res.body.today, today);
  assert.deepEqual(res.body.overdue.map((t) => t.title), ['Overdue call']);
  assert.deepEqual(res.body.due_today.map((t) => t.title), ['Today call']);
  assert.deepEqual(res.body.upcoming.map((t) => t.title), ['Later call']);
  assert.equal(res.body.stats.overdue_follow_ups, 1);

  await ravi.client.request('POST', '/api/visits', { company_id: companyId });
  const after = await ravi.client.request('GET', '/api/today');
  assert.equal(after.body.draft_visits.length, 1);
  assert.equal((await priya.client.request('GET', '/api/today')).body.draft_visits.length, 0);
  assert.equal((await manager.request('GET', '/api/today')).body.due_today.length, 2);
});

test('completing and cancelling close a task once; cancelling needs a reason', async () => {
  const task = await addTask(ravi.client, { due_date: today });
  const done = await ravi.client.request('POST', `/api/tasks/${task.id}/complete`, { outcome_notes: 'Spoke to Rao' });
  assert.equal(done.body.status, 'done');
  assert.ok(done.body.completed_at);
  assert.equal((await ravi.client.request('POST', `/api/tasks/${task.id}/complete`, {})).status, 409);
  assert.equal((await ravi.client.request('PUT', `/api/tasks/${task.id}`, { title: 'x' })).status, 409);

  const other = await addTask(ravi.client, { due_date: today });
  assert.equal((await ravi.client.request('POST', `/api/tasks/${other.id}/cancel`, {})).status, 400);
  assert.equal((await ravi.client.request('POST', `/api/tasks/${other.id}/cancel`, { reason: 'Duplicate' })).body.status, 'cancelled');
});

test('salespeople can reschedule their own tasks but only managers reassign, with an audit entry', async () => {
  const task = await addTask(ravi.client, { due_date: today, title: 'Reassign me' });
  const moved = await ravi.client.request('PUT', `/api/tasks/${task.id}`, { due_date: shift(1) });
  assert.equal(moved.body.due_date, shift(1));
  assert.equal((await ravi.client.request('PUT', `/api/tasks/${task.id}`, { assignee_salesperson_id: priya.salespersonId })).status, 403);

  const res = await manager.request('PUT', `/api/tasks/${task.id}`, { assignee_salesperson_id: priya.salespersonId });
  assert.equal(res.status, 200);
  assert.equal(res.body.assignee_salesperson_id, priya.salespersonId);
  const previousOwner = await ravi.client.request('GET', `/api/tasks/${task.id}`);
  assert.equal(previousOwner.status, 404, 'no longer visible to the previous owner');
  assert.equal(previousOwner.body.error, 'Task not found');
  assert.equal((await priya.client.request('GET', `/api/tasks/${task.id}`)).body.title, 'Reassign me');
  const [entry] = await query(`SELECT summary, before, after FROM audit_log WHERE action = 'task.reassigned' AND entity_id = $1`, [task.id]);
  assert.match(entry.summary, /from Ravi to Priya/);
  assert.equal(entry.before.assignee_salesperson_id, ravi.salespersonId);
});

test('invalid task input is rejected', async () => {
  assert.equal((await ravi.client.request('POST', '/api/tasks', { company_id: companyId, title: 'x', due_date: '15/01/2099' })).status, 400);
  assert.equal((await ravi.client.request('POST', '/api/tasks', { company_id: companyId, title: 'x', due_date: today, task_type: 'party' })).status, 400);
  assert.equal((await ravi.client.request('POST', '/api/tasks', { title: 'x', due_date: today })).status, 400);
});

test('requirements can be added later and are scoped like visits', async () => {
  const res = await ravi.client.request('POST', '/api/requirements', { company_id: companyId, description: 'Spare impellers', budget: 25000.5 });
  assert.equal(res.status, 201);
  assert.equal(res.body.budget, 25000.5);
  assert.equal((await priya.client.request('GET', `/api/requirements?company_id=${companyId}`)).body.length, 0);
  assert.equal((await manager.request('GET', `/api/requirements?company_id=${companyId}`)).body.length, 1);
  const detail = await priya.client.request('GET', `/api/companies/${companyId}`);
  assert.equal(detail.body.requirements.length, 0, 'company page hides other salespeople\'s requirements');
});

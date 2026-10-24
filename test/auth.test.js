import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, createClient } from './helpers/server.js';
import { query } from './helpers/testDb.js';

let server;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server?.close();
});

test('first-run setup, session, logout and login', async () => {
  const client = createClient(server.baseUrl);

  assert.deepEqual((await client.request('GET', '/api/auth/me')).body, { needsSetup: true });

  const setup = await client.request('POST', '/api/auth/setup', { username: 'md', password: 'correct-horse' });
  assert.equal(setup.status, 201);
  assert.equal(setup.body.user.role, 'admin');

  const me = await client.request('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'md');

  assert.equal((await client.request('POST', '/api/auth/logout')).status, 200);
  assert.equal((await client.request('GET', '/api/admin/users')).status, 401);

  assert.equal((await client.request('POST', '/api/auth/login', { username: 'md', password: 'wrong' })).status, 401);
  const login = await client.request('POST', '/api/auth/login', { username: 'md', password: 'correct-horse' });
  assert.equal(login.status, 200);
  assert.equal((await client.request('GET', '/api/admin/users')).status, 200);
});

test('a username is throttled after 5 failures, even for the correct password', async () => {
  const client = createClient(server.baseUrl);
  for (let i = 0; i < 5; i++) {
    const res = await client.request('POST', '/api/auth/login', { username: 'MD', password: `guess-${i}` });
    assert.equal(res.status, 401);
  }
  const blocked = await client.request('POST', '/api/auth/login', { username: 'md', password: 'correct-horse' });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Too many failed sign-in attempts/);

  // Another username from the same IP is still allowed (IP limit is higher).
  const other = await client.request('POST', '/api/auth/login', { username: 'someone-else', password: 'x' });
  assert.equal(other.status, 401);
});

test('failures older than the window, or before the last success, do not count', async () => {
  await query(`DELETE FROM login_attempt`);
  await query(
    `INSERT INTO login_attempt (username, ip, succeeded, at)
     SELECT 'md', '127.0.0.1', FALSE, NOW() - INTERVAL '20 minutes' FROM generate_series(1, 5)`
  );
  const client = createClient(server.baseUrl);
  assert.equal((await client.request('POST', '/api/auth/login', { username: 'md', password: 'correct-horse' })).status, 200);

  await query(`DELETE FROM login_attempt`);
  await query(
    `INSERT INTO login_attempt (username, ip, succeeded, at)
     SELECT 'md', '127.0.0.1', FALSE, NOW() - INTERVAL '5 minutes' FROM generate_series(1, 4)`
  );
  await query(`INSERT INTO login_attempt (username, ip, succeeded, at) VALUES ('md', '127.0.0.1', TRUE, NOW() - INTERVAL '1 minute')`);
  // 4 old failures were cleared by the success; one new failure leaves the user unlocked.
  assert.equal((await client.request('POST', '/api/auth/login', { username: 'md', password: 'nope' })).status, 401);
  assert.equal((await client.request('POST', '/api/auth/login', { username: 'md', password: 'correct-horse' })).status, 200);
});

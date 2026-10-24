import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.js';

let server;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server?.close();
});

afterEach(() => {
  delete process.env.CLIENT_ORIGIN;
});

async function preflight(origin) {
  return fetch(`${server.baseUrl}/api/auth/login`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
  });
}

test('foreign origins get no CORS grant by default', async () => {
  const res = await preflight('https://evil.example');
  assert.equal(res.headers.get('access-control-allow-origin'), null);

  const get = await fetch(`${server.baseUrl}/api/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('access-control-allow-origin'), null);
});

test('origins listed in CLIENT_ORIGIN are allowed with credentials', async () => {
  process.env.CLIENT_ORIGIN = 'https://erp.example.com, https://staging.example.com';
  const res = await preflight('https://staging.example.com');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://staging.example.com');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');

  const denied = await preflight('https://evil.example');
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

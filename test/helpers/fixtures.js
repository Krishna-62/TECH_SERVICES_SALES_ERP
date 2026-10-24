// Direct-to-database fixtures, so tests can set up users and salespeople without going through
// the API under test.
import { hashPassword } from '../../api/auth/password.js';
import { query } from './testDb.js';

export const PASSWORD = 'test-password';

export async function createSalesperson(name, { active = true } = {}) {
  const [row] = await query(
    `INSERT INTO salesperson (employee_code, name, is_active) VALUES ($1, $2, $3) RETURNING id`,
    [`EMP-${name}`, name, active]
  );
  return row.id;
}

export async function createUser(username, role, { salespersonId = null, managerUserId = null } = {}) {
  const { salt, hash } = hashPassword(PASSWORD);
  const [row] = await query(
    `INSERT INTO app_user (username, password_hash, password_salt, role, salesperson_id, manager_user_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [username, hash, salt, role, salespersonId, managerUserId]
  );
  return row.id;
}

export async function login(client, username, password = PASSWORD) {
  const res = await client.request('POST', '/api/auth/login', { username, password });
  if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.user;
}

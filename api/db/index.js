import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { sslConfig } from './ssl.js';

const { Pool } = pg;

// node-postgres parses DATE columns into JS Date objects by default, which would serialize
// as full ISO datetimes ('2026-08-12T00:00:00.000Z') instead of the plain 'YYYY-MM-DD' strings
// the frontend expects (table display, <input type="date">). Keep DATE columns as raw strings.
pg.types.setTypeParser(1082, (val) => val);

// NUMERIC (quantities, money) arrives as a string; the amounts here fit a JS number exactly.
pg.types.setTypeParser(1700, (val) => Number(val));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and point it at this app's own Postgres database.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(process.env.DATABASE_URL),
});

// pg-pool emits 'error' on the Pool itself when an *idle* pooled connection dies (DB restarted,
// network drop) — independently of any in-flight request/query. Node treats an EventEmitter
// 'error' with no listener as an unhandled exception, which crashes the entire process (reproduced
// locally: stopping the DB while the pool had an idle connection open killed the whole server,
// including in-flight requests unrelated to auth). Listening here lets pg-pool silently discard
// the broken client and open a fresh one on next use — no behavior change for any request.
pool.on('error', (err) => {
  console.error('Postgres pool error (idle client):', err.message);
});

// Holds the active transaction client, if any, so nested helpers (e.g. numbering.js) that call
// db.prepare(...) directly automatically participate in the surrounding transaction without
// needing a `tx` parameter threaded through every function call.
const als = new AsyncLocalStorage();

function executor() {
  return als.getStore() || pool;
}

// Queries are written with `?` placeholders (shorter, and matching the Technicon Services ERP's
// style); pg needs `$1, $2, ...`. Never put a literal `?` inside SQL text passed to prepare().
function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function prepare(sql) {
  const pgSql = toPgSql(sql);
  async function exec(params) {
    return executor().query(pgSql, params);
  }
  return {
    async get(...params) {
      const result = await exec(params);
      return result.rows[0];
    },
    async all(...params) {
      const result = await exec(params);
      return result.rows;
    },
    async run(...params) {
      const result = await exec(params);
      return {
        changes: result.rowCount,
        // Populated automatically when the query's SQL includes RETURNING id.
        lastInsertRowid: result.rows[0]?.id,
      };
    },
  };
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await als.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const db = { prepare, transaction, pool };
export default db;

import fs from 'node:fs';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalDatabaseUrl(url) {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

// TLS settings for a connection string. Local databases use no TLS; anything else must present a
// certificate that verifies. Supabase signs with its own CA, so set DATABASE_SSL_CA_FILE to the
// CA certificate downloaded from the Supabase dashboard (Project Settings → Database).
export function sslConfig(url) {
  if (isLocalDatabaseUrl(url)) return false;
  const caFile = process.env.DATABASE_SSL_CA_FILE;
  return caFile ? { ca: fs.readFileSync(caFile, 'utf-8'), rejectUnauthorized: true } : { rejectUnauthorized: true };
}

import { createClient, type Client } from '@libsql/client';
import { config } from '../config.js';

/**
 * A single shared libSQL connection, used by {@link JsonStore} when a Turso
 * database URL is configured. On a host with an ephemeral filesystem
 * (Render, Koyeb, …) this is where session data actually lives.
 *
 * When `TURSO_DATABASE_URL` is not set this module is never touched and the
 * store falls back to a plain JSON file (local development).
 */

let client: Client | null = null;
let ready: Promise<void> | null = null;

export function libsqlEnabled(): boolean {
  return config.tursoUrl !== '';
}

export function getLibsql(): Client {
  if (!client) {
    if (!config.tursoUrl) throw new Error('libSQL requested but TURSO_DATABASE_URL is not set.');
    client = createClient({
      url: config.tursoUrl,
      authToken: config.tursoAuthToken || undefined,
    });
  }
  return client;
}

/** Create the single key/value table once. Safe to call repeatedly. */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = getLibsql()
      .execute(
        `CREATE TABLE IF NOT EXISTS kv (
           key TEXT PRIMARY KEY,
           value TEXT NOT NULL,
           updated_at INTEGER NOT NULL
         )`,
      )
      .then(() => undefined);
  }
  return ready;
}

export async function kvGet(key: string): Promise<string | null> {
  await ensureSchema();
  const res = await getLibsql().execute({
    sql: 'SELECT value FROM kv WHERE key = ?',
    args: [key],
  });
  const row = res.rows[0];
  return row ? String(row.value) : null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await ensureSchema();
  await getLibsql().execute({
    sql: `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, Date.now()],
  });
}

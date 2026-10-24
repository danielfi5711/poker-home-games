import { config } from './config.js';
import { initAccounts } from './lib/accounts.js';
import { closeEmptyTables, initSessions } from './lib/sessions.js';
import { initPush } from './lib/push.js';
import { initAvatars } from './lib/avatars.js';
import { libsqlEnabled } from './lib/libsql.js';
import { JsonStore } from './lib/store.js';
import { startWebServer } from './web/server.js';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !libsqlEnabled()) {
    // Render's filesystem is wiped on every deploy/restart: without Turso every
    // account, login and game silently disappears ("wrong password", logged out).
    console.error('!!! TURSO_DATABASE_URL is not set — all data will be LOST on the next deploy or restart. !!!');
  }
  await initAccounts();
  await initSessions();
  setInterval(closeEmptyTables, 60_000);
  await initPush();
  await initAvatars();
  startWebServer();
  console.log(`Storage: ${libsqlEnabled() ? 'turso' : `local files (${config.dataFile})`}`);
}

// Render sends SIGTERM before stopping the old instance on a deploy — write out
// anything still sitting in the debounce window first.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    JsonStore.flushAll()
      .catch((err) => console.error('Flush on shutdown failed:', err))
      .finally(() => process.exit(0));
  });
}

void main();

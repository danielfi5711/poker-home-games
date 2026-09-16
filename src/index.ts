import { initAccounts } from './lib/accounts.js';
import { initGroups } from './lib/groups.js';
import { initSessions } from './lib/sessions.js';
import { startWebServer } from './web/server.js';

async function main(): Promise<void> {
  await initAccounts();
  await initGroups();
  await initSessions();
  startWebServer();
}

void main();

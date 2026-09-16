import { initSessions } from './lib/sessions.js';
import { startWebServer } from './web/server.js';

async function main(): Promise<void> {
  await initSessions();
  startWebServer();
}

void main();

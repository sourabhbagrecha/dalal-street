import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createExpressApp } from './app.js';
import { getPort } from './config.js';
import { log } from './logger.js';
import { hydrateRooms, startRegistryGc } from './registry.js';

// The real server always persists to disk; tests and embedders (which import app.ts
// directly) keep the default in-memory store. Must be set before db.ts first opens.
process.env.MD_DB_PATH ??= resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../data/monopoly-deal.sqlite',
);

const app = createExpressApp();
const port = getPort();

hydrateRooms();
startRegistryGc();

const server = createServer(app);
server.listen(port, () => {
  log('info', 'server_listening', { port });
});

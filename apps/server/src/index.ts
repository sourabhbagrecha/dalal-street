import { createServer } from 'node:http';
import { createExpressApp } from './app.js';
import { getPort } from './config.js';
import { log } from './logger.js';
import { startRegistryGc } from './registry.js';

const app = createExpressApp();
const port = getPort();

startRegistryGc();

const server = createServer(app);
server.listen(port, () => {
  log('info', 'server_listening', { port });
});

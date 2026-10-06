// Dev servers behind portless, named by git branch (HTTP, no port numbers):
//   client  http://lagaan-<branch>.localhost
//   server  http://lagaan-<branch>-server.localhost
// Opt-in; plain `pnpm dev` (5173 / 8787) is unchanged. Needs `npm i -g portless`
// and a proxy on port 80: `portless proxy start --no-tls` (one-time, sudo).
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { basename } from 'node:path';

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const branch = git('branch', '--show-current') || git('rev-parse', '--short', 'HEAD');
const slug = (slugify(branch) || slugify(basename(process.cwd()))).slice(0, 40).replace(/-+$/, '');
const webName = `lagaan-${slug}`;
const serverName = `${webName}-server`;

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

const serverPort = await freePort();
const webUrl = `http://${webName}.localhost`;
const env = { ...process.env, PORTLESS_HTTPS: '0' };

const run = (name, extraEnv, args) =>
  spawn('portless', [name, ...args], {
    stdio: 'inherit',
    env: { ...env, ...extraEnv },
  });

const children = [
  run(serverName, { ORIGIN_ALLOWLIST: webUrl }, [
    '--app-port',
    String(serverPort),
    'pnpm',
    '--dir',
    'apps/server',
    'exec',
    'tsx',
    'watch',
    'src/index.ts',
  ]),
  run(webName, { SERVER_PORT: String(serverPort) }, ['pnpm', '--dir', 'apps/web', 'exec', 'vite', '--host']),
];

console.log(`\n  client  ${webUrl}\n  server  http://${serverName}.localhost\n`);

const stop = () => children.forEach((c) => c.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
let remaining = children.length;
for (const c of children) {
  c.on('exit', (code) => {
    stop();
    if (--remaining === 0) process.exit(code ?? 0);
  });
}

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

const SKIP = /(^|\/)(sw\.js|\.DS_Store)$|\.map$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** After the build, emit dist/sw.js: pwa/sw.js with the precache list (every
 *  built file) and a content-derived version baked in, so the worker's bytes
 *  change - and browsers update it - exactly when the shipped files do. */
export function swPlugin(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'md-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
      root = config.root;
    },
    writeBundle() {
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => !SKIP.test(f))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const urls = ['/', ...files.map((f) => `/${f}`)];
      const template = readFileSync(join(root, 'pwa/sw.js'), 'utf8');
      const out = template
        .replace('__SW_VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__SW_PRECACHE__', JSON.stringify(urls));
      writeFileSync(join(outDir, 'sw.js'), out);
    },
  };
}

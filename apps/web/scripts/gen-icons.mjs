/**
 * Regenerates every raster app icon from the single vector source,
 * `apps/web/public/icon.svg`. Edit that file, re-run this, commit the PNGs.
 *
 *   pnpm --filter @monopoly-deal/web icons
 *
 * Rasterisation uses macOS `qlmanage` + `sips`, so this is a macOS-only
 * authoring step. The generated PNGs are committed, so building and deploying
 * the app never needs it.
 *
 * `icon-maskable.svg` is derived here rather than hand-maintained: it is
 * `icon.svg` with the tile corners squared off, so Android's adaptive-icon
 * mask and iOS's squircle cut their own shape instead of clipping ours twice.
 * The mark is a centred silhouette with generous margin, so no extra inset is
 * needed to clear the safe zone.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const source = readFileSync(join(publicDir, 'icon.svg'), 'utf8');
const maskable = source.replace('rx="200" ry="200"', 'rx="0" ry="0"');
if (maskable === source) {
  throw new Error('icon.svg no longer has the rounded tile this script squares off');
}
writeFileSync(join(publicDir, 'icon-maskable.svg'), maskable);

const work = mkdtempSync(join(tmpdir(), 'md-icons-'));
try {
  /** Renders one of the SVGs to a 1024px master PNG and returns its path. */
  const render = (name) => {
    execFileSync('qlmanage', ['-t', '-s', '1024', '-o', work, join(publicDir, `${name}.svg`)], {
      stdio: 'ignore',
    });
    return join(work, `${name}.svg.png`);
  };

  const masters = { any: render('icon'), maskable: render('icon-maskable') };

  const outputs = [
    ['favicon-16.png', 16, 'any'],
    ['favicon-32.png', 32, 'any'],
    ['favicon-48.png', 48, 'any'],
    ['icon-192.png', 192, 'any'],
    ['icon-512.png', 512, 'any'],
    ['icon-maskable-192.png', 192, 'maskable'],
    ['icon-maskable-512.png', 512, 'maskable'],
    // iOS ignores transparency and applies its own squircle, so the home-screen
    // icon comes from the squared-off variant.
    ['apple-touch-icon.png', 180, 'maskable'],
  ];

  for (const [file, size, variant] of outputs) {
    execFileSync('sips', [
      '-s', 'format', 'png',
      '-z', String(size), String(size),
      masters[variant],
      '--out', join(publicDir, file),
    ], { stdio: 'ignore' });
    console.log(`${file}\t${size}x${size}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

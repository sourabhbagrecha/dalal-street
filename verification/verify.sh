#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> typecheck"
pnpm -r run typecheck

echo "==> lint"
pnpm -r run lint

echo "==> css audit"
pnpm --filter @monopoly-deal/web css-audit

echo "==> engine vitest"
pnpm --filter @monopoly-deal/engine test

echo "==> web vitest"
pnpm --filter @monopoly-deal/web test

echo "==> redaction tests"
pnpm --filter @monopoly-deal/verification exec vitest run -c vitest.config.ts redaction.test.ts

echo "==> server integration"
pnpm --filter @monopoly-deal/server test

# Seeds are fixed, so an unchanged engine replays the same games every run:
# a local smoke of 5 is enough, CI plays the full 500.
SIM_GAMES=5
if [ -n "${CI:-}" ]; then SIM_GAMES=500; fi
echo "==> simulate ${SIM_GAMES} games"
pnpm --filter @monopoly-deal/verification exec tsx simulate.ts "$SIM_GAMES" 1

echo "==> netSim 100 games"
pnpm --filter @monopoly-deal/verification exec tsx netSim.ts 100 1

echo "==> knip"
pnpm knip

echo "==> verify.sh OK"

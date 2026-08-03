#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> typecheck"
pnpm -r run typecheck

echo "==> lint"
pnpm -r run lint

echo "==> vitest"
pnpm --filter @monopoly-deal/engine test

echo "==> simulate 500 games"
pnpm --filter @monopoly-deal/verification exec tsx simulate.ts 500 1

echo "==> verify.sh OK"

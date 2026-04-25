#!/usr/bin/env bash
set -euo pipefail

# Pre-commit hook for czap.
# Auto-installed via `prepare` script in package.json on `pnpm install`.
# Manual install: ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit

echo "[pre-commit] Running quick verification..."
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm exec tsx scripts/check-invariants.ts
echo "[pre-commit] All checks passed."

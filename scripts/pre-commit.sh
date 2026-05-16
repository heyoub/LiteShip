#!/usr/bin/env bash
set -euo pipefail

# Pre-commit hook for czap.
# Auto-installed via `prepare` script in package.json on `pnpm install`.
# Manual install: ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit
#
# Emergency escape hatch:
#   SKIP_PRECOMMIT=1 git commit -m "wip"
# Prefer fixing the failure to skipping; reserve for genuine emergencies
# (e.g. broken upstream tooling that's not your code).

if [ "${SKIP_PRECOMMIT:-0}" = "1" ]; then
  echo "[pre-commit] SKIPPED (SKIP_PRECOMMIT=1). Re-run the gates locally before pushing."
  exit 0
fi

echo "[pre-commit] Running quick verification..."
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm exec tsx scripts/check-invariants.ts
echo "[pre-commit] All checks passed."

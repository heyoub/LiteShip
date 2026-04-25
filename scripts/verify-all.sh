#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# czap verification harness
#
# Runs all quality gates in dependency order. Exit code 0 = all green.
# Optimized for TypeScript: install → build → test → typecheck
#
# Usage:
#   ./scripts/verify-all.sh          # full suite
#   ./scripts/verify-all.sh --quick  # build + typecheck only (pre-commit)
# ============================================================================

cd "$(dirname "$0")/.."

QUICK=false
if [ "${1:-}" = "--quick" ]; then
  QUICK=true
fi

echo "=== czap verification ==="
echo ""

# ── Gate 1: install ──────────────────────────────────────────────────
echo "--- Gate 1: pnpm install ---"
pnpm install --frozen-lockfile 2>&1 | tail -3
echo "    PASS"
echo ""

# ── Gate 2: build ────────────────────────────────────────────────────
echo "--- Gate 2: pnpm run build ---"
pnpm run build 2>&1
echo "    PASS"
echo ""

if [ "$QUICK" = true ]; then
  # ── Quick: typecheck only ──────────────────────────────────────────
  echo "--- Gate 3: pnpm run typecheck ---"
  pnpm run typecheck 2>&1
  echo "    PASS"
  echo ""
  echo "=== QUICK GATES PASSED (install + build + typecheck) ==="
  exit 0
fi

# ── Gate 3: tests ────────────────────────────────────────────────────
echo "--- Gate 3: pnpm test ---"
pnpm test 2>&1
echo "    PASS"
echo ""

# ── Gate 4: typecheck ────────────────────────────────────────────────
echo "--- Gate 4: pnpm run typecheck ---"
pnpm run typecheck 2>&1
echo "    PASS"
echo ""

# ── Gate 5: invariant checks ──────────────────────────────────────
echo "--- Gate 5: invariant checks ---"
pnpm exec tsx scripts/check-invariants.ts 2>&1
echo "    PASS"
echo ""

# ── Gate 6: lint ──────────────────────────────────────────────────
echo "--- Gate 6: lint ---"
pnpm run lint 2>&1
echo "    PASS"
echo ""

# ── Gate 7: format check ─────────────────────────────────────────
echo "--- Gate 7: format check ---"
pnpm run format:check 2>&1
echo "    PASS"
echo ""

# ── Gate 8: integration tests ─────────────────────────────────────
echo "--- Gate 8: integration tests (astro) ---"
pnpm run test:astro 2>&1
echo "    PASS"
echo ""

echo "--- Gate 8: integration tests (vite) ---"
pnpm run test:vite 2>&1
echo "    PASS"
echo ""

echo "--- Gate 8: integration tests (tailwind) ---"
pnpm run test:tailwind 2>&1
echo "    PASS"
echo ""

# ── Gate 9: e2e tests (requires Playwright + Chromium) ────────────
if command -v playwright &>/dev/null || pnpm exec playwright --version &>/dev/null 2>&1; then
  echo "--- Gate 9: e2e tests (Playwright) ---"
  pnpm run test:e2e 2>&1
  echo "    PASS"
  echo ""
else
  echo "--- Gate 9: e2e tests (SKIPPED -- Playwright not installed) ---"
  echo "    Run: pnpm exec playwright install --with-deps chromium"
  echo ""
fi

echo "=== ALL GATES PASSED ==="

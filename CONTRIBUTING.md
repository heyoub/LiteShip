# Contributing to czap

## Setup

1. Clone the repo and install dependencies:

   ```bash
   git clone <repo-url>
   cd czap
   pnpm install
   ```

2. Build all packages:

   ```bash
   pnpm run build
   ```

3. Run tests:
   ```bash
   pnpm test
   ```

## Development Workflow

- All packages are in `packages/` and built via `tsc --build`
- Tests use vitest and live in `tests/unit/`, `tests/integration/`
- Run a single test file: `pnpm test -- tests/unit/<file>.test.ts`

## Code Style

- TypeScript strict mode, ESM only
- Named exports only (no default exports)
- Namespace Object Pattern for public APIs
- Property-based testing with fast-check where appropriate

## Before Submitting

Run the full verification suite:

```bash
./scripts/verify-all.sh
```

This runs: install, build, test, typecheck, and invariant checks.

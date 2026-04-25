import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import tsdoc from 'eslint-plugin-tsdoc';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.d.ts'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
      // Namespace object pattern is the canonical API convention (see CLAUDE.md).
      // Every module uses: export const X = {...}; export declare namespace X { type Shape = ...; }
      '@typescript-eslint/no-namespace': 'off',
      'no-console': 'warn',
    },
  },
  // TSDoc enforcement: configured but initially disabled. Enabled per-package
  // during backfill (Tasks 27-36); flipped to error in Task 37.
  {
    files: ['packages/*/src/**/*.ts'],
    plugins: { jsdoc, tsdoc },
    rules: {
      'tsdoc/syntax': 'off',
      'jsdoc/require-jsdoc': 'off',
    },
  },
  // Per-package TSDoc enforcement (enabled as each package completes backfill).
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'tsdoc/syntax': 'error',
      'jsdoc/require-jsdoc': ['error', {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          ClassDeclaration: true,
          MethodDefinition: false,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
        contexts: [
          'TSInterfaceDeclaration',
          'TSTypeAliasDeclaration',
          'ExportNamedDeclaration > VariableDeclaration',
        ],
      }],
    },
  },
  {
    files: [
      'packages/quantizer/src/**/*.ts',
      'packages/compiler/src/**/*.ts',
      'packages/detect/src/**/*.ts',
      'packages/edge/src/**/*.ts',
    ],
    rules: {
      'tsdoc/syntax': 'error',
      'jsdoc/require-jsdoc': ['error', {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          ClassDeclaration: true,
          MethodDefinition: false,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
        contexts: [
          'TSInterfaceDeclaration',
          'TSTypeAliasDeclaration',
          'ExportNamedDeclaration > VariableDeclaration',
        ],
      }],
    },
  },
  {
    files: [
      'packages/web/src/**/*.ts',
      'packages/worker/src/**/*.ts',
      'packages/vite/src/**/*.ts',
      'packages/astro/src/**/*.ts',
      'packages/remotion/src/**/*.ts',
    ],
    rules: {
      'tsdoc/syntax': 'error',
      'jsdoc/require-jsdoc': ['error', {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          ClassDeclaration: true,
          MethodDefinition: false,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
        contexts: [
          'TSInterfaceDeclaration',
          'TSTypeAliasDeclaration',
          'ExportNamedDeclaration > VariableDeclaration',
        ],
      }],
    },
  },
  // Suppress TSDoc rules entirely for test + script files (not public API).
  {
    files: ['packages/*/src/**/*.test.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    plugins: { jsdoc, tsdoc },
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'tsdoc/syntax': 'off',
    },
  },
  // Relax rules that don't make sense for tests + scripts:
  //   - no-console: scripts are CLI entry points; tests log diagnostics.
  //   - no-explicit-any: tests bridge mocks/stubs through `as any`.
  //   - no-unused-vars: tests sometimes destructure tuples to assert shapes.
  // These match the existing TSDoc-relaxation pattern above.
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  // Sanctioned cast-containment sites.
  //
  // Each of these files contains at least one of the project's canonical
  // brand-factory or structural-containment helpers. `value as Brand` /
  // `as unknown` / `as <MappedType>` is the only way to construct or bridge
  // the value at that specific point; all other code routes through these
  // factories rather than inline-casting at the call site.
  //
  // Each site has a JSDoc rationale comment inside the file. Adding a file
  // here requires a corresponding documented helper — do not sanction a file
  // that merely contains undocumented casts.
  {
    files: [
      // Brand factories
      'packages/core/src/brands.ts',
      'packages/core/src/ecs.ts',
      'packages/web/src/types.ts',

      // Tuple + generic-preservation helpers
      'packages/core/src/tuple.ts',
      'packages/core/src/cell.ts',
      'packages/core/src/boundary.ts',
      'packages/core/src/composable.ts',
      'packages/core/src/blend.ts',
      'packages/core/src/interpolate.ts',
      'packages/core/src/op.ts',

      // Compositor / quantizer state bridges
      'packages/core/src/compositor.ts',
      'packages/core/src/compositor-pool.ts',
      'packages/quantizer/src/quantizer.ts',
      'packages/quantizer/src/evaluate.ts',

      // FFI / hash primitives
      'packages/core/src/typed-ref.ts',
      'packages/core/src/wasm-dispatch.ts',

      // Environment / runtime introspection helpers
      'packages/core/src/diagnostics.ts',
      'packages/worker/src/compositor-startup.ts',
      'packages/detect/src/detect.ts',
      'packages/detect/src/tiers.ts',

      // DOM / network guard helpers
      'packages/web/src/slot/registry.ts',
      'packages/web/src/morph/hints.ts',
      'packages/web/src/stream/sse-pure.ts',
      'packages/edge/src/client-hints.ts',

      // Astro runtime + integration boundaries
      'packages/astro/src/integration.ts',
      'packages/astro/src/runtime/boundary.ts',
      'packages/astro/src/runtime/slots.ts',

      // Vite filesystem / dynamic-import boundaries
      'packages/vite/src/resolve-fs.ts',
      'packages/vite/src/resolve-utils.ts',
      'packages/vite/src/virtual-modules.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Bans raw node:child_process imports outside the canonical spawn helper.
  // All subprocess work goes through scripts/lib/spawn.ts so coverage
  // capture (NODE_V8_COVERAGE inheritance) can never be silently broken
  // by an env override.
  //
  // The ignores list has three flavors of legitimate raw-spawn callers:
  //   1. The canonical helper itself + its thin re-export wrappers.
  //   2. Sync-spawn CI/CLI scripts (execFileSync / spawnSync / execSync).
  //      The async helper isn't applicable; these don't run code under
  //      test so coverage inheritance is moot.
  //   3. Specialized async-spawn callers that need raw stdio piping or
  //      shell semantics that the helper deliberately doesn't expose.
  //   4. Test files scheduled for deletion under this same plan.
  {
    files: ['packages/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    ignores: [
      // (1) Canonical helper + thin re-exports.
      'scripts/lib/spawn.ts',
      'scripts/support/pnpm-process.ts',
      'scripts/gauntlet.ts', // reason: gauntlet phase orchestration (predates this work, has its own drift guards)
      // (2) Sync-spawn CI/script callers — execFileSync / spawnSync / execSync.
      'scripts/audit/shared.ts', // reason: execFileSync('git', ['ls-files']) — sync, no code under test
      'scripts/capsule-verify.ts', // reason: execSync('pnpm exec vitest run tests/generated/') — CI script
      'scripts/check-invariants.ts', // reason: execFileSync('git', ['ls-files', '--eol']) — sync
      'scripts/docs-check.ts', // reason: spawnSync for typedoc + git diff — sync CI gate
      'scripts/flex-verify.ts', // reason: spawnSync with shell:true for arbitrary verifier commands
      'scripts/package-smoke.ts', // reason: execFileSync — sync packaging smoke test
      // (3) Specialized async-spawn callers needing raw stdio / shell.
      'packages/assets/src/decoders/video.ts', // reason: spawnSync('ffprobe') — sync decoder API surface
      'packages/cli/src/render-backend/ffmpeg.ts', // reason: spawn('ffmpeg') with raw stdin pipe for frame streaming
      'packages/cli/src/commands/gauntlet.ts', // reason: spawnSync('pnpm run gauntlet:full', { shell: true }) — needs shell
      // (3) Sync ffmpeg/ffprobe probes in smoke tests.
      'tests/smoke/intro-render.test.ts', // reason: spawnSync for ffmpeg/ffprobe binary availability probes
      // (4) Spike file scheduled for deletion in Task 21 of subprocess-coverage plan.
      'tests/scratch/spike-subprocess-coverage.test.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'node:child_process',
            message: 'Import from scripts/lib/spawn.ts (spawnArgv / withSpawned). The canonical helper preserves NODE_V8_COVERAGE inheritance for subprocess coverage capture.',
          },
          {
            name: 'child_process',
            message: 'Import from scripts/lib/spawn.ts (spawnArgv / withSpawned). The canonical helper preserves NODE_V8_COVERAGE inheritance for subprocess coverage capture.',
          },
        ],
      }],
    },
  },
);

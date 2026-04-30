import { resolve } from 'node:path';
import type { AuditFileClass, FullAuditSectionId } from './types.js';
import type { AuditFinding } from './types.js';

export interface AuditAllowlistEntry {
  readonly rule: string;
  readonly filePrefix?: string;
  readonly summaryIncludes?: string;
  readonly reason: string;
}

export interface PackagePolicy {
  readonly allowedInternalImports: readonly string[];
  readonly kind: 'core' | 'layered' | 'host-adjacent' | 'standalone';
}

export const auditSourceGlobs = ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'] as const;

export const hicpSectionOrder = [
  '@czap/core',
  '@czap/quantizer',
  '@czap/compiler',
  '@czap/detect',
  '@czap/web',
  '@czap/edge',
  '@czap/worker',
  '@czap/vite',
  '@czap/astro',
  '@czap/remotion',
  'czap-compute',
  'packages/_spine',
  'tests',
  'scripts',
  'docs',
  'examples',
  'repo/system/devops',
] as const satisfies readonly FullAuditSectionId[];

export const hicpInventoryExcludePatterns = [
  /^coverage\//,
  /^reports\//,
  /^benchmarks\//,
  /^test-results\//,
  /^\.vitest-attachments\//,
  /^packages\/[^/]+\/dist\//,
  /^packages\/[^/]+\/node_modules\//,
  /^tests\/e2e\/fixtures\//,
  /^tests\/browser\/__screenshots__\//,
  /\.map$/,
  /\.tsbuildinfo$/,
] as const;

export const hicpInventoryIncludePatterns = [
  /\.(ts|tsx|js|mjs|cjs|json|ya?ml|md|toml|sh|css|html|astro|rs)$/,
  /\.d\.ts$/,
] as const;

export const hicpInventorySpecialFiles = [
  /(^|\/)(package\.json|tsconfig\.json|Cargo\.toml|README\.md|LICENSE|AGENTS\.md|CLAUDE\.md|CONTRIBUTING\.md|PLAN\.md|pnpm-workspace\.yaml|pnpm-lock\.yaml|vite\.config\.ts|vitest(\.browser)?\.config\.ts|vitest\.shared\.ts|eslint\.config\.js|\.prettierrc|\.editorconfig|\.gitignore|\.npmrc|\.nvmrc|[^/]+\.code-workspace)$/,
  /^\.github\/workflows\/.+\.yml$/,
] as const;

export const hicpNamedOffenseRules: Record<string, string> = {
  'missing-manifest-dependency': 'Phantom Dependency',
  'unresolved-internal-import': 'Phantom Dependency',
  'orphan-export-candidate': 'Island Syndrome',
  'stub-marker': 'Polite Downgrade',
  'missing-runtime-capability': 'Polite Downgrade',
  'fallback-laundering': 'Fallback Laundering',
  'placeholder-content': 'Rogue Silence',
  'suspicious-reimplementation': 'Confident Reimplementation',
} as const;

export const hicpFileClassWeights: Record<AuditFileClass, readonly { family: string; weight: number }[]> = {
  'runtime/library source': [
    { family: 'Laws + forbidden remedies', weight: 30 },
    { family: 'Architecture/wiring', weight: 20 },
    { family: 'Failure honesty', weight: 15 },
    { family: 'Surface/traceability', weight: 15 },
    { family: 'Semantic fidelity', weight: 10 },
    { family: 'Self-accusation/observability', weight: 10 },
  ],
  'package/crate meta': [
    { family: 'Dependency control', weight: 25 },
    { family: 'Surface/export fidelity', weight: 20 },
    { family: 'Determinism/tooling', weight: 20 },
    { family: 'Traceability/docs alignment', weight: 20 },
    { family: 'Security/supply chain', weight: 15 },
  ],
  'tests/benchmarks': [
    { family: 'Production coupling', weight: 30 },
    { family: 'Assertion strength', weight: 25 },
    { family: 'Edge/error/concurrency coverage', weight: 20 },
    { family: 'Determinism/fixtures', weight: 15 },
    { family: 'Investigation value', weight: 10 },
  ],
  'scripts/audit tooling': [
    { family: 'Deterministic automation', weight: 25 },
    { family: 'Detectors/gates', weight: 25 },
    { family: 'Thin orchestration', weight: 20 },
    { family: 'Security hygiene', weight: 15 },
    { family: 'Traceability/reporting', weight: 15 },
  ],
  'docs/specs': [
    { family: 'Freeze/semantic contract quality', weight: 35 },
    { family: 'Artifact alignment', weight: 25 },
    { family: 'Traceability/decision capture', weight: 20 },
    { family: 'Operational usefulness', weight: 20 },
  ],
  'examples/integration': [
    { family: 'Honest API usage', weight: 30 },
    { family: 'Wiring realism', weight: 25 },
    { family: 'Downgrade resistance', weight: 20 },
    { family: 'Deterministic setup', weight: 15 },
    { family: 'Teaching/diagnostic value', weight: 10 },
  ],
  'repo/system/devops': [
    { family: 'Hermetic workspace/toolchain', weight: 25 },
    { family: 'CI gate completeness', weight: 25 },
    { family: 'Supply chain/security', weight: 20 },
    { family: 'Architecture conformance', weight: 15 },
    { family: 'Contributor/decision guidance', weight: 15 },
  ],
} as const;

export const auditIgnoreGlobs = [
  '**/dist/**',
  '**/node_modules/**',
  '**/*.d.ts',
  'coverage/**',
  'reports/**',
  'docs/**',
  'examples/**',
  'benchmarks/**',
  'tests/e2e/fixtures/**',
] as const;

export const reportPaths = {
  json: 'reports/codebase-audit.json',
  markdown: 'reports/codebase-audit.md',
  fullTreeJson: 'reports/full-tree-accounting.json',
  fullTreeMarkdown: 'reports/full-tree-accounting.md',
  protocolGapJson: 'reports/protocol-gap-report.json',
  protocolGapMarkdown: 'reports/protocol-gap-report.md',
  frameworkDeltaJson: 'reports/framework-blueprint-delta.json',
  frameworkDeltaMarkdown: 'reports/framework-blueprint-delta.md',
  strikeBoardJson: 'reports/audit-strike-board.json',
  strikeBoardMarkdown: 'reports/audit-strike-board.md',
} as const;

export const hicpSectionTitles: Record<FullAuditSectionId, string> = {
  '@czap/core': '@czap/core',
  '@czap/quantizer': '@czap/quantizer',
  '@czap/compiler': '@czap/compiler',
  '@czap/detect': '@czap/detect',
  '@czap/web': '@czap/web',
  '@czap/edge': '@czap/edge',
  '@czap/worker': '@czap/worker',
  '@czap/vite': '@czap/vite',
  '@czap/astro': '@czap/astro',
  '@czap/remotion': '@czap/remotion',
  'czap-compute': 'czap-compute',
  'packages/_spine': 'packages/_spine',
  tests: 'tests',
  scripts: 'scripts',
  docs: 'docs',
  examples: 'examples',
  'repo/system/devops': 'repo/system/devops',
};

export const packageTopology: Record<string, PackagePolicy> = {
  '@czap/core': {
    // @czap/_spine is the canonical type-only spine that core re-anchors
    // its public types from (see packages/core/src/brands.ts and
    // capsule.ts). It compiles to .d.ts only and sits above core in the
    // dependency direction, so this is not a layering violation — it's the
    // intended source of truth for shared brand and content-address types.
    allowedInternalImports: ['@czap/_spine'],
    kind: 'core',
  },
  '@czap/quantizer': {
    allowedInternalImports: ['@czap/core'],
    kind: 'layered',
  },
  '@czap/compiler': {
    allowedInternalImports: ['@czap/core', '@czap/quantizer'],
    kind: 'layered',
  },
  '@czap/web': {
    allowedInternalImports: ['@czap/core', '@czap/quantizer', '@czap/compiler'],
    kind: 'layered',
  },
  '@czap/detect': {
    allowedInternalImports: ['@czap/core'],
    kind: 'layered',
  },
  '@czap/edge': {
    allowedInternalImports: ['@czap/core', '@czap/detect'],
    kind: 'host-adjacent',
  },
  '@czap/worker': {
    allowedInternalImports: ['@czap/core'],
    kind: 'host-adjacent',
  },
  '@czap/vite': {
    allowedInternalImports: ['@czap/core', '@czap/quantizer', '@czap/compiler'],
    kind: 'host-adjacent',
  },
  '@czap/astro': {
    allowedInternalImports: ['@czap/core', '@czap/compiler', '@czap/vite', '@czap/detect', '@czap/edge', '@czap/web', '@czap/worker'],
    kind: 'host-adjacent',
  },
  '@czap/remotion': {
    allowedInternalImports: ['@czap/core'],
    kind: 'standalone',
  },
};

export const surfacePolicy = {
  astroPackage: '@czap/astro',
  astroClientDirectives: ['satellite', 'stream', 'llm', 'worker', 'gpu', 'wasm'] as const,
  astroRuntimeFiles: [
    'packages/astro/src/runtime/satellite.ts',
    'packages/astro/src/runtime/stream.ts',
    'packages/astro/src/runtime/llm.ts',
    'packages/astro/src/runtime/worker.ts',
    'packages/astro/src/runtime/gpu.ts',
    'packages/astro/src/runtime/wasm.ts',
    'packages/astro/src/runtime/boundary.ts',
    'packages/astro/src/runtime/slots.ts',
  ] as const,
  viteVirtualModules: [
    'virtual:czap/tokens',
    'virtual:czap/tokens.css',
    'virtual:czap/boundaries',
    'virtual:czap/themes',
    'virtual:czap/hmr-client',
    'virtual:czap/wasm-url',
  ] as const,
  knownCapabilityNotes: [
    {
      file: 'packages/astro/src/runtime/gpu.ts',
      summary: 'GPU directive currently exposes WebGL2 runtime with an explicit WebGPU/WGSL partial-capability warning path.',
    },
    {
      file: 'packages/vite/src/virtual-modules.ts',
      summary: 'Virtual modules intentionally ship placeholder stubs that are populated by the Vite transform pipeline.',
    },
  ] as const,
};

export const auditAllowlist: readonly AuditAllowlistEntry[] = [
  {
    rule: 'default-export',
    filePrefix: 'packages/astro/src/client-directives/satellite.ts',
    reason: 'Astro client directives require default exports and this file is an intentionally tiny wrapper.',
  },
  {
    rule: 'default-export',
    filePrefix: 'packages/astro/src/client-directives/stream.ts',
    reason: 'Astro client directives require default exports and this file is an intentionally tiny wrapper.',
  },
  {
    rule: 'default-export',
    filePrefix: 'packages/astro/src/client-directives/llm.ts',
    reason: 'Astro client directives require default exports and this file is an intentionally tiny wrapper.',
  },
  {
    rule: 'default-export',
    filePrefix: 'packages/astro/src/client-directives/worker.ts',
    reason: 'Astro client directives require default exports and this file is an intentionally tiny wrapper.',
  },
  {
    rule: 'default-export',
    filePrefix: 'packages/astro/src/client-directives/gpu.ts',
    reason: 'Astro client directives require default exports and this file is an intentionally tiny wrapper.',
  },
  {
    rule: 'default-export',
    filePrefix: 'packages/astro/src/client-directives/wasm.ts',
    reason: 'Astro client directives require default exports and this file is an intentionally tiny wrapper.',
  },
  {
    rule: 'placeholder-content',
    filePrefix: 'packages/vite/src/virtual-modules.ts',
    reason: 'Virtual module placeholders are documented stubs for bundler/type-checker compatibility.',
  },
  {
    rule: 'missing-runtime-capability',
    filePrefix: 'packages/astro/src/client-directives/gpu.ts',
    summaryIncludes: 'WebGPU',
    reason: 'GPU/WebGPU is an explicitly documented partial capability surface in the first wave.',
  },
];

export function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/');
}

export function resolveReportPath(root: string, relativePath: string): string {
  return normalizeRepoPath(resolve(root, relativePath));
}

export function matchesHicpInventory(relativePath: string): boolean {
  if (hicpInventoryExcludePatterns.some((pattern) => pattern.test(relativePath))) {
    return false;
  }
  return (
    hicpInventoryIncludePatterns.some((pattern) => pattern.test(relativePath)) ||
    hicpInventorySpecialFiles.some((pattern) => pattern.test(relativePath))
  );
}

export function sectionForInventoryPath(relativePath: string): FullAuditSectionId {
  const matchers: readonly [RegExp, FullAuditSectionId][] = [
    [/^packages\/core\//, '@czap/core'],
    [/^packages\/quantizer\//, '@czap/quantizer'],
    [/^packages\/compiler\//, '@czap/compiler'],
    [/^packages\/detect\//, '@czap/detect'],
    [/^packages\/web\//, '@czap/web'],
    [/^packages\/edge\//, '@czap/edge'],
    [/^packages\/worker\//, '@czap/worker'],
    [/^packages\/vite\//, '@czap/vite'],
    [/^packages\/astro\//, '@czap/astro'],
    [/^packages\/remotion\//, '@czap/remotion'],
    [/^crates\/czap-compute\//, 'czap-compute'],
    [/^packages\/_spine\//, 'packages/_spine'],
    [/^tests\//, 'tests'],
    [/^scripts\//, 'scripts'],
    [/^docs\//, 'docs'],
    [/^examples\//, 'examples'],
  ];

  for (const [pattern, sectionId] of matchers) {
    if (pattern.test(relativePath)) {
      return sectionId;
    }
  }

  return 'repo/system/devops';
}

export function fileClassForInventoryPath(relativePath: string, sectionId = sectionForInventoryPath(relativePath)): AuditFileClass {
  if (/^packages\/[^/]+\/src\//.test(relativePath) || /^crates\/[^/]+\/src\//.test(relativePath)) {
    return 'runtime/library source';
  }

  if (
    /^packages\/[^/]+\/(package\.json|tsconfig\.json|README\.md)$/.test(relativePath) ||
    /^crates\/[^/]+\/Cargo\.toml$/.test(relativePath)
  ) {
    return 'package/crate meta';
  }

  if (sectionId === 'tests') {
    return 'tests/benchmarks';
  }

  if (sectionId === 'scripts') {
    return 'scripts/audit tooling';
  }

  if (sectionId === 'docs' || sectionId === 'packages/_spine') {
    return 'docs/specs';
  }

  if (sectionId === 'examples') {
    return 'examples/integration';
  }

  return 'repo/system/devops';
}

export function criticalityForInventoryPath(relativePath: string, fileClass: AuditFileClass): number {
  if (
    /(^|\/)(README\.md|CONTRIBUTING\.md|AGENTS\.md|CLAUDE\.md|PLAN\.md|LICENSE)$/i.test(relativePath)
  ) {
    return 0.5;
  }

  if (fileClass === 'runtime/library source') {
    return 1.0;
  }

  if (fileClass === 'tests/benchmarks' || fileClass === 'scripts/audit tooling') {
    return 0.9;
  }

  if (fileClass === 'package/crate meta' || /^\.github\//.test(relativePath)) {
    return 0.8;
  }

  if (sectionForInventoryPath(relativePath) === 'packages/_spine' || fileClass === 'docs/specs' || fileClass === 'examples/integration') {
    return 0.6;
  }

  return 0.8;
}

export function findAllowlistReason(finding: AuditFinding): string | null {
  const file = finding.location?.file ?? '';
  for (const entry of auditAllowlist) {
    if (entry.rule !== finding.rule) continue;
    if (entry.filePrefix && !file.startsWith(entry.filePrefix)) continue;
    if (entry.summaryIncludes && !finding.summary.includes(entry.summaryIncludes)) continue;
    return entry.reason;
  }
  return null;
}

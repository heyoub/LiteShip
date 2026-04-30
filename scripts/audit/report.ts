import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import libCoverage from 'istanbul-lib-coverage';
import { verifyRuntimeSeamsReport, type RuntimeSeamsReportArtifact } from '../artifact-integrity.js';
import { ensureArtifactContext } from '../artifact-context.js';
import { INVARIANTS, findViolations } from '../check-invariants.js';
import {
  criticalityForInventoryPath,
  fileClassForInventoryPath,
  hicpFileClassWeights,
  hicpNamedOffenseRules,
  hicpSectionOrder,
  hicpSectionTitles,
  reportPaths,
  resolveReportPath,
  sectionForInventoryPath,
} from './policy.js';
import {
  createCounts,
  isDirectExecution,
  partitionAllowlistedFindings,
  readInventoryFileRecords,
  relativeToRoot,
  repoRoot,
  sortFindings,
  sortSuppressions,
  walkAllFiles,
  walkTrackedFiles,
  writeTextFile,
} from './shared.js';
import { runIntegrityAudit } from './integrity.js';
import { runStructureAudit } from './structure.js';
import { runSurfaceAudit } from './surface.js';
import type {
  AuditArtifactStatus,
  AuditControlEvaluation,
  AuditCoverageStatus,
  AuditFileClass,
  AuditFinding,
  AuditStrikeBoardReport,
  AuditStrikeItem,
  CodebaseAuditReport,
  FileAuditEntry,
  FileEvidenceRef,
  FileProtocolCoverage,
  FrameworkBlueprintCapability,
  FrameworkBlueprintReport,
  FullAuditSection,
  FullTreeAccountingEntry,
  FullTreeAccountingReport,
  FullTreeClassification,
  FullTreeAccountingSummary,
  ManualReviewStatus,
  ProtocolAreaId,
  ProtocolGapArea,
  ProtocolGapReport,
} from './types.js';

const { createCoverageMap } = libCoverage;
const RUNTIME_SEAMS_BRANCH_HOTSPOT_FINDING_THRESHOLD_PCT = 75;

type BenchArtifact = {
  generatedAt: string;
  summary: {
    passed: boolean;
    failedHardGates: string[];
  };
};

interface FileSignals {
  readonly relatedFindings: readonly AuditFinding[];
  readonly ruleSet: ReadonlySet<string>;
  readonly hasErrorFinding: boolean;
  readonly hasWarningFinding: boolean;
  readonly hasInfoFinding: boolean;
  readonly hasCoverage: boolean;
  readonly lineCount: number;
  readonly importSpecifiers: readonly string[];
  readonly hasProductionImport: boolean;
  readonly hasExpectation: boolean;
  readonly weakExpectationCount: number;
  readonly hasConcurrencySignal: boolean;
  readonly hasDeterminismSignal: boolean;
  readonly hasTraceSignal: boolean;
  readonly hasDocsSignal: boolean;
  readonly hasDecisionSignal: boolean;
  readonly hasToolingSignal: boolean;
  readonly hasPlaceholder: boolean;
  readonly hasConsole: boolean;
  readonly hasStub: boolean;
  readonly hasFallback: boolean;
  readonly hasSuppression: boolean;
  readonly hasTypeErasure: boolean;
  readonly hasHardcodedSecret: boolean;
  readonly hasWrongLanguage: boolean;
  readonly hasConstantReturn: boolean;
  readonly hasShadowTestRisk: boolean;
  readonly hasFakeSuccessRisk: boolean;
  readonly hasLargeFile: boolean;
}

export interface BuildReportOptions {
  readonly root?: string;
  readonly generatedAt?: string;
}

const PROTOCOL_AREA_TITLES: Record<ProtocolAreaId, string> = {
  'bidirectional-traceability': 'Bidirectional traceability',
  'flow-verification': 'Flow verification',
  'test-honesty': 'Test honesty',
  'semantic-consistency': 'Semantic consistency',
  'proof-inventory': 'Proof inventory',
};

const FRAMEWORK_CAPABILITY_GROUPS = {
  runtime: 'Runtime core and delivery model',
  web: 'Web-standard surface and request/response behavior',
  edge: 'Edge/data/bindings story',
  component: 'Component loading / RPC / server-action behavior',
  platform: 'Platform/runtime coupling',
  features: '2025 batteries-included features',
} as const;

type FrameworkCapabilityDefinition = {
  readonly id: string;
  readonly group: keyof typeof FRAMEWORK_CAPABILITY_GROUPS;
  readonly title: string;
  readonly status: FrameworkBlueprintCapability['status'];
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly recommendation: FrameworkBlueprintCapability['recommendation'];
};

function readArtifactIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function buildInvariantStatus(root: string): AuditArtifactStatus {
  const invariantViolations = INVARIANTS.flatMap((invariant) =>
    findViolations(invariant, root).map((violation) => ({
      invariant: invariant.name,
      ...violation,
    })),
  );

  return invariantViolations.length === 0
    ? {
        status: 'present',
        path: 'scripts/check-invariants.ts',
        summary: 'All fast-lane invariants passed.',
      }
    : {
        status: 'failed',
        path: 'scripts/check-invariants.ts',
        summary: `${invariantViolations.length} invariant violation(s) found in the fast lane.`,
        metadata: {
          violations: invariantViolations,
        },
      };
}

function buildCoverageStatus(root: string): AuditArtifactStatus {
  const coveragePath = resolve(root, 'coverage/coverage-final.json');
  if (!existsSync(coveragePath)) {
    return {
      status: 'missing',
      path: 'coverage/coverage-final.json',
      summary: 'Merged coverage artifact is missing. Run pnpm run coverage:merge to refresh it.',
    };
  }

  const coverageMap = createCoverageMap(JSON.parse(readFileSync(coveragePath, 'utf8')) as Record<string, unknown>);
  const summary = coverageMap.getCoverageSummary().data;

  return {
    status: 'present',
    path: 'coverage/coverage-final.json',
    summary: `Merged coverage present: ${summary.statements.pct.toFixed(2)}% statements, ${summary.branches.pct.toFixed(2)}% branches, ${summary.functions.pct.toFixed(2)}% functions, ${summary.lines.pct.toFixed(2)}% lines.`,
    metadata: {
      totals: {
        statements: summary.statements.pct,
        branches: summary.branches.pct,
        functions: summary.functions.pct,
        lines: summary.lines.pct,
      },
    },
  };
}

function buildBenchStatus(root: string): AuditArtifactStatus {
  const benchPath = resolve(root, 'benchmarks/directive-gate.json');
  const bench = readArtifactIfExists<BenchArtifact>(benchPath);
  if (!bench) {
    return {
      status: 'missing',
      path: 'benchmarks/directive-gate.json',
      summary: 'Directive bench artifact is missing. Run pnpm run bench:gate to refresh it.',
    };
  }

  return {
    status: bench.summary.passed ? 'present' : 'failed',
    path: 'benchmarks/directive-gate.json',
    summary: bench.summary.passed
      ? 'Directive benchmark hard gates passed in the latest artifact.'
      : `Directive benchmark hard gates failed: ${bench.summary.failedHardGates.join(', ')}.`,
    metadata: {
      generatedAt: bench.generatedAt,
      failedHardGates: bench.summary.failedHardGates,
    },
  };
}

function buildRuntimeSeamsStatus(root: string): AuditArtifactStatus {
  const seamsPath = resolve(root, 'reports/runtime-seams.json');
  const seams = readArtifactIfExists<RuntimeSeamsReportArtifact>(seamsPath);
  if (!seams) {
    return {
      status: 'missing',
      path: 'reports/runtime-seams.json',
      summary: 'Runtime seams report is missing. Run pnpm run report:runtime-seams to refresh it.',
    };
  }

  try {
    const verification = verifyRuntimeSeamsReport(seams, root);
    const hotspotCount = seams.coverage?.topBranchHotspots?.length ?? 0;
    const diagnosticCount = seams.diagnostics?.length ?? 0;
    const startupBreakdownCount = seams.startupBreakdown?.length ?? 0;
    const transportDiagnosticCount = seams.transportDiagnostics?.length ?? 0;
    const failedChecks = verification.checks.filter((check) => !check.passed);

    return verification.passed
      ? {
          status: 'present',
          path: 'reports/runtime-seams.json',
          summary: `Runtime seams report present with ${hotspotCount} hotspot(s), ${diagnosticCount} diagnostic pair(s), ${startupBreakdownCount} startup breakdown stage(s), and ${transportDiagnosticCount} transport note(s).`,
          metadata: {
            generatedAt: seams.generatedAt,
            hardGatesPassed: seams.hardGates?.passed ?? null,
            startupBreakdownCount,
            transportDiagnosticCount,
            integrityChecks: verification.checks.length,
          },
        }
      : {
          status: 'failed',
          path: 'reports/runtime-seams.json',
          summary: `Runtime seams integrity failed: ${failedChecks.map((check) => check.code).join(', ')}.`,
          metadata: {
            generatedAt: seams.generatedAt,
            failedChecks: failedChecks.map((check) => ({
              code: check.code,
              summary: check.summary,
            })),
          },
        };
  } catch (error) {
    return {
      status: 'failed',
      path: 'reports/runtime-seams.json',
      summary: error instanceof Error ? error.message : 'Runtime seams integrity verification crashed.',
    };
  }
}

function supportingFindings(
  root: string,
  supportingArtifacts: CodebaseAuditReport['supportingArtifacts'],
): readonly AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const [name, artifact] of Object.entries(supportingArtifacts)) {
    if (artifact.status === 'present') continue;
    findings.push({
      id: `support/${name}/${artifact.status}`,
      section: 'support',
      rule: `artifact-${artifact.status}`,
      severity: artifact.status === 'failed' ? 'error' : 'warning',
      title: `${name} artifact ${artifact.status}`,
      summary: artifact.summary,
      location: {
        file: artifact.path,
      },
    });
  }

  const seamsPath = resolve(root, 'reports/runtime-seams.json');
  const seams = readArtifactIfExists<RuntimeSeamsReportArtifact>(seamsPath);
  if (seams && supportingArtifacts.runtimeSeams.status === 'present') {
    for (const hotspot of (seams.coverage?.topBranchHotspots ?? [])
      .filter((entry) => entry.branchPct < RUNTIME_SEAMS_BRANCH_HOTSPOT_FINDING_THRESHOLD_PCT)
      .slice(0, 3)) {
      findings.push({
        id: `support/runtime-hotspot/${hotspot.file}`,
        section: 'support',
        rule: 'runtime-seam-hotspot',
        severity: 'info',
        title: 'Runtime seam branch hotspot',
        summary: `${hotspot.file} is still a top branch hotspot at ${hotspot.branchPct.toFixed(2)}% coverage.`,
        location: {
          file: hotspot.file,
        },
      });
    }

    for (const paired of (seams.pairedTruth ?? [])
      .filter((entry) => entry.status === 'gate-fail' || entry.status === 'invalid-measurement')
      .slice(0, 3)) {
      findings.push({
        id: `support/runtime-paired-truth/${paired.id}`,
        section: 'support',
        rule: 'runtime-seam-paired-truth',
        severity: 'warning',
        title: 'Runtime paired-truth status',
        summary:
          paired.status === 'gate-fail'
            ? `${paired.label} failed its primary ${paired.primaryLane.label} budget with p99 ${paired.primaryLane.summary?.p99?.toFixed(4) ?? 'n/a'} and max ${paired.primaryLane.summary?.max?.toFixed(4) ?? 'n/a'}.`
            : `${paired.label} has invalid paired-truth shape guards in the latest runtime seams report.`,
        metadata: {
          status: paired.status,
          primaryLane: paired.primaryLane.label,
          supportLane: paired.supportLane.label,
        },
      });
    }

    for (const diagnostic of (seams.transportDiagnostics ?? [])
      .filter((entry) => entry.warning || entry.medianOverheadPct === null)
      .slice(0, 2)) {
      findings.push({
        id: `support/runtime-transport/${diagnostic.label}`,
        section: 'support',
        rule: 'runtime-seam-transport-note',
        severity: 'info',
        title: 'Runtime seam transport note',
        summary: diagnostic.medianOverheadPct === null
          ? `${diagnostic.label} has no median overhead reading in the latest runtime seams report.`
          : `${diagnostic.label} transport overhead is ${diagnostic.medianOverheadPct.toFixed(2)}% against a ${diagnostic.thresholdPct.toFixed(2)}% threshold.`,
        metadata: {
          runtimeClass: diagnostic.runtimeClass,
        },
      });
    }
  }

  return findings;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function importSpecifiersFromText(text: string): readonly string[] {
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ] as const;
  const specifiers = new Set<string>();

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        specifiers.add(match[1]);
      }
    }
  }

  return [...specifiers];
}

function hasWrongLanguageArtifact(relativePath: string, text: string): boolean {
  if (/\.(ts|tsx|js|mjs|cjs|astro|d\.ts)$/u.test(relativePath)) {
    return /^\s*(def |pub fn |fn main\()/mu.test(text);
  }

  if (/\.rs$/u.test(relativePath)) {
    return /^\s*(export |function |const )/mu.test(text);
  }

  return false;
}

function hasHardcodedSecret(text: string): boolean {
  return (
    /(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----)/u.test(text) ||
    /\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][^"'\n]{8,}["']/iu.test(text)
  );
}

function hasSuppression(text: string): boolean {
  return /(@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|noinspection|allow\((dead_code|unused))/u.test(text);
}

function hasTypeErasure(relativePath: string, text: string): boolean {
  if (!/\.(ts|tsx|js|mjs|cjs|d\.ts)$/u.test(relativePath)) {
    return false;
  }
  return /\bas any\b|\bas unknown as\b|:\s*any\b/u.test(text);
}

function hasFallback(text: string): boolean {
  return /catch\s*(\([^)]*\))?\s*\{[\s\S]{0,200}return\s+(?:null|undefined|false|true|0|\[\]|\{\}|["'`][^"'`\n]*["'`])/u.test(text);
}

function hasStub(text: string): boolean {
  return /\b(not implemented|not-yet-supported|TODO|FIXME)\b/iu.test(text);
}

function hasPlaceholder(text: string): boolean {
  return /\b(placeholder|lorem ipsum|debugger;|DEBUG)\b/iu.test(text);
}

function hasConsole(relativePath: string, text: string): boolean {
  if (!/\.(ts|tsx|js|mjs|cjs|astro)$/u.test(relativePath)) {
    return false;
  }
  return /\bconsole\.(log|warn|error|debug)\s*\(/u.test(text);
}

function hasConstantReturn(relativePath: string, text: string): boolean {
  if (!/\.(ts|tsx|js|mjs|cjs|rs)$/u.test(relativePath)) {
    return false;
  }
  const tsPattern =
    /function\s+\w+\s*\(([^)]*[A-Za-z_][^)]*)\)[^\{]*\{\s*(?:[^{}]{0,120}\s+)?return\s+(?:true|false|null|undefined|-?\d+(?:\.\d+)?|["'`][^"'`\n]*["'`])\s*;?\s*\}/u;
  const rustPattern =
    /fn\s+\w+\s*\(([^)]*[A-Za-z_][^)]*)\)[^\{]*\{\s*(?:[^{}]{0,120}\s+)?(?:return\s+)?(?:true|false|0|1|Some\([^)]*\)|None)\s*;?\s*\}/u;
  return tsPattern.test(text) || rustPattern.test(text);
}

function hasFakeSuccessRisk(text: string): boolean {
  return /return\s+\{\s*(?:ok|success|passed)\s*:\s*true\b/u.test(text);
}

function hasProductionImport(relativePath: string, importSpecifiers: readonly string[]): boolean {
  if (sectionForInventoryPath(relativePath) !== 'tests') {
    return importSpecifiers.length > 0;
  }

  return importSpecifiers.some((specifier) =>
    specifier.startsWith('@czap/') ||
    specifier.includes('/scripts/') ||
    specifier.includes('../scripts/') ||
    specifier.includes('../../scripts/') ||
    specifier.includes('../packages/') ||
    specifier.includes('../../packages/'),
  );
}

function hasShadowTestRisk(relativePath: string, text: string, importSpecifiers: readonly string[]): boolean {
  if (sectionForInventoryPath(relativePath) !== 'tests') {
    return false;
  }

  const definesLocalTypes = /\b(interface|type|class)\s+[A-Z][A-Za-z0-9_]*/u.test(text);
  return definesLocalTypes && !hasProductionImport(relativePath, importSpecifiers);
}

function buildCoverageFileSet(root: string): ReadonlySet<string> {
  const coveragePath = resolve(root, 'coverage/coverage-final.json');
  if (!existsSync(coveragePath)) {
    return new Set<string>();
  }

  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8')) as Record<string, unknown>;
  return new Set(
    Object.keys(coverage).map((key) => {
      const normalized = key.replace(/\\/g, '/');
      return normalized.includes(`${root.replace(/\\/g, '/')}/`)
        ? relativeToRoot(normalized, root)
        : normalized.replace(/^.*?\/(?=packages\/|scripts\/|tests\/|docs\/|examples\/|crates\/|\.github\/)/u, '');
    }),
  );
}

function buildSignals(
  relativePath: string,
  text: string,
  relatedFindings: readonly AuditFinding[],
  coverageFiles: ReadonlySet<string>,
): FileSignals {
  const importSpecifiers = importSpecifiersFromText(text);
  const ruleSet = new Set(relatedFindings.map((finding) => finding.rule));

  return {
    relatedFindings,
    ruleSet,
    hasErrorFinding: relatedFindings.some((finding) => finding.severity === 'error'),
    hasWarningFinding: relatedFindings.some((finding) => finding.severity === 'warning'),
    hasInfoFinding: relatedFindings.some((finding) => finding.severity === 'info'),
    hasCoverage: coverageFiles.has(relativePath),
    lineCount: text.split(/\r?\n/u).length,
    importSpecifiers,
    hasProductionImport: hasProductionImport(relativePath, importSpecifiers),
    hasExpectation: /\b(expect|assert)\s*\(/u.test(text),
    weakExpectationCount: countMatches(
      text,
      /\bto(Be(?:Truthy|Falsy|Defined|Undefined|Null|true|false)|HaveLength|MatchSnapshot|BeGreaterThan(?:OrEqual)?|BeLessThan(?:OrEqual)?)\b/g,
    ),
    hasConcurrencySignal: /\b(worker|scheduler|concurr|race|lock|retry|queue|channel|idempot|lineariz|replay|stream)\b/iu.test(text),
    hasDeterminismSignal: /\b(determin|seed|fingerprint|canonical|snapshot|hash|content[- ]address|replay)\b/iu.test(text),
    hasTraceSignal: /\b(trace|audit|receipt|invariant|coverage|diagnostic|telemetry|report)\b/iu.test(text),
    hasDocsSignal: /\b(architecture|status|runtime|surface|protocol|spec|contract|gate|artifact)\b/iu.test(text),
    hasDecisionSignal: /\b(decision|tradeoff|consequence|supersede|adr)\b/iu.test(text),
    hasToolingSignal: /\b(vitest|playwright|eslint|prettier|typescript|tsx|pnpm|cargo|workflow|ci)\b/iu.test(text),
    hasPlaceholder: hasPlaceholder(text),
    hasConsole: hasConsole(relativePath, text),
    hasStub: hasStub(text),
    hasFallback: hasFallback(text),
    hasSuppression: hasSuppression(text),
    hasTypeErasure: hasTypeErasure(relativePath, text),
    hasHardcodedSecret: hasHardcodedSecret(text),
    hasWrongLanguage: hasWrongLanguageArtifact(relativePath, text),
    hasConstantReturn: hasConstantReturn(relativePath, text),
    hasShadowTestRisk: hasShadowTestRisk(relativePath, text, importSpecifiers),
    hasFakeSuccessRisk: hasFakeSuccessRisk(text),
    hasLargeFile: text.split(/\r?\n/u).length > 220,
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
}

function namedOffensesForFile(signals: FileSignals): readonly string[] {
  const offenses = [
    ...signals.relatedFindings.map((finding) => hicpNamedOffenseRules[finding.rule]).filter((value): value is string => Boolean(value)),
  ];

  if (signals.hasShadowTestRisk) {
    offenses.push('Shadow Test');
  }
  if (signals.hasConstantReturn) {
    offenses.push('Polite Downgrade');
  }
  if (signals.hasFallback) {
    offenses.push('Error Path Hollowing');
  }
  if (signals.hasLargeFile && signals.hasProductionImport) {
    offenses.push('Glue Inflation');
  }

  return uniqueSorted(offenses);
}

function forbiddenRemediesForFile(signals: FileSignals): readonly string[] {
  const remedies: string[] = [];

  if (signals.hasSuppression) {
    remedies.push('Warning/lint suppression without written justification');
  }
  if (signals.hasTypeErasure) {
    remedies.push('Type erasure to silence type mismatches where structured types were specified');
  }
  if (signals.hasFallback) {
    remedies.push('Catch-all error swallowing');
  }
  if (signals.hasShadowTestRisk) {
    remedies.push('Test files with zero production imports (shadow tests)');
  }
  if (signals.hasStub) {
    remedies.push('Stubs in paths that look complete');
  }
  if (signals.hasConstantReturn) {
    remedies.push('Hardcoded constants inside computation functions where spec says "compute from inputs"');
  }
  if (signals.hasFakeSuccessRisk) {
    remedies.push('Fake success responses (success status with hardcoded data when computation required)');
  }

  return uniqueSorted(remedies);
}

function makeEvaluation(
  family: string,
  weight: number,
  score: 0 | 0.5 | 1,
  note: string,
): AuditControlEvaluation {
  return { family, weight, score, note };
}

function runtimeEvaluations(signals: FileSignals, forbiddenRemedies: readonly string[]): readonly AuditControlEvaluation[] {
  return hicpFileClassWeights['runtime/library source'].map(({ family, weight }) => {
    switch (family) {
      case 'Laws + forbidden remedies':
        return signals.hasHardcodedSecret || signals.hasWrongLanguage || forbiddenRemedies.length > 0
          ? makeEvaluation(family, weight, 0, 'Detected a forbidden remedy or critical integrity risk in runtime/library code.')
          : signals.hasErrorFinding || signals.hasWarningFinding
            ? makeEvaluation(family, weight, 0.5, 'Active audit findings are present in this runtime/library file.')
            : makeEvaluation(family, weight, 1, 'No active law-level or forbidden-remedy violations detected for this runtime/library file.');
      case 'Architecture/wiring':
        return ['package-topology', 'missing-manifest-dependency', 'unresolved-internal-import', 'unknown-internal-package', 'host-surface', 'virtual-module-surface', 'package-export-surface'].some((rule) => signals.ruleSet.has(rule))
          ? makeEvaluation(family, weight, 0, 'Wiring or package-surface breakage is present in the active audit findings.')
          : signals.ruleSet.has('orphan-export-candidate')
            ? makeEvaluation(family, weight, 0.5, 'The file exports symbols with no in-repo consumers, which is an island/orphan risk.')
            : makeEvaluation(family, weight, 1, 'No active topology or wiring faults were found for this runtime/library file.');
      case 'Failure honesty':
        return signals.hasStub || signals.hasFallback || signals.hasConstantReturn || signals.hasFakeSuccessRisk
          ? makeEvaluation(family, weight, 0, 'The file shows downgrade, stub, fallback, or fake-success risk instead of explicit failure.')
          : signals.hasPlaceholder || signals.hasConsole
            ? makeEvaluation(family, weight, 0.5, 'The file contains placeholder or raw-console paths that weaken fail-loud behavior.')
            : makeEvaluation(family, weight, 1, 'No stub, fake-success, or fallback-laundering pattern was detected in the runtime path.');
      case 'Surface/traceability':
        return signals.hasCoverage || signals.hasTraceSignal
          ? makeEvaluation(family, weight, 1, 'Coverage or audit/trace evidence exists for this runtime/library file.')
          : makeEvaluation(family, weight, 0.5, 'No direct coverage or trace signal was found for this runtime/library file.');
      case 'Semantic fidelity':
        return signals.ruleSet.has('suspicious-reimplementation') || signals.hasConstantReturn || signals.hasTypeErasure
          ? makeEvaluation(family, weight, 0, 'Local reimplementation, constant-return, or type-erasure risk undermines semantic fidelity.')
          : signals.hasInfoFinding
            ? makeEvaluation(family, weight, 0.5, 'Advisory findings suggest semantic follow-up is still warranted.')
            : makeEvaluation(family, weight, 1, 'No semantic downgrade signals were detected in this runtime/library file.');
      case 'Self-accusation/observability':
        return signals.hasCoverage || signals.hasTraceSignal || signals.hasDeterminismSignal
          ? makeEvaluation(family, weight, 1, 'The file participates in coverage, diagnostics, replay, or other self-accusing machinery.')
          : makeEvaluation(family, weight, 0.5, 'The file lacks direct observability or replay signals in the current audit evidence.');
      default:
        return makeEvaluation(family, weight, 1, 'No penalty applied.');
    }
  });
}

function metaEvaluations(relativePath: string, text: string, signals: FileSignals): readonly AuditControlEvaluation[] {
  return hicpFileClassWeights['package/crate meta'].map(({ family, weight }) => {
    switch (family) {
      case 'Dependency control':
        return signals.ruleSet.has('missing-manifest-dependency')
          ? makeEvaluation(family, weight, 0, 'Manifest/dependency drift is present in the active audit findings.')
          : /"latest"|"workspace:\*"|\^\d/u.test(text)
            ? makeEvaluation(family, weight, 0.5, 'The file contains floating or broad dependency constraints that soften dependency control.')
            : makeEvaluation(family, weight, 1, 'Dependencies appear pinned or repo-local, with no active dependency-fidelity findings.');
      case 'Surface/export fidelity':
        return ['package-export-surface', 'host-surface', 'virtual-module-surface'].some((rule) => signals.ruleSet.has(rule))
          ? makeEvaluation(family, weight, 0, 'Declared surface paths do not match the current implementation surface.')
          : /package\.json$/u.test(relativePath) && !/"exports"/u.test(text)
            ? makeEvaluation(family, weight, 0.5, 'Manifest lacks an explicit exports map, so surface intent is less rigid.')
            : makeEvaluation(family, weight, 1, 'Package/crate surface declarations line up with the current audit evidence.');
      case 'Determinism/tooling':
        return /packageManager|allowBuilds|noEmit|max-warnings/u.test(text) || /pnpm-lock\.yaml$/u.test(relativePath)
          ? makeEvaluation(family, weight, 1, 'Tooling or lock configuration contributes explicit determinism constraints.')
          : makeEvaluation(family, weight, 0.5, 'The file is meta/configuration but carries fewer explicit determinism guardrails.');
      case 'Traceability/docs alignment':
        return signals.hasDocsSignal || signals.hasDecisionSignal
          ? makeEvaluation(family, weight, 1, 'The file includes traceability, docs, or decision-oriented signals.')
          : makeEvaluation(family, weight, 0.5, 'The file has limited direct traceability or rationale context in-band.');
      case 'Security/supply chain':
        return signals.hasHardcodedSecret
          ? makeEvaluation(family, weight, 0, 'Potential secret material appears in repo metadata/config.')
          : /allowBuilds|overrides|private/u.test(text)
            ? makeEvaluation(family, weight, 1, 'The file contains explicit supply-chain or package-scope controls.')
            : makeEvaluation(family, weight, 0.5, 'No direct secret was found, but supply-chain controls are only partially explicit here.');
      default:
        return makeEvaluation(family, weight, 1, 'No penalty applied.');
    }
  });
}

function testEvaluations(signals: FileSignals): readonly AuditControlEvaluation[] {
  return hicpFileClassWeights['tests/benchmarks'].map(({ family, weight }) => {
    switch (family) {
      case 'Production coupling':
        return signals.hasShadowTestRisk
          ? makeEvaluation(family, weight, 0, 'The file defines local test-only types without production imports, which is a shadow-test risk.')
          : signals.hasProductionImport
            ? makeEvaluation(family, weight, 1, 'The test/benchmark file imports production code or production-adjacent scripts directly.')
            : makeEvaluation(family, weight, 0.5, 'The file has limited visible production coupling in the current import graph.');
      case 'Assertion strength':
        return !signals.hasExpectation
          ? makeEvaluation(family, weight, 0, 'No assertion shape was detected in this test file.')
          : signals.weakExpectationCount > 3
            ? makeEvaluation(family, weight, 0.5, 'The file leans on multiple weak assertion forms that deserve stronger content checks.')
            : makeEvaluation(family, weight, 1, 'The file contains explicit assertions and does not appear dominated by weak assertion patterns.');
      case 'Edge/error/concurrency coverage':
        return signals.hasConcurrencySignal
          ? makeEvaluation(family, weight, 1, 'The file exercises concurrency, retries, scheduling, or replay-sensitive behavior.')
          : signals.hasProductionImport
            ? makeEvaluation(family, weight, 0.5, 'The file covers real code paths but shows fewer explicit edge/concurrency markers.')
            : makeEvaluation(family, weight, 0.5, 'The file needs stronger evidence of error-path or concurrency coverage.');
      case 'Determinism/fixtures':
        return signals.hasDeterminismSignal
          ? makeEvaluation(family, weight, 1, 'Replay, snapshot, fingerprint, or deterministic signals are present in the test/bench file.')
          : makeEvaluation(family, weight, 0.5, 'Determinism or representative-fixture intent is only partially visible in this file.');
      case 'Investigation value':
        return signals.hasTraceSignal || signals.hasDocsSignal
          ? makeEvaluation(family, weight, 1, 'The file contains diagnostics, invariant, or investigation-oriented context.')
          : makeEvaluation(family, weight, 0.5, 'The file could provide stronger investigation breadcrumbs when it fails.');
      default:
        return makeEvaluation(family, weight, 1, 'No penalty applied.');
    }
  });
}

function scriptEvaluations(signals: FileSignals): readonly AuditControlEvaluation[] {
  return hicpFileClassWeights['scripts/audit tooling'].map(({ family, weight }) => {
    switch (family) {
      case 'Deterministic automation':
        return signals.hasDeterminismSignal || signals.hasToolingSignal
          ? makeEvaluation(family, weight, 1, 'The script encodes deterministic automation or explicit toolchain handling.')
          : makeEvaluation(family, weight, 0.5, 'Deterministic automation intent is only partially explicit in this script.');
      case 'Detectors/gates':
        return signals.hasTraceSignal || /\b(audit|verify|gate|invariant|coverage|bench)\b/iu.test(signals.relatedFindings.map((finding) => finding.rule).join(' '))
          ? makeEvaluation(family, weight, 1, 'The script participates in detectors, gates, or self-accusing verification paths.')
          : makeEvaluation(family, weight, 0.5, 'The script looks operational, but not strongly gate- or detector-oriented.');
      case 'Thin orchestration':
        return signals.hasLargeFile && signals.hasProductionImport
          ? makeEvaluation(family, weight, 0.5, 'The script is relatively large and likely carries more orchestration logic than a thin wrapper.')
          : makeEvaluation(family, weight, 1, 'The script appears to stay within an automation/orchestration role.');
      case 'Security hygiene':
        return signals.hasHardcodedSecret || signals.hasSuppression
          ? makeEvaluation(family, weight, 0, 'The script contains secret or suppression risk that weakens automation hygiene.')
          : makeEvaluation(family, weight, 1, 'No hardcoded secret or suppression pattern was detected in this script.');
      case 'Traceability/reporting':
        return signals.hasTraceSignal || signals.hasDocsSignal
          ? makeEvaluation(family, weight, 1, 'The script contains reporting, traceability, or audit-oriented output.')
          : makeEvaluation(family, weight, 0.5, 'Traceability/reporting intent is only lightly visible in this script.');
      default:
        return makeEvaluation(family, weight, 1, 'No penalty applied.');
    }
  });
}

function docsEvaluations(signals: FileSignals): readonly AuditControlEvaluation[] {
  return hicpFileClassWeights['docs/specs'].map(({ family, weight }) => {
    switch (family) {
      case 'Freeze/semantic contract quality':
        return signals.hasDocsSignal
          ? makeEvaluation(family, weight, 1, 'The document carries explicit architecture, spec, runtime, or contract language.')
          : makeEvaluation(family, weight, 0.5, 'The document is authored but lighter on architectural/semantic-contract detail.');
      case 'Artifact alignment':
        return signals.hasTraceSignal
          ? makeEvaluation(family, weight, 1, 'The document references artifacts, audit, or verification outputs directly.')
          : makeEvaluation(family, weight, 0.5, 'Artifact alignment is present but not strongly explicit in this document.');
      case 'Traceability/decision capture':
        return signals.hasDecisionSignal || /\b(trace|requirement|decision|record|change|roadmap)\b/iu.test(signals.relatedFindings.map((finding) => finding.summary).join('\n'))
          ? makeEvaluation(family, weight, 1, 'The document provides traceability or explicit decision/rationale capture.')
          : makeEvaluation(family, weight, 0.5, 'Decision capture and bidirectional traceability are only partially explicit here.');
      case 'Operational usefulness':
        return signals.hasToolingSignal || signals.hasTraceSignal
          ? makeEvaluation(family, weight, 1, 'The document appears directly useful to operation, verification, or contributor workflow.')
          : makeEvaluation(family, weight, 0.5, 'The document is informative, but operational guidance is lighter than ideal.');
      default:
        return makeEvaluation(family, weight, 1, 'No penalty applied.');
    }
  });
}

function exampleEvaluations(signals: FileSignals): readonly AuditControlEvaluation[] {
  return hicpFileClassWeights['examples/integration'].map(({ family, weight }) => {
    switch (family) {
      case 'Honest API usage':
        return signals.hasProductionImport
          ? makeEvaluation(family, weight, 1, 'The example/integration file appears to exercise real package surfaces.')
          : makeEvaluation(family, weight, 0.5, 'The example is authored, but production coupling is not strongly visible in-file.');
      case 'Wiring realism':
        return signals.hasConcurrencySignal || signals.hasDocsSignal
          ? makeEvaluation(family, weight, 1, 'The example shows concrete runtime wiring, flow, or integration concerns.')
          : makeEvaluation(family, weight, 0.5, 'The example looks compositional, with less explicit wiring realism.');
      case 'Downgrade resistance':
        return signals.hasStub || signals.hasConstantReturn || signals.hasFakeSuccessRisk
          ? makeEvaluation(family, weight, 0, 'The example contains downgrade or fake-success/stub risk.')
          : makeEvaluation(family, weight, 1, 'No obvious downgrade path was detected in this example/integration file.');
      case 'Deterministic setup':
        return signals.hasDeterminismSignal || signals.hasToolingSignal
          ? makeEvaluation(family, weight, 1, 'The example includes deterministic setup or toolchain framing.')
          : makeEvaluation(family, weight, 0.5, 'Deterministic setup signals are limited in this example file.');
      case 'Teaching/diagnostic value':
        return signals.hasTraceSignal || signals.hasDocsSignal
          ? makeEvaluation(family, weight, 1, 'The example appears to carry explanatory or diagnostic value for operators/users.')
          : makeEvaluation(family, weight, 0.5, 'The example is runnable but lighter on diagnostic/teaching context.');
      default:
        return makeEvaluation(family, weight, 1, 'No penalty applied.');
    }
  });
}

function repoEvaluations(
  relativePath: string,
  text: string,
  signals: FileSignals,
  supportingArtifacts: CodebaseAuditReport['supportingArtifacts'],
): readonly AuditControlEvaluation[] {
  return hicpFileClassWeights['repo/system/devops'].map(({ family, weight }) => {
    switch (family) {
      case 'Hermetic workspace/toolchain':
        return /packageManager|allowBuilds|workspace|lock|engine|pnpm/u.test(text) || /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.nvmrc|\.editorconfig|\.prettierrc|tsconfig\.json)$/u.test(basename(relativePath))
          ? makeEvaluation(family, weight, 1, 'This repo/devops file encodes workspace or toolchain determinism directly.')
          : makeEvaluation(family, weight, 0.5, 'Hermetic toolchain intent is only partially visible in this repo/devops file.');
      case 'CI gate completeness':
        return /^\.github\/workflows\//u.test(relativePath) || /\b(build|typecheck|lint|test|audit|coverage|bench|feedback:verify)\b/u.test(text)
          ? makeEvaluation(family, weight, 1, 'The file contributes to the repo gate sequence or CI execution surface.')
          : makeEvaluation(family, weight, 0.5, 'CI/gate completeness is relevant to this file but not strongly explicit.');
      case 'Supply chain/security':
        return signals.hasHardcodedSecret
          ? makeEvaluation(family, weight, 0, 'Potential secret material appears in repo/system/devops scope.')
          : /allowBuilds|overrides|private/u.test(text)
            ? makeEvaluation(family, weight, 1, 'The file contains explicit supply-chain or scope-limiting controls.')
            : makeEvaluation(family, weight, 0.5, 'No secret was found, but supply-chain controls are only partially explicit here.');
      case 'Architecture conformance':
        return /ARCHITECTURE|STATUS|AUDIT|adr\/|gauntlet|invariant/u.test(text) || Object.values(supportingArtifacts).every((artifact) => artifact.status === 'present')
          ? makeEvaluation(family, weight, 1, 'The file aligns with architecture/gate governance or sits next to fully present support artifacts.')
          : makeEvaluation(family, weight, 0.5, 'Architecture conformance is present but not strongly encoded in this file.');
      case 'Contributor/decision guidance':
        return signals.hasDecisionSignal || signals.hasDocsSignal
          ? makeEvaluation(family, weight, 1, 'The file gives contributor-facing guidance, decision context, or operational instructions.')
          : makeEvaluation(family, weight, 0.5, 'Contributor/decision guidance is limited in this repo/devops file.');
      default:
        return makeEvaluation(family, weight, 1, 'No penalty applied.');
    }
  });
}

function evaluateControls(
  relativePath: string,
  fileClass: AuditFileClass,
  text: string,
  signals: FileSignals,
  forbiddenRemedies: readonly string[],
  supportingArtifacts: CodebaseAuditReport['supportingArtifacts'],
): readonly AuditControlEvaluation[] {
  switch (fileClass) {
    case 'runtime/library source':
      return runtimeEvaluations(signals, forbiddenRemedies);
    case 'package/crate meta':
      return metaEvaluations(relativePath, text, signals);
    case 'tests/benchmarks':
      return testEvaluations(signals);
    case 'scripts/audit tooling':
      return scriptEvaluations(signals);
    case 'docs/specs':
      return docsEvaluations(signals);
    case 'examples/integration':
      return exampleEvaluations(signals);
    case 'repo/system/devops':
      return repoEvaluations(relativePath, text, signals, supportingArtifacts);
    default:
      return [];
  }
}

function coverageStatus(present: boolean, partial = false): AuditCoverageStatus {
  if (present) return 'present';
  if (partial) return 'partial';
  return 'missing';
}

function protocolCoverageForFile(
  relativePath: string,
  fileClass: AuditFileClass,
  signals: FileSignals,
  namedOffenses: readonly string[],
  forbiddenRemedies: readonly string[],
): readonly FileProtocolCoverage[] {
  const traceability = (() => {
    if (fileClass === 'docs/specs') {
      return {
        status: coverageStatus(signals.hasDocsSignal && (signals.hasTraceSignal || signals.hasDecisionSignal), signals.hasDocsSignal),
        summary:
          signals.hasDocsSignal && (signals.hasTraceSignal || signals.hasDecisionSignal)
            ? 'Document carries both semantic-contract language and artifact/decision breadcrumbs.'
            : signals.hasDocsSignal
              ? 'Document carries architectural language, but backward/forward evidence links remain partial.'
              : 'Document lacks strong traceability markers.',
      };
    }

    return {
      status: coverageStatus(
        signals.hasCoverage && (signals.hasTraceSignal || signals.hasDocsSignal || signals.hasDecisionSignal),
        signals.hasCoverage || signals.hasTraceSignal || signals.hasDocsSignal,
      ),
      summary:
        signals.hasCoverage && (signals.hasTraceSignal || signals.hasDocsSignal || signals.hasDecisionSignal)
          ? 'File has both proving evidence and traceable context signals.'
          : signals.hasCoverage || signals.hasTraceSignal || signals.hasDocsSignal
            ? 'File participates in evidence or trace context, but not both directions strongly.'
            : 'File lacks strong bidirectional traceability signals.',
    };
  })();

  const flowVerification = (() => {
    if (fileClass === 'docs/specs' || fileClass === 'package/crate meta') {
      return {
        status: 'not_applicable' as const,
        summary: 'Flow verification is assessed on executable source, tests, and integration surfaces rather than on this file class.',
      };
    }

    const hasFlowBreak =
      ['package-topology', 'missing-manifest-dependency', 'unresolved-internal-import', 'unknown-internal-package', 'orphan-export-candidate'].some((rule) =>
        signals.ruleSet.has(rule),
      );
    return {
      status: hasFlowBreak
        ? ('missing' as const)
        : signals.hasCoverage || signals.hasTraceSignal || signals.hasConcurrencySignal
          ? ('present' as const)
          : ('partial' as const),
      summary: hasFlowBreak
        ? 'File is implicated in a wiring/orphan signal that weakens end-to-end flow confidence.'
        : signals.hasCoverage || signals.hasTraceSignal || signals.hasConcurrencySignal
          ? 'File has runtime, coverage, or replay-style evidence that supports flow verification.'
          : 'No direct flow proof was found for this file, though no active wiring fault was detected.',
    };
  })();

  const testHonesty = (() => {
    if (fileClass !== 'tests/benchmarks') {
      return {
        status: 'not_applicable' as const,
        summary: 'Test-honesty scoring applies only to tests and benchmarks.',
      };
    }

    return {
      status: signals.hasShadowTestRisk || !signals.hasExpectation
        ? ('missing' as const)
        : signals.weakExpectationCount > 3 || !signals.hasProductionImport
          ? ('partial' as const)
          : ('present' as const),
      summary: signals.hasShadowTestRisk
        ? 'Local test-only models appear without production imports.'
        : !signals.hasExpectation
          ? 'No assertions were detected in this test file.'
          : signals.weakExpectationCount > 3 || !signals.hasProductionImport
            ? 'Test file exercises real code only partially or leans on weaker assertion forms.'
            : 'Test file imports production code directly and has non-trivial assertion coverage.',
    };
  })();

  const semanticConsistency = (() => {
    const severeRisk =
      signals.hasTypeErasure ||
      signals.hasConstantReturn ||
      signals.hasFallback ||
      signals.hasStub ||
      forbiddenRemedies.length > 0 ||
      namedOffenses.includes('Polite Downgrade') ||
      namedOffenses.includes('Error Path Hollowing');
    return {
      status: severeRisk
        ? ('missing' as const)
        : signals.hasInfoFinding || namedOffenses.length > 0
          ? ('partial' as const)
          : ('present' as const),
      summary: severeRisk
        ? 'Semantic downgrade or fallback laundering risk is present for this file.'
        : signals.hasInfoFinding || namedOffenses.length > 0
          ? 'Advisory semantic pressure remains even though no hard downgrade was detected.'
          : 'No semantic-drift or downgrade markers were detected for this file.',
    };
  })();

  const proofInventory = (() => {
    if (fileClass === 'runtime/library source') {
      return {
        status: coverageStatus(signals.hasCoverage && signals.hasTraceSignal, signals.hasCoverage || signals.hasTraceSignal),
        summary:
          signals.hasCoverage && signals.hasTraceSignal
            ? 'Runtime file is represented in proving artifacts and diagnostics.'
            : signals.hasCoverage || signals.hasTraceSignal
              ? 'Runtime file has partial proving coverage or diagnostics, but not both.'
              : 'Runtime file is not strongly represented in the current proof inventory.',
      };
    }

    return {
      status: coverageStatus(
        signals.hasTraceSignal && (signals.hasDeterminismSignal || signals.hasToolingSignal || signals.hasConcurrencySignal),
        signals.hasTraceSignal || signals.hasDeterminismSignal || signals.hasToolingSignal,
      ),
      summary:
        signals.hasTraceSignal && (signals.hasDeterminismSignal || signals.hasToolingSignal || signals.hasConcurrencySignal)
          ? 'File contributes to repeatable proof, diagnostics, or gate machinery.'
          : signals.hasTraceSignal || signals.hasDeterminismSignal || signals.hasToolingSignal
            ? 'File contributes partial proof or gate machinery.'
            : 'File does not visibly contribute to the current proof inventory.',
    };
  })();

  return [
    { area: 'bidirectional-traceability', ...traceability },
    { area: 'flow-verification', ...flowVerification },
    { area: 'test-honesty', ...testHonesty },
    { area: 'semantic-consistency', ...semanticConsistency },
    { area: 'proof-inventory', ...proofInventory },
  ];
}

function blockingSignalsForFile(
  signals: FileSignals,
  namedOffenses: readonly string[],
  forbiddenRemedies: readonly string[],
): readonly string[] {
  return uniqueSorted([
    ...namedOffenses.map((offense) => `named-offense:${offense}`),
    ...forbiddenRemedies.map((remedy) => `forbidden-remedy:${remedy}`),
    ...signals.relatedFindings.map((finding) => `finding:${finding.rule}`),
    ...(signals.hasCoverage ? [] : ['coverage-gap']),
    ...(signals.hasShadowTestRisk ? ['shadow-test-risk'] : []),
  ]);
}

function evidenceRefsForFile(
  relativePath: string,
  signals: FileSignals,
  supportingArtifacts: CodebaseAuditReport['supportingArtifacts'],
): readonly FileEvidenceRef[] {
  const refs: FileEvidenceRef[] = signals.relatedFindings.map((finding) => ({
    kind: 'finding',
    ref: finding.id,
    summary: finding.summary,
  }));

  if (signals.hasCoverage) {
    refs.push({
      kind: 'coverage',
      ref: 'coverage/coverage-final.json',
      summary: `${relativePath} is represented in merged coverage.`,
    });
  }

  if (sectionForInventoryPath(relativePath) === 'docs') {
    refs.push({
      kind: 'doc',
      ref: relativePath,
      summary: 'Document itself is part of the audit evidence chain.',
    });
  }

  if (sectionForInventoryPath(relativePath) === 'tests') {
    refs.push({
      kind: 'test',
      ref: relativePath,
      summary: 'Test file is part of the proving-artifact surface.',
    });
  }

  if (signals.hasTraceSignal && supportingArtifacts.runtimeSeams.status === 'present') {
    refs.push({
      kind: 'artifact',
      ref: 'reports/runtime-seams.json',
      summary: 'Runtime seams artifact is available for trace-oriented follow-up.',
    });
  }

  return refs.slice(0, 6);
}

function roadTo100ForFile(
  relativePath: string,
  fileClass: AuditFileClass,
  controlEvaluations: readonly AuditControlEvaluation[],
  protocolCoverage: readonly FileProtocolCoverage[],
  namedOffenses: readonly string[],
  forbiddenRemedies: readonly string[],
  score: number,
): readonly string[] {
  if (score >= 100) {
    return [];
  }

  const actions: string[] = [];

  for (const remedy of forbiddenRemedies) {
    switch (remedy) {
      case 'Type erasure to silence type mismatches where structured types were specified':
        actions.push('Remove `any`/type-erasure paths and restore semantic types at this boundary.');
        break;
      case 'Catch-all error swallowing':
        actions.push('Replace catch-all fallback behavior with explicit error propagation or typed failure reporting.');
        break;
      case 'Stubs in paths that look complete':
        actions.push('Replace stub markers with real computation or an explicit fail-loud contract.');
        break;
      case 'Hardcoded constants inside computation functions where spec says "compute from inputs"':
        actions.push('Compute outputs from live inputs instead of returning constant sentinel values.');
        break;
      case 'Fake success responses (success status with hardcoded data when computation required)':
        actions.push('Remove fake-success paths and make success contingent on real work completing.');
        break;
      case 'Test files with zero production imports (shadow tests)':
        actions.push('Import production types/functions directly and remove local shadow models.');
        break;
      default:
        actions.push(`Eliminate forbidden-remedy pressure: ${remedy}.`);
        break;
    }
  }

  for (const offense of namedOffenses) {
    switch (offense) {
      case 'Island Syndrome':
        actions.push('Add or prove real in-repo callers/consumers so this surface is no longer isolated.');
        break;
      case 'Glue Inflation':
        actions.push('Reduce orchestration density by moving domain logic back into narrower primitives or helpers.');
        break;
      case 'Polite Downgrade':
        actions.push('Tighten behavior to the specified semantics instead of a simplified but plausible downgrade.');
        break;
      case 'Error Path Hollowing':
        actions.push('Strengthen error-path cleanup, context preservation, and non-happy-path assertions.');
        break;
      case 'Shadow Test':
        actions.push('Anchor the test to production imports and stronger behavioral assertions.');
        break;
      default:
        actions.push(`Address named-offense pressure: ${offense}.`);
        break;
    }
  }

  for (const evaluation of controlEvaluations.filter((entry) => entry.score < 1)) {
    actions.push(`Lift ${evaluation.family.toLowerCase()} from ${evaluation.score} to 1 by resolving: ${evaluation.note}`);
  }

  for (const protocolEntry of protocolCoverage.filter((entry) => entry.status === 'missing' || entry.status === 'partial')) {
    actions.push(
      protocolEntry.status === 'missing'
        ? `Add ${PROTOCOL_AREA_TITLES[protocolEntry.area].toLowerCase()} evidence: ${protocolEntry.summary}`
        : `Strengthen ${PROTOCOL_AREA_TITLES[protocolEntry.area].toLowerCase()}: ${protocolEntry.summary}`,
    );
  }

  if (fileClass === 'runtime/library source') {
    actions.push('Keep merged coverage and self-accusing diagnostics attached to this runtime path.');
  } else if (fileClass === 'tests/benchmarks') {
    actions.push('Strengthen assertions so the file proves behavior, not just execution shape.');
  }

  if (!relativePath.startsWith('docs/') && score < 87.5) {
    actions.push(`Document the intended invariant or contract for ${relativePath} where the current evidence chain is thin.`);
  }

  return uniqueSorted(actions).slice(0, 6);
}

function manualReviewStatusForFile(): ManualReviewStatus {
  return 'seeded';
}

function scoreFile(evaluations: readonly AuditControlEvaluation[]): number {
  const totalWeight = evaluations.reduce((sum, evaluation) => sum + evaluation.weight, 0);
  if (totalWeight === 0) {
    return 100;
  }
  const weighted = evaluations.reduce((sum, evaluation) => sum + evaluation.weight * evaluation.score, 0);
  return roundScore((weighted / totalWeight) * 100);
}

function notesForFile(
  relativePath: string,
  fileClass: AuditFileClass,
  signals: FileSignals,
  namedOffenses: readonly string[],
  forbiddenRemedies: readonly string[],
): readonly string[] {
  const notes: string[] = [];

  if (signals.relatedFindings.length > 0) {
    notes.push(...signals.relatedFindings.slice(0, 2).map((finding) => finding.summary));
  } else {
    notes.push(`No active repo-native audit findings currently point at ${relativePath}.`);
  }

  if (signals.hasCoverage) {
    notes.push('Merged coverage currently includes this path.');
  }
  if (signals.hasShadowTestRisk) {
    notes.push('Local type definitions appear without production imports, which is a shadow-test risk.');
  }
  if (namedOffenses.length > 0) {
    notes.push(`Named offense pressure: ${namedOffenses.join(', ')}.`);
  }
  if (forbiddenRemedies.length > 0) {
    notes.push(`Forbidden-remedy pressure: ${forbiddenRemedies.join(', ')}.`);
  }

  if (notes.length === 1) {
    switch (fileClass) {
      case 'runtime/library source':
        notes.push('Runtime/library scoring is based on structure, integrity, surface, and coverage evidence.');
        break;
      case 'package/crate meta':
        notes.push('Meta scoring emphasizes manifest fidelity, determinism, and supply-chain hygiene.');
        break;
      case 'tests/benchmarks':
        notes.push('Test scoring emphasizes production coupling, assertion quality, and concurrency/edge-path evidence.');
        break;
      case 'scripts/audit tooling':
        notes.push('Script scoring emphasizes deterministic automation, detectors, and thin orchestration.');
        break;
      case 'docs/specs':
        notes.push('Docs/spec scoring emphasizes freeze quality, traceability, and operational usefulness.');
        break;
      case 'examples/integration':
        notes.push('Example scoring emphasizes honest API usage, runtime wiring realism, and deterministic setup.');
        break;
      case 'repo/system/devops':
        notes.push('Repo/devops scoring emphasizes hermetic toolchain control, CI gates, and contributor guidance.');
        break;
    }
  }

  return uniqueSorted(notes).slice(0, 4);
}

function buildFileEntry(
  relativePath: string,
  text: string,
  findingsByFile: ReadonlyMap<string, readonly AuditFinding[]>,
  coverageFiles: ReadonlySet<string>,
  supportingArtifacts: CodebaseAuditReport['supportingArtifacts'],
): FileAuditEntry {
  const sectionId = sectionForInventoryPath(relativePath);
  const fileClass = fileClassForInventoryPath(relativePath, sectionId);
  const relatedFindings = findingsByFile.get(relativePath) ?? [];
  const signals = buildSignals(relativePath, text, relatedFindings, coverageFiles);
  const namedOffenses = namedOffensesForFile(signals);
  const forbiddenRemedies = forbiddenRemediesForFile(signals);
  const controlEvaluations = evaluateControls(relativePath, fileClass, text, signals, forbiddenRemedies, supportingArtifacts);
  const rawScore = scoreFile(controlEvaluations);
  const criticalEscalation = signals.hasHardcodedSecret || signals.hasWrongLanguage || signals.hasFakeSuccessRisk;
  const cappedScore = criticalEscalation
    ? Math.min(rawScore, 19)
    : forbiddenRemedies.length > 0
      ? Math.min(rawScore, 39)
      : namedOffenses.length > 0
        ? Math.min(rawScore, 59)
        : rawScore;
  const score = roundScore(cappedScore);
  const protocolCoverage = protocolCoverageForFile(relativePath, fileClass, signals, namedOffenses, forbiddenRemedies);
  const blockingSignals = blockingSignalsForFile(signals, namedOffenses, forbiddenRemedies);
  const evidenceRefs = evidenceRefsForFile(relativePath, signals, supportingArtifacts);
  const roadTo100 = roadTo100ForFile(relativePath, fileClass, controlEvaluations, protocolCoverage, namedOffenses, forbiddenRemedies, score);

  return {
    path: relativePath,
    sectionId,
    fileClass,
    applicableControlFamilies: controlEvaluations.map((evaluation) => evaluation.family),
    controlEvaluations,
    namedOffenses,
    forbiddenRemedies,
    blockingSignals,
    evidenceRefs,
    protocolCoverage,
    manualReviewStatus: manualReviewStatusForFile(),
    roadTo100,
    notes: notesForFile(relativePath, fileClass, signals, namedOffenses, forbiddenRemedies),
    rawScore,
    score,
    criticalityMultiplier: criticalityForInventoryPath(relativePath, fileClass),
    criticalEscalation,
  };
}

function weightedMean(entries: readonly FileAuditEntry[]): number {
  if (entries.length === 0) {
    return 100;
  }

  const totals = entries.reduce(
    (state, entry) => ({
      score: state.score + entry.score * entry.criticalityMultiplier,
      weight: state.weight + entry.criticalityMultiplier,
    }),
    { score: 0, weight: 0 },
  );

  return totals.weight === 0 ? 100 : roundScore(totals.score / totals.weight);
}

function sectionNotes(section: FullAuditSection): readonly string[] {
  const namedOffenseCounts = new Map<string, number>();
  const forbiddenCounts = new Map<string, number>();
  let filesWithFindings = 0;

  for (const file of section.files) {
    if (file.namedOffenses.length > 0 || file.forbiddenRemedies.length > 0) {
      filesWithFindings += 1;
    }
    file.namedOffenses.forEach((offense) => namedOffenseCounts.set(offense, (namedOffenseCounts.get(offense) ?? 0) + 1));
    file.forbiddenRemedies.forEach((remedy) => forbiddenCounts.set(remedy, (forbiddenCounts.get(remedy) ?? 0) + 1));
  }

  const topOffenses = [...namedOffenseCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([offense, count]) => `${offense} x${count}`);
  const topRemedies = [...forbiddenCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 2)
    .map(([remedy, count]) => `${remedy} x${count}`);

  const notes = [`${section.files.length} file(s) audited in this section with a weighted mean score of ${section.score.toFixed(2)}.`];
  if (filesWithFindings > 0) {
    notes.push(`${filesWithFindings} file(s) carry named offense or forbidden-remedy pressure.`);
  } else {
    notes.push('No named offenses or forbidden remedies were detected in this section.');
  }
  if (topOffenses.length > 0) {
    notes.push(`Top named offenses: ${topOffenses.join(', ')}.`);
  }
  if (topRemedies.length > 0) {
    notes.push(`Top forbidden remedies: ${topRemedies.join(', ')}.`);
  }

  return notes;
}

function buildFullAuditSections(
  root: string,
  findings: readonly AuditFinding[],
  supportingArtifacts: CodebaseAuditReport['supportingArtifacts'],
): readonly FullAuditSection[] {
  const coverageFiles = buildCoverageFileSet(root);
  const findingsByFile = new Map<string, AuditFinding[]>();

  for (const finding of findings) {
    const file = finding.location?.file;
    if (!file) continue;
    findingsByFile.set(file, [...(findingsByFile.get(file) ?? []), finding]);
  }

  const inventory = readInventoryFileRecords(root).map((record) =>
    buildFileEntry(record.relativePath, record.text, findingsByFile, coverageFiles, supportingArtifacts),
  );

  return hicpSectionOrder.map<FullAuditSection>((sectionId) => {
    const files = inventory.filter((file) => file.sectionId === sectionId);
    const section: FullAuditSection = {
      id: sectionId,
      title: hicpSectionTitles[sectionId],
      score: weightedMean(files),
      notes: [],
      files,
    };
    return {
      ...section,
      notes: sectionNotes(section),
    };
  });
}

function classifyFullTreePath(
  relativePath: string,
  trackedFiles: ReadonlySet<string>,
  scoredFiles: ReadonlySet<string>,
): FullTreeAccountingEntry {
  if (scoredFiles.has(relativePath)) {
    return {
      path: relativePath,
      tracked: true,
      classification: 'scored-authored',
      reason: 'Tracked authored file included by the HICP scored inventory.',
      scored: true,
    };
  }

  if (/^(reports|benchmarks|coverage)\//u.test(relativePath)) {
    return {
      path: relativePath,
      tracked: trackedFiles.has(relativePath),
      classification: 'evidence-artifact',
      reason: 'Generated evidence artifact used by audit, coverage, benchmark, or verification workflows.',
      scored: false,
    };
  }

  if (/^(?:packages\/[^/]+\/)?node_modules\//u.test(relativePath)) {
    return {
      path: relativePath,
      tracked: trackedFiles.has(relativePath),
      classification: 'excluded-vendor',
      reason: 'Vendor dependency content is accounted for but excluded from authored quality scoring.',
      scored: false,
    };
  }

  if (/^(?:packages\/[^/]+\/)?dist\//u.test(relativePath) || /\.(map|tsbuildinfo)$/u.test(relativePath)) {
    return {
      path: relativePath,
      tracked: trackedFiles.has(relativePath),
      classification: 'excluded-generated',
      reason: 'Build output or generated metadata is excluded from authored scoring.',
      scored: false,
    };
  }

  if (/^(test-results|\.vitest-attachments)\//u.test(relativePath) || /^tests\/browser\/__screenshots__\//u.test(relativePath)) {
    return {
      path: relativePath,
      tracked: trackedFiles.has(relativePath),
      classification: 'excluded-runtime-artifact',
      reason: 'Runtime execution artifact is accounted for but excluded from maintained-source scoring.',
      scored: false,
    };
  }

  return {
    path: relativePath,
    tracked: trackedFiles.has(relativePath),
    classification: 'excluded-binary-or-large',
    reason: trackedFiles.has(relativePath)
      ? 'Tracked file is outside the scored inventory policy and does not act as a first-class evidence artifact.'
      : 'Untracked local artifact outside the scored inventory and evidence-artifact policy.',
    scored: false,
  };
}

function buildFullTreeAccountingReport(root: string, scoredPaths: readonly string[]): FullTreeAccountingReport {
  const tracked = new Set(walkTrackedFiles(root));
  const scored = new Set(scoredPaths);
  const entries = walkAllFiles(root).map((relativePath) => classifyFullTreePath(relativePath, tracked, scored));
  const countsByClassification = entries.reduce<Record<FullTreeClassification, number>>(
    (counts, entry) => ({
      ...counts,
      [entry.classification]: counts[entry.classification] + 1,
    }),
    {
      'scored-authored': 0,
      'evidence-artifact': 0,
      'excluded-generated': 0,
      'excluded-vendor': 0,
      'excluded-runtime-artifact': 0,
      'excluded-binary-or-large': 0,
    },
  );

  const summary: FullTreeAccountingSummary = {
    totalFiles: entries.length,
    trackedFiles: entries.filter((entry) => entry.tracked).length,
    scoredFiles: countsByClassification['scored-authored'],
    evidenceArtifactFiles: countsByClassification['evidence-artifact'],
    excludedFiles:
      countsByClassification['excluded-generated'] +
      countsByClassification['excluded-vendor'] +
      countsByClassification['excluded-runtime-artifact'] +
      countsByClassification['excluded-binary-or-large'],
    countsByClassification,
    reconciled:
      entries.length ===
      Object.values(countsByClassification).reduce((sum, value) => sum + value, 0),
  };

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root: relativeToRoot(root, root) || '.',
    summary,
    entries,
  };
}

function protocolAreaStatus(
  entries: readonly FileProtocolCoverage[],
  area: ProtocolAreaId,
): AuditCoverageStatus {
  const statuses = entries.filter((entry) => entry.area === area).map((entry) => entry.status);
  if (statuses.some((status) => status === 'missing')) return 'missing';
  if (statuses.some((status) => status === 'partial')) return 'partial';
  if (statuses.some((status) => status === 'present')) return 'present';
  return 'not_applicable';
}

function buildProtocolGapReport(
  root: string,
  sections: readonly FullAuditSection[],
  findings: readonly AuditFinding[],
): ProtocolGapReport {
  const files = sections.flatMap((section) => section.files);
  const protocolEntries = files.flatMap((file) => file.protocolCoverage);
  const counts = (status: AuditCoverageStatus): number => protocolEntries.filter((entry) => entry.status === status).length;
  const hasRule = (rule: string): boolean => findings.some((finding) => finding.rule === rule);
  const hasPattern = (pattern: RegExp): boolean =>
    readInventoryFileRecords(root).some((record) => pattern.test(record.text));

  const areas: ProtocolGapArea[] = [
    {
      id: 'bidirectional-traceability',
      title: PROTOCOL_AREA_TITLES['bidirectional-traceability'],
      status: protocolAreaStatus(protocolEntries, 'bidirectional-traceability') === 'present' && hasPattern(/\b(REQ-|INV-|ADR-)\b/u)
        ? 'present'
        : 'partial',
      summary: hasPattern(/\b(REQ-|INV-|ADR-)\b/u)
        ? 'Requirement/invariant/decision identifiers exist in-band, but the repo still leans on advisory linkage rather than a full explicit traceability graph.'
        : 'Status docs, invariant checks, and audit artifacts exist, but stable requirement IDs and backward links remain mostly implicit.',
      evidence: [
        'docs/STATUS.md',
        'docs/AUDIT.md',
        'scripts/check-invariants.ts',
        'reports/codebase-audit.json',
      ],
      recommendations: [
        'Add stable requirement/invariant identifiers and link them to proving artifacts.',
        'Extend docs and audit output with explicit backward links from artifact to requirement.',
      ],
    },
    {
      id: 'flow-verification',
      title: PROTOCOL_AREA_TITLES['flow-verification'],
      status: !hasRule('orphan-export-candidate') && hasPattern(/\b(astro-edge-pipeline|runtime-wiring-invariants|compositor-pipeline)\b/u)
        ? 'partial'
        : 'missing',
      summary: !hasRule('orphan-export-candidate')
        ? 'The repo has integration wiring tests and zero active orphan findings, but it still lacks a named flow registry with explicit step-by-step contract traces.'
        : 'Active orphan/wiring signals still weaken confidence in end-to-end flow verification.',
      evidence: [
        'tests/integration/astro-edge-pipeline.test.ts',
        'tests/integration/compositor-pipeline.test.ts',
        'tests/unit/runtime-wiring-invariants.test.ts',
      ],
      recommendations: [
        'Introduce a named production-flow matrix with entrypoint, intermediate steps, and terminal artifact coverage.',
        'Promote mounted middleware, producer/consumer, and caller-existence checks into first-class flow assertions.',
      ],
    },
    {
      id: 'test-honesty',
      title: PROTOCOL_AREA_TITLES['test-honesty'],
      status: files.some((file) => file.blockingSignals.includes('shadow-test-risk')) ? 'missing' : counts('partial') > 0 ? 'partial' : 'present',
      summary: files.some((file) => file.blockingSignals.includes('shadow-test-risk'))
        ? 'One or more tests still show shadow-test risk.'
        : counts('partial') > 0
          ? 'Production imports and assertion coverage are generally present, but several files still rely on weaker heuristics or partial evidence.'
          : 'Current tests strongly couple to production code with no active shadow-test signal.',
      evidence: [
        'scripts/audit/report.ts',
        'tests/unit/codebase-audit.test.ts',
        'tests/unit/runtime-wiring-invariants.test.ts',
      ],
      recommendations: [
        'Keep shrinking weak assertion counts and surface test honesty directly in the audit strike list.',
        'Add stronger content assertions where tests currently only prove shape, count, or existence.',
      ],
    },
    {
      id: 'semantic-consistency',
      title: PROTOCOL_AREA_TITLES['semantic-consistency'],
      status:
        files.some((file) => file.forbiddenRemedies.length > 0 || file.namedOffenses.includes('Polite Downgrade'))
          ? 'partial'
          : 'present',
      summary:
        files.some((file) => file.forbiddenRemedies.length > 0 || file.namedOffenses.includes('Polite Downgrade'))
          ? 'The audit now surfaces downgrade, fallback, and type-erasure risk per file, but the repo still has concrete semantic debt to retire.'
          : 'No active downgrade or semantic-regression signals remain in the scored inventory.',
      evidence: [
        'reports/codebase-audit.json',
        'scripts/audit/integrity.ts',
        'scripts/audit/report.ts',
      ],
      recommendations: [
        'Retire files carrying type erasure, fallback laundering, and constant-return pressure.',
        'Continue promoting semantic checks from advisory signals into explicit proving artifacts.',
      ],
    },
    {
      id: 'proof-inventory',
      title: PROTOCOL_AREA_TITLES['proof-inventory'],
      status:
        hasPattern(/\b(metamorphic|mutation|compile-fail)\b/iu) && hasPattern(/\b(lineariz|retry|replay|scheduler|security)\b/iu)
          ? 'partial'
          : 'missing',
      summary:
        hasPattern(/\b(lineariz|retry|replay|scheduler|security)\b/iu)
          ? 'The repo has concurrency, replay, telemetry, and integrity proof surfaces, but mutation/metamorphic/compile-fail evidence is still thin.'
          : 'Proof inventory is missing several explicit evidence classes called for by the protocol.',
      evidence: [
        'tests/property/',
        'tests/e2e/',
        'scripts/feedback-verify.ts',
        'scripts/check-invariants.ts',
      ],
      recommendations: [
        'Add explicit mutation/metamorphic/compile-fail inventory rows, even when coverage is currently absent.',
        'Track proof-class presence by subsystem so missing evidence stays visible.',
      ],
    },
  ];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root: relativeToRoot(root, root) || '.',
    areas,
  };
}

function buildFrameworkBlueprintReport(root: string): FrameworkBlueprintReport {
  const definitions: readonly FrameworkCapabilityDefinition[] = [
    {
      id: 'runtime-vite-centered-delivery',
      group: 'runtime',
      title: 'Vite-centered delivery model',
      status: 'present',
      summary: 'czap already ships as a Vite plugin plus Astro integration rather than as a monolithic standalone CLI runtime.',
      evidence: ['packages/vite/src/plugin.ts', 'packages/astro/src/integration.ts', 'README.md'],
      recommendation: 'no_action',
    },
    {
      id: 'runtime-backend-agnostic-fullstack-unifier',
      group: 'runtime',
      title: 'Backend-agnostic full-stack unifier',
      status: 'absent',
      summary: 'The repo is a rendering/runtime framework, not a Hono-style full-stack app framework spanning multiple UI libraries and backend adapters.',
      evidence: ['README.md', 'docs/ARCHITECTURE.md'],
      recommendation: 'documentation_clarification',
    },
    {
      id: 'runtime-plugin-as-framework-sidecar',
      group: 'runtime',
      title: 'Plugin-as-a-framework sidecar adoption',
      status: 'partial',
      summary: 'The Vite/Astro packages support sidecar-style adoption for rendering concerns, but not the full application/backend framework surface envisioned in the blueprint.',
      evidence: ['packages/vite/src/index.ts', 'packages/astro/src/index.ts'],
      recommendation: 'architecture_hardening',
    },
    {
      id: 'web-request-response-surface',
      group: 'web',
      title: 'Native Request/Response surface',
      status: 'present',
      summary: 'The edge and Astro middleware path already operates on standard Request/Response and Headers primitives.',
      evidence: ['packages/astro/src/middleware.ts', 'packages/edge/src/host-adapter.ts'],
      recommendation: 'no_action',
    },
    {
      id: 'web-hono-standardized-routing',
      group: 'web',
      title: 'Hono-standardized routing core',
      status: 'absent',
      summary: 'No Hono-based routing layer exists in the repo today.',
      evidence: ['package.json', 'packages/astro/src/middleware.ts'],
      recommendation: 'documentation_clarification',
    },
    {
      id: 'edge-kv-bindings',
      group: 'edge',
      title: 'Integrated edge KV/binding story',
      status: 'present',
      summary: 'KV-backed edge caching and request-time adaptation are already first-class surfaces.',
      evidence: ['packages/edge/src/kv-cache.ts', 'packages/edge/src/host-adapter.ts', 'docs/STATUS.md'],
      recommendation: 'no_action',
    },
    {
      id: 'edge-orm-storage-queues',
      group: 'edge',
      title: 'Integrated ORM/storage/queue stack',
      status: 'absent',
      summary: 'The repo does not currently ship Drizzle/D1, blob storage, queues, or cron abstractions as built-in runtime surfaces.',
      evidence: ['package.json', 'packages/edge/src/index.ts'],
      recommendation: 'new_runtime_work',
    },
    {
      id: 'component-local-data-loading',
      group: 'component',
      title: 'Component-local data loading',
      status: 'partial',
      summary: 'Streaming/session runtimes exist, but there is no general component-loader abstraction comparable to Suspense loaders across the framework.',
      evidence: ['packages/astro/src/runtime/stream.ts', 'packages/astro/src/runtime/llm-session.ts'],
      recommendation: 'architecture_hardening',
    },
    {
      id: 'rpc-server-actions',
      group: 'component',
      title: 'RPC / server-action mutation surface',
      status: 'absent',
      summary: 'No typed RPC or server-action layer is present as a first-class package capability.',
      evidence: ['README.md', 'packages/astro/src/index.ts'],
      recommendation: 'new_runtime_work',
    },
    {
      id: 'platform-runtime-coupling',
      group: 'platform',
      title: 'Intentional platform/runtime coupling',
      status: 'partial',
      summary: 'The docs discuss Cloudflare-style edge execution, but the actual interfaces stay intentionally generic rather than locking into one vendor runtime.',
      evidence: ['docs/ARCHITECTURE.md', 'packages/edge/src/kv-cache.ts', 'packages/astro/src/middleware.ts'],
      recommendation: 'documentation_clarification',
    },
    {
      id: 'feature-zero-config-auth',
      group: 'features',
      title: 'Zero-config authentication',
      status: 'absent',
      summary: 'No authentication/session layer exists in the current package set.',
      evidence: ['package.json', 'README.md'],
      recommendation: 'new_runtime_work',
    },
    {
      id: 'feature-workerd-optimization',
      group: 'features',
      title: 'Workerd/edge-first optimization',
      status: 'partial',
      summary: 'The repo is edge-aware and Cloudflare-conscious, but it is not yet a first-party Workerd framework with platform-owned runtime contracts.',
      evidence: ['docs/ARCHITECTURE.md', 'packages/edge/src/client-hints.ts'],
      recommendation: 'architecture_hardening',
    },
    {
      id: 'feature-stateful-edge-ai',
      group: 'features',
      title: 'Stateful edge AI bindings',
      status: 'partial',
      summary: 'AI manifests and LLM streaming runtimes exist, but there is no durable-object-style stateful edge AI substrate.',
      evidence: ['packages/compiler/src/ai-manifest.ts', 'packages/astro/src/runtime/llm.ts', 'packages/web/src/stream/llm-adapter.ts'],
      recommendation: 'architecture_hardening',
    },
    {
      id: 'feature-native-task-queues',
      group: 'features',
      title: 'Native task queues and cron',
      status: 'absent',
      summary: 'No queue/cron abstraction is currently exposed as a repo-native package surface.',
      evidence: ['README.md', 'package.json'],
      recommendation: 'new_runtime_work',
    },
  ];

  const capabilities: FrameworkBlueprintCapability[] = definitions.map((definition) => ({
    ...definition,
    group: FRAMEWORK_CAPABILITY_GROUPS[definition.group],
  }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root: relativeToRoot(root, root) || '.',
    capabilities,
  };
}

function buildAuditStrikeBoardReport(
  root: string,
  sections: readonly FullAuditSection[],
  framework: FrameworkBlueprintReport,
): AuditStrikeBoardReport {
  const fileItems: AuditStrikeItem[] = sections
    .flatMap((section) => section.files)
    .filter((file) => file.score < 100)
    .sort((left, right) => left.score - right.score || left.path.localeCompare(right.path))
    .slice(0, 20)
    .map((file) => ({
      kind: 'file',
      id: file.path,
      title: file.path,
      score: file.score,
      rationale:
        file.roadTo100[0] ??
        (file.notes[0] ?? 'File sits below 100 and still carries measurable remediation debt.'),
      evidence: [
        ...file.blockingSignals.slice(0, 3),
        ...file.evidenceRefs.slice(0, 3).map((ref) => `${ref.kind}:${ref.ref}`),
      ],
      nextMoves: file.roadTo100.slice(0, 3),
    }));

  const architectureItems: AuditStrikeItem[] = framework.capabilities
    .filter((capability) => capability.status === 'partial' || capability.status === 'absent')
    .slice(0, 10)
    .map((capability) => ({
      kind: 'architecture',
      id: capability.id,
      title: capability.title,
      score: capability.status === 'absent' ? 25 : 55,
      rationale: capability.summary,
      evidence: capability.evidence,
      nextMoves: [
        capability.recommendation === 'new_runtime_work'
          ? 'Consider new package/runtime work if this capability is strategically in-scope.'
          : capability.recommendation === 'architecture_hardening'
            ? 'Harden the current architecture before expanding the public promise.'
            : 'Clarify scope and non-goals in docs so this gap is intentional, not ambiguous.',
      ],
    }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root: relativeToRoot(root, root) || '.',
    items: [...fileItems, ...architectureItems].sort((left, right) => left.score - right.score || left.title.localeCompare(right.title)),
  };
}

function renderFullTreeAccountingMarkdown(report: FullTreeAccountingReport): string {
  const lines = [
    '# Full-Tree Accounting',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `- Total files on disk: ${report.summary.totalFiles}`,
    `- Tracked files: ${report.summary.trackedFiles}`,
    `- Scored authored files: ${report.summary.scoredFiles}`,
    `- Evidence artifacts: ${report.summary.evidenceArtifactFiles}`,
    `- Excluded files: ${report.summary.excludedFiles}`,
    `- Reconciled: ${report.summary.reconciled ? 'yes' : 'no'}`,
    '',
    '| classification | count |',
    '| --- | ---: |',
  ];

  for (const [classification, count] of Object.entries(report.summary.countsByClassification)) {
    lines.push(`| ${classification} | ${count} |`);
  }

  lines.push('', '## Sample Entries', '', '| path | classification | tracked | scored | reason |', '| --- | --- | --- | --- | --- |');

  for (const entry of report.entries.slice(0, 40)) {
    lines.push(`| ${escapeCell(entry.path)} | ${entry.classification} | ${entry.tracked ? 'yes' : 'no'} | ${entry.scored ? 'yes' : 'no'} | ${escapeCell(entry.reason)} |`);
  }

  return lines.join('\n');
}

function renderProtocolGapMarkdown(report: ProtocolGapReport): string {
  const lines = [
    '# Protocol Gap Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '| area | status | summary | evidence | recommendations |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const area of report.areas) {
    lines.push(
      `| ${escapeCell(area.title)} | ${area.status} | ${escapeCell(area.summary)} | ${escapeCell(area.evidence.join('; '))} | ${escapeCell(area.recommendations.join('; '))} |`,
    );
  }

  return lines.join('\n');
}

function renderFrameworkBlueprintMarkdown(report: FrameworkBlueprintReport): string {
  const lines = [
    '# Framework Blueprint Delta',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '| group | capability | status | recommendation | summary | evidence |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const capability of report.capabilities) {
    lines.push(
      `| ${escapeCell(capability.group)} | ${escapeCell(capability.title)} | ${capability.status} | ${capability.recommendation} | ${escapeCell(capability.summary)} | ${escapeCell(capability.evidence.join('; '))} |`,
    );
  }

  return lines.join('\n');
}

function renderStrikeBoardMarkdown(report: AuditStrikeBoardReport): string {
  const lines = [
    '# Audit Strike Board',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '| kind | title | score | rationale | evidence | next moves |',
    '| --- | --- | ---: | --- | --- | --- |',
  ];

  for (const item of report.items) {
    lines.push(
      `| ${item.kind} | ${escapeCell(item.title)} | ${item.score.toFixed(2)} | ${escapeCell(item.rationale)} | ${escapeCell(item.evidence.join('; '))} | ${escapeCell(item.nextMoves.join('; '))} |`,
    );
  }

  return lines.join('\n');
}

export interface AuditArtifactBundle {
  readonly codebase: CodebaseAuditReport;
  readonly fullTreeAccounting: FullTreeAccountingReport;
  readonly protocolGap: ProtocolGapReport;
  readonly frameworkBlueprintDelta: FrameworkBlueprintReport;
  readonly strikeBoard: AuditStrikeBoardReport;
}

export function buildAuditArtifactBundle(options: BuildReportOptions = {}): AuditArtifactBundle {
  const root = options.root ?? repoRoot;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const context = ensureArtifactContext(root);
  const structure = runStructureAudit(root);
  const integrity = runIntegrityAudit(root);
  const surface = runSurfaceAudit(root);

  const supportingArtifacts = {
    invariants: buildInvariantStatus(root),
    coverage: buildCoverageStatus(root),
    benchmarks: buildBenchStatus(root),
    runtimeSeams: buildRuntimeSeamsStatus(root),
  } as const;

  const support = partitionAllowlistedFindings(supportingFindings(root, supportingArtifacts));

  const findings = sortFindings([
    ...structure.findings,
    ...integrity.findings,
    ...surface.findings,
    ...support.findings,
  ]);
  const suppressed = sortSuppressions([
    ...structure.suppressed,
    ...integrity.suppressed,
    ...surface.suppressed,
    ...support.suppressed,
  ]);
  const sections = buildFullAuditSections(root, findings, supportingArtifacts);
  const fullTreeAccounting = buildFullTreeAccountingReport(root, sections.flatMap((section) => section.files.map((file) => file.path)));
  const protocolGap = buildProtocolGapReport(root, sections, findings);
  const frameworkBlueprintDelta = buildFrameworkBlueprintReport(root);
  const strikeBoard = buildAuditStrikeBoardReport(root, sections, frameworkBlueprintDelta);

  const codebase: CodebaseAuditReport = {
    schemaVersion: 2,
    generatedAt,
    gauntletRunId: context.gauntletRunId,
    sourceFingerprint: context.sourceFingerprint,
    environmentFingerprint: context.environmentFingerprint,
    expectedCounts: context.expectedCounts,
    advisory: true,
    root: relativeToRoot(root, root) || '.',
    counts: createCounts(findings),
    structure,
    integrity,
    surface,
    supportingArtifacts,
    fullTreeAccounting: fullTreeAccounting.summary,
    protocolGap: {
      present: protocolGap.areas.filter((area) => area.status === 'present').length,
      partial: protocolGap.areas.filter((area) => area.status === 'partial').length,
      missing: protocolGap.areas.filter((area) => area.status === 'missing').length,
      notApplicable: protocolGap.areas.filter((area) => area.status === 'not_applicable').length,
    },
    frameworkBlueprintDelta: {
      present: frameworkBlueprintDelta.capabilities.filter((capability) => capability.status === 'present').length,
      partial: frameworkBlueprintDelta.capabilities.filter((capability) => capability.status === 'partial').length,
      absent: frameworkBlueprintDelta.capabilities.filter((capability) => capability.status === 'absent').length,
      outOfScope: frameworkBlueprintDelta.capabilities.filter((capability) => capability.status === 'out_of_scope').length,
    },
    strikeBoard: {
      totalItems: strikeBoard.items.length,
      topItemTitle: strikeBoard.items[0]?.title ?? null,
    },
    inventoryCount: sections.reduce((sum, section) => sum + section.files.length, 0),
    aggregateScore: weightedMean(sections.flatMap((section) => section.files)),
    sections,
    findings,
    suppressed,
  };

  return {
    codebase,
    fullTreeAccounting: {
      ...fullTreeAccounting,
      generatedAt,
    },
    protocolGap: {
      ...protocolGap,
      generatedAt,
    },
    frameworkBlueprintDelta: {
      ...frameworkBlueprintDelta,
      generatedAt,
    },
    strikeBoard: {
      ...strikeBoard,
      generatedAt,
    },
  };
}

export function buildCodebaseAuditReport(options: BuildReportOptions = {}): CodebaseAuditReport {
  return buildAuditArtifactBundle(options).codebase;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

export function renderCodebaseAuditMarkdown(report: CodebaseAuditReport): string {
  const lines = [
    '# Full-Repo HICP Audit',
    '',
    `Generated: ${report.generatedAt}`,
    'Rubric note: scores are weighted 100-point HICP evaluations with explicit applicability per file class. Named offenses and forbidden remedies cap file scores even when other signals are healthy.',
    '',
    '## Scoring Method',
    '',
    '- File scores use 0 / 0.5 / 1 control-family judgments, normalized to 0-100 by file-class weights.',
    '- Caps: forbidden remedies cap at 39, named offenses cap at 59, and critical escalations cap at 19.',
    `- Rollups use file criticality multipliers and currently cover ${report.inventoryCount} included files.`,
    '',
    '## Inventory Policy',
    '',
    '- Source of truth: `git ls-files` when available, with a filesystem fallback for non-git fixtures.',
    '- Included: authored text/config/spec/source files across packages, crates, tests, scripts, docs, examples, repo root, and CI/devops.',
    '- Excluded: generated outputs, dist, node_modules, coverage, reports, benchmarks, test-results, vitest attachments, browser screenshots, `*.map`, `*.tsbuildinfo`, and e2e fixture assets.',
    '',
    '## Extended Reports',
    '',
    `- Full-tree accounting: ${report.fullTreeAccounting.totalFiles} files on disk, ${report.fullTreeAccounting.scoredFiles} scored authored files, ${report.fullTreeAccounting.evidenceArtifactFiles} evidence artifacts.`,
    `- Protocol gap summary: ${report.protocolGap.present} present, ${report.protocolGap.partial} partial, ${report.protocolGap.missing} missing.`,
    `- Framework delta summary: ${report.frameworkBlueprintDelta.present} present, ${report.frameworkBlueprintDelta.partial} partial, ${report.frameworkBlueprintDelta.absent} absent.`,
    `- Strike board items: ${report.strikeBoard.totalItems}${report.strikeBoard.topItemTitle ? `, top item "${report.strikeBoard.topItemTitle}"` : ''}.`,
    '',
  ];

  for (const section of report.sections) {
    lines.push(`## ${section.title}`, '');
    lines.push(`Section score: ${section.score.toFixed(2)}`, '');
    section.notes.forEach((note) => lines.push(`- ${note}`));
    lines.push('', '| path | file class | applicable control families | score | manual review | blocking signals | road to 100 | named offenses | forbidden remedies | notes |');
    lines.push('| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |');

    for (const file of section.files) {
      lines.push(
        `| ${escapeCell(file.path)} | ${escapeCell(file.fileClass)} | ${escapeCell(file.applicableControlFamilies.join('; '))} | ${file.score.toFixed(2)} | ${file.manualReviewStatus} | ${escapeCell(file.blockingSignals.join('; ') || 'None')} | ${escapeCell(file.roadTo100.join('; ') || 'Already at 100')} | ${escapeCell(file.namedOffenses.join('; ') || 'None')} | ${escapeCell(file.forbiddenRemedies.join('; ') || 'None')} | ${escapeCell(file.notes.join('; '))} |`,
      );
    }

    lines.push('');
  }

  lines.push(report.aggregateScore.toFixed(2));
  return lines.join('\n');
}

function main(): void {
  const bundle = buildAuditArtifactBundle();
  const report = bundle.codebase;
  const jsonPath = resolveReportPath(repoRoot, reportPaths.json);
  const markdownPath = resolveReportPath(repoRoot, reportPaths.markdown);
  const fullTreeJsonPath = resolveReportPath(repoRoot, reportPaths.fullTreeJson);
  const fullTreeMarkdownPath = resolveReportPath(repoRoot, reportPaths.fullTreeMarkdown);
  const protocolGapJsonPath = resolveReportPath(repoRoot, reportPaths.protocolGapJson);
  const protocolGapMarkdownPath = resolveReportPath(repoRoot, reportPaths.protocolGapMarkdown);
  const frameworkDeltaJsonPath = resolveReportPath(repoRoot, reportPaths.frameworkDeltaJson);
  const frameworkDeltaMarkdownPath = resolveReportPath(repoRoot, reportPaths.frameworkDeltaMarkdown);
  const strikeBoardJsonPath = resolveReportPath(repoRoot, reportPaths.strikeBoardJson);
  const strikeBoardMarkdownPath = resolveReportPath(repoRoot, reportPaths.strikeBoardMarkdown);
  writeTextFile(jsonPath, JSON.stringify(report, null, 2));
  writeTextFile(markdownPath, renderCodebaseAuditMarkdown(report));
  // The full tree walks every file on disk including node_modules and pnpm
  // store mirrors, which on a fully-installed checkout exceeds 2M files. The
  // entries array would balloon JSON.stringify past V8's max-string limit and
  // crash the audit. Tests consume `summary.*` only; the markdown render
  // already takes the first 40 entries as evidence. Truncate entries in the
  // serialized JSON to a small sample with a note for human readers, and keep
  // the in-memory bundle intact for the markdown render below.
  const FULL_TREE_ENTRY_SAMPLE = 200;
  const totalEntries = bundle.fullTreeAccounting.entries.length;
  const fullTreeForJson =
    totalEntries > FULL_TREE_ENTRY_SAMPLE
      ? {
          ...bundle.fullTreeAccounting,
          entries: bundle.fullTreeAccounting.entries.slice(0, FULL_TREE_ENTRY_SAMPLE),
          entriesNote: `Sample of ${FULL_TREE_ENTRY_SAMPLE} of ${totalEntries} entries. Full counts are in summary.countsByClassification.`,
        }
      : bundle.fullTreeAccounting;
  writeTextFile(fullTreeJsonPath, JSON.stringify(fullTreeForJson, null, 2));
  writeTextFile(fullTreeMarkdownPath, renderFullTreeAccountingMarkdown(bundle.fullTreeAccounting));
  writeTextFile(protocolGapJsonPath, JSON.stringify(bundle.protocolGap, null, 2));
  writeTextFile(protocolGapMarkdownPath, renderProtocolGapMarkdown(bundle.protocolGap));
  writeTextFile(frameworkDeltaJsonPath, JSON.stringify(bundle.frameworkBlueprintDelta, null, 2));
  writeTextFile(frameworkDeltaMarkdownPath, renderFrameworkBlueprintMarkdown(bundle.frameworkBlueprintDelta));
  writeTextFile(strikeBoardJsonPath, JSON.stringify(bundle.strikeBoard, null, 2));
  writeTextFile(strikeBoardMarkdownPath, renderStrikeBoardMarkdown(bundle.strikeBoard));
  console.log(
    `audit report: ${report.counts.error} error(s), ${report.counts.warning} warning(s), ${report.counts.info} info finding(s), ${report.suppressed.length} suppressed, inventory ${report.inventoryCount}, aggregate ${report.aggregateScore.toFixed(2)}`,
  );
  console.log(`wrote ${relativeToRoot(jsonPath)}`);
  console.log(`wrote ${relativeToRoot(markdownPath)}`);
  console.log(`wrote ${relativeToRoot(fullTreeJsonPath)}`);
  console.log(`wrote ${relativeToRoot(fullTreeMarkdownPath)}`);
  console.log(`wrote ${relativeToRoot(protocolGapJsonPath)}`);
  console.log(`wrote ${relativeToRoot(protocolGapMarkdownPath)}`);
  console.log(`wrote ${relativeToRoot(frameworkDeltaJsonPath)}`);
  console.log(`wrote ${relativeToRoot(frameworkDeltaMarkdownPath)}`);
  console.log(`wrote ${relativeToRoot(strikeBoardJsonPath)}`);
  console.log(`wrote ${relativeToRoot(strikeBoardMarkdownPath)}`);

  const hasFailedSupportingArtifact = Object.values(report.supportingArtifacts).some((artifact) => artifact.status === 'failed');
  if (hasFailedSupportingArtifact) {
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  main();
}

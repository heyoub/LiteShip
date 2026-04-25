import type { CodebaseAuditReport } from './types.js';

export const CODEBASE_AUDIT_SCHEMA_VERSION = 2;

export type CodebaseAuditRuntimeSeamsStatus = CodebaseAuditReport['supportingArtifacts']['runtimeSeams']['status'];

export interface CodebaseAuditArtifactEnvelope {
  readonly schemaVersion?: number;
  readonly generatedAt?: string;
  readonly gauntletRunId?: string;
  readonly sourceFingerprint?: string;
  readonly environmentFingerprint?: string;
  readonly expectedCounts?: Record<string, number>;
  readonly counts?: Partial<CodebaseAuditReport['counts']>;
  readonly supportingArtifacts?: {
    readonly runtimeSeams?: {
      readonly status?: CodebaseAuditRuntimeSeamsStatus;
    };
  };
}

export function hasCurrentCodebaseAuditSchema(audit: CodebaseAuditArtifactEnvelope): boolean {
  return audit.schemaVersion === CODEBASE_AUDIT_SCHEMA_VERSION;
}

export function hasCodebaseAuditCounts(audit: CodebaseAuditArtifactEnvelope): boolean {
  return (
    typeof audit.counts?.error === 'number' &&
    typeof audit.counts?.warning === 'number' &&
    typeof audit.counts?.info === 'number'
  );
}

export function getCodebaseAuditRuntimeSeamsStatus(
  audit: CodebaseAuditArtifactEnvelope,
): CodebaseAuditRuntimeSeamsStatus | null {
  const status = audit.supportingArtifacts?.runtimeSeams?.status;
  return status === 'present' || status === 'missing' || status === 'failed' ? status : null;
}

export function hasCodebaseAuditRuntimeSeamsStatus(audit: CodebaseAuditArtifactEnvelope): boolean {
  return getCodebaseAuditRuntimeSeamsStatus(audit) !== null;
}

// Thin re-export hub. All logic lives in the focused modules below.
// External consumers (scripts, tests) import from this file unchanged.

export type {
  MetricKey,
  MetricSummary,
  SampleSummary,
  FileArtifactMetadata,
  CoverageTotals,
  CoverageHotspot,
  CoverageMetaArtifact,
  CoverageFacts,
  RuntimeSeamPairSummary,
  BenchArtifact,
  BenchFacts,
  StartupRealityFacts,
  StartupRealityArtifact,
  RuntimeSeamsSourceArtifact,
  RuntimeSeamsIntegrityCheck,
  RuntimeSeamsReportArtifact,
  RuntimeSeamsVerification,
  FeedbackVerification,
} from './artifact-types.js';

export {
  buildCoveragePolicyFingerprint,
  fingerprintFile,
  buildCoverageFacts,
  buildBenchFacts,
  buildStartupRealityFacts,
  buildExpectedBenchStability,
  buildExpectedPairedTruth,
  buildCoverageMetaArtifact,
  createRuntimeSeamsSourceArtifacts,
} from './artifact-builders.js';

export {
  verifyRuntimeSeamsReport,
  verifyFeedbackArtifacts,
} from './artifact-verifiers.js';

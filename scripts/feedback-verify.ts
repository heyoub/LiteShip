import { repoRoot } from '../vitest.shared.js';
import { verifyFeedbackArtifacts } from './artifact-integrity.js';
import { isDirectExecution } from './audit/shared.js';

export function runFeedbackVerify(root = repoRoot): void {
  const verification = verifyFeedbackArtifacts(root);
  for (const check of verification.checks) {
    console.log(`${check.passed ? 'OK' : 'FAIL'} ${check.code}: ${check.summary}`);
  }

  if (!verification.passed) {
    throw new Error('Feedback integrity verification failed.');
  }

  console.log('Feedback integrity verification passed.');
}

if (isDirectExecution(import.meta.url)) {
  runFeedbackVerify();
}

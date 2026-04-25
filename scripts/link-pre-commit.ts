import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const gitHooksDir = resolve(repoRoot, '.git', 'hooks');
const source = resolve(repoRoot, 'scripts', 'pre-commit.sh');
const target = resolve(gitHooksDir, 'pre-commit');

if (!existsSync(resolve(repoRoot, '.git')) || !existsSync(source)) {
  process.exit(0);
}

mkdirSync(gitHooksDir, { recursive: true });
copyFileSync(source, target);

try {
  chmodSync(target, 0o755);
} catch {
  // Best-effort on Windows.
}

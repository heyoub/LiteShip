import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import ts from 'typescript';
import { auditIgnoreGlobs, auditSourceGlobs, findAllowlistReason, matchesHicpInventory, normalizeRepoPath } from './policy.js';
import type { AuditCounts, AuditFinding, AuditSeverity, AuditSuppression } from './types.js';

export interface PackageManifestInfo {
  readonly name: string;
  readonly dir: string;
  readonly relativeDir: string;
  readonly srcDir: string;
  readonly packageJsonPath: string;
  readonly dependencies: readonly string[];
  readonly exports: Record<string, unknown>;
}

export interface SourceFileRecord {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly text: string;
  readonly sourceFile: ts.SourceFile;
  readonly packageName: string | null;
}

export interface InventoryFileRecord {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly text: string;
}

export const repoRoot = normalizeRepoPath(resolve(import.meta.dirname, '..', '..'));

export function isDirectExecution(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return moduleUrl === pathToFileURL(entry).href;
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

export function writeTextFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, filePath);
}

export function walkAuditSourceFiles(root = repoRoot): readonly string[] {
  return fg
    .sync(auditSourceGlobs as readonly string[], {
      cwd: root,
      absolute: true,
      onlyFiles: true,
      ignore: auditIgnoreGlobs as readonly string[],
    })
    .map((file) => normalizeRepoPath(file))
    .sort((a, b) => a.localeCompare(b));
}

function walkTrackedFilesWithGit(root: string): readonly string[] {
  const output = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  return output
    .split(/\r?\n/u)
    .map((line) => normalizeRepoPath(line.trim()))
    .filter((line) => line.length > 0);
}

function walkTrackedFilesWithGlob(root: string): readonly string[] {
  return fg
    .sync(['**/*'], {
      cwd: root,
      absolute: false,
      onlyFiles: true,
      dot: true,
      ignore: auditIgnoreGlobs as readonly string[],
    })
    .map((file) => normalizeRepoPath(file))
    .sort((a, b) => a.localeCompare(b));
}

export function walkAllFiles(root = repoRoot): readonly string[] {
  return fg
    .sync(['**/*'], {
      cwd: root,
      absolute: false,
      onlyFiles: true,
      dot: true,
    })
    .map((file) => normalizeRepoPath(file))
    .sort((a, b) => a.localeCompare(b));
}

export function walkTrackedFiles(root = repoRoot): readonly string[] {
  try {
    return walkTrackedFilesWithGit(root);
  } catch {
    return walkTrackedFilesWithGlob(root);
  }
}

export function walkHicpInventoryFiles(root = repoRoot): readonly string[] {
  const tracked = walkTrackedFiles(root);

  return tracked.filter((relativePath) => matchesHicpInventory(relativePath));
}

export function listPackageManifests(root = repoRoot): readonly PackageManifestInfo[] {
  const packageJsons = fg
    .sync(['packages/*/package.json'], {
      cwd: root,
      absolute: true,
      onlyFiles: true,
    })
    .map((file) => normalizeRepoPath(file))
    .sort((a, b) => a.localeCompare(b));

  return packageJsons.map((packageJsonPath) => {
    const manifest = readJsonFile<{
      name: string;
      exports?: Record<string, unknown>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    }>(packageJsonPath);
    const dir = normalizeRepoPath(dirname(packageJsonPath));
    const relativeDir = normalizeRepoPath(relative(root, dir));
    const dependencies = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ].sort((a, b) => a.localeCompare(b));

    return {
      name: manifest.name,
      dir,
      relativeDir,
      srcDir: `${dir}/src`,
      packageJsonPath: normalizeRepoPath(relative(root, packageJsonPath)),
      dependencies,
      exports: manifest.exports ?? {},
    };
  });
}

export function readSourceFileRecords(root = repoRoot): readonly SourceFileRecord[] {
  const packageInfos = listPackageManifests(root);
  const packageBySrcDir = new Map(packageInfos.map((pkg) => [pkg.srcDir, pkg.name] as const));

  return walkAuditSourceFiles(root).map((absolutePath) => {
    const relativePath = normalizeRepoPath(relative(root, absolutePath));
    const text = readFileSync(absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      absolutePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      absolutePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const packageName =
      [...packageBySrcDir.entries()].find(([srcDir]) => normalizeRepoPath(absolutePath).startsWith(srcDir + '/'))?.[1] ?? null;

    return {
      absolutePath,
      relativePath,
      text,
      sourceFile,
      packageName,
    };
  });
}

export function readInventoryFileRecords(root = repoRoot): readonly InventoryFileRecord[] {
  return walkHicpInventoryFiles(root).map((relativePath) => {
    const absolutePath = normalizeRepoPath(resolve(root, relativePath));
    return {
      absolutePath,
      relativePath,
      text: readFileSync(absolutePath, 'utf8'),
    };
  });
}

export function createCounts(findings: readonly AuditFinding[]): AuditCounts {
  return findings.reduce<AuditCounts>(
    (counts, finding) => ({
      error: counts.error + (finding.severity === 'error' ? 1 : 0),
      warning: counts.warning + (finding.severity === 'warning' ? 1 : 0),
      info: counts.info + (finding.severity === 'info' ? 1 : 0),
    }),
    { error: 0, warning: 0, info: 0 },
  );
}

export function compareSeverity(a: AuditSeverity, b: AuditSeverity): number {
  const order: Record<AuditSeverity, number> = { error: 0, warning: 1, info: 2 };
  return order[a] - order[b];
}

export function sortFindings<T extends AuditFinding>(findings: readonly T[]): T[] {
  return [...findings].sort((left, right) => {
    const severity = compareSeverity(left.severity, right.severity);
    if (severity !== 0) return severity;
    const leftFile = left.location?.file ?? '';
    const rightFile = right.location?.file ?? '';
    const fileCmp = leftFile.localeCompare(rightFile);
    if (fileCmp !== 0) return fileCmp;
    return left.id.localeCompare(right.id);
  });
}

export function sortSuppressions<T extends AuditSuppression>(suppressions: readonly T[]): T[] {
  return [...suppressions].sort((left, right) => left.finding.id.localeCompare(right.finding.id));
}

export function partitionAllowlistedFindings(findings: readonly AuditFinding[]): {
  readonly findings: AuditFinding[];
  readonly suppressed: AuditSuppression[];
} {
  const active: AuditFinding[] = [];
  const suppressed: AuditSuppression[] = [];

  for (const finding of findings) {
    const reason = findAllowlistReason(finding);
    if (reason) {
      suppressed.push({
        rule: finding.rule,
        reason,
        finding,
      });
      continue;
    }
    active.push(finding);
  }

  return {
    findings: sortFindings(active),
    suppressed: sortSuppressions(suppressed),
  };
}

export function nodeText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile);
}

export function lineAndColumn(sourceFile: ts.SourceFile, position: number): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
  return {
    line: line + 1,
    column: character + 1,
  };
}

export function relativeToRoot(filePath: string, root = repoRoot): string {
  return normalizeRepoPath(relative(root, filePath));
}

export function isSimpleDefaultExpression(node: ts.Expression): boolean {
  return (
    ts.isArrayLiteralExpression(node) ||
    ts.isObjectLiteralExpression(node) ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isNumericLiteral(node) ||
    ts.isStringLiteral(node) ||
    (ts.isIdentifier(node) && node.text === 'undefined')
  );
}

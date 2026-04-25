import ts from 'typescript';
import {
  createCounts,
  isDirectExecution,
  isSimpleDefaultExpression,
  lineAndColumn,
  nodeText,
  partitionAllowlistedFindings,
  readSourceFileRecords,
  repoRoot,
  writeTextFile,
} from './shared.js';
import { reportPaths } from './policy.js';
import type { AuditFinding, AuditSectionResult } from './types.js';

export interface IntegritySummary {
  readonly runtimeFileCount: number;
  readonly stubCount: number;
  readonly missingCapabilityCount: number;
  readonly fallbackCount: number;
  readonly consoleCount: number;
  readonly placeholderCount: number;
  readonly reimplementationCount: number;
}

const PLACEHOLDER_PATTERN = /\b(TODO|FIXME|DEBUG|placeholder|lorem ipsum)\b/i;
const NOT_IMPLEMENTED_PATTERN = /\b(not implemented|not-yet-supported)\b/i;

function isConsoleCall(node: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'console';
}

function getStringLikeText(node: ts.Node): string | null {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function findStringLiteral(node: ts.Node, pattern: RegExp): string | null {
  let matched: string | null = null;
  const visit = (child: ts.Node): void => {
    const text = getStringLikeText(child);
    if (text && pattern.test(text)) {
      matched = text;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return matched;
}

function findCatchReturn(block: ts.Block): ts.ReturnStatement | null {
  let sawThrow = false;
  let found: ts.ReturnStatement | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isThrowStatement(node)) {
      sawThrow = true;
    }
    if (ts.isReturnStatement(node) && node.expression && isSimpleDefaultExpression(node.expression)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(block, visit);
  return sawThrow ? null : found;
}

export function runIntegrityAudit(root = repoRoot): AuditSectionResult<IntegritySummary> {
  const sourceRecords = readSourceFileRecords(root);
  const rawFindings: AuditFinding[] = [];
  let stubCount = 0;
  let missingCapabilityCount = 0;
  let fallbackCount = 0;
  let consoleCount = 0;
  let placeholderCount = 0;
  let reimplementationCount = 0;

  for (const record of sourceRecords) {
    const internalImports = new Map<string, number>();
    const identifierUsage = new Map<string, number>();
    let localImplementationCount = 0;

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && node.importClause && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith('@czap/')) {
          if (node.importClause.name) {
            internalImports.set(node.importClause.name.text, node.importClause.name.getStart());
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              internalImports.set(node.importClause.namedBindings.name.text, node.importClause.namedBindings.name.getStart());
            } else {
              node.importClause.namedBindings.elements.forEach((element) => {
                internalImports.set(element.name.text, element.name.getStart());
              });
            }
          }
        }
      }

      if (
        (ts.isFunctionDeclaration(node) && node.body) ||
        ts.isClassDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        localImplementationCount += 1;
      }

      if (ts.isIdentifier(node)) {
        identifierUsage.set(node.text, (identifierUsage.get(node.text) ?? 0) + 1);
      }

      if (ts.isCallExpression(node) && isConsoleCall(node)) {
        const { line, column } = lineAndColumn(record.sourceFile, node.getStart());
        consoleCount += 1;
        rawFindings.push({
          id: `integrity/console/${record.relativePath}:${line}:${column}`,
          section: 'integrity',
          rule: 'console-call',
          severity: 'warning',
          title: 'Raw console call in runtime source',
          summary: 'Runtime package source should route boundary logging through Diagnostics rather than raw console.* calls.',
          location: {
            file: record.relativePath,
            line,
            column,
          },
        });
      }

      if (ts.isThrowStatement(node) && node.expression) {
        const message = findStringLiteral(node.expression, NOT_IMPLEMENTED_PATTERN);
        if (message) {
          const { line, column } = lineAndColumn(record.sourceFile, node.getStart());
          stubCount += 1;
          rawFindings.push({
            id: `integrity/stub/${record.relativePath}:${line}:${column}`,
            section: 'integrity',
            rule: 'stub-marker',
            severity: 'error',
            title: 'Runtime stub marker found',
            summary: `Throw path still signals an unimplemented runtime path: "${message}".`,
            location: {
              file: record.relativePath,
              line,
              column,
            },
          });
        }
      }

      if (ts.isCallExpression(node)) {
        const message = node.arguments.map((argument) => getStringLikeText(argument)).find((value): value is string => Boolean(value));
        if (message && NOT_IMPLEMENTED_PATTERN.test(message)) {
          const { line, column } = lineAndColumn(record.sourceFile, node.getStart());
          missingCapabilityCount += 1;
          rawFindings.push({
            id: `integrity/capability/${record.relativePath}:${line}:${column}`,
            section: 'integrity',
            rule: 'missing-runtime-capability',
            severity: 'warning',
            title: 'Runtime path reports missing capability',
            summary: `Code path still advertises a missing or partial capability: "${message}".`,
            location: {
              file: record.relativePath,
              line,
              column,
            },
          });
        }
      }

      if (ts.isCatchClause(node) && node.block) {
        const returned = findCatchReturn(node.block);
        if (returned) {
          const { line, column } = lineAndColumn(record.sourceFile, returned.getStart());
          fallbackCount += 1;
          rawFindings.push({
            id: `integrity/fallback/${record.relativePath}:${line}:${column}`,
            section: 'integrity',
            rule: 'fallback-laundering',
            severity: 'warning',
            title: 'Catch block returns a simple default',
            summary: `Catch path returns ${nodeText(returned.expression!, record.sourceFile)} instead of surfacing richer failure context.`,
            location: {
              file: record.relativePath,
              line,
              column,
            },
          });
        }
      }

      if (ts.isDebuggerStatement(node) || (getStringLikeText(node) && PLACEHOLDER_PATTERN.test(getStringLikeText(node)!))) {
        const { line, column } = lineAndColumn(record.sourceFile, node.getStart());
        placeholderCount += 1;
        rawFindings.push({
          id: `integrity/placeholder/${record.relativePath}:${line}:${column}`,
          section: 'integrity',
          rule: 'placeholder-content',
          severity: 'warning',
          title: 'Placeholder or debug marker found',
          summary: ts.isDebuggerStatement(node)
            ? 'Debugger statement should not survive in runtime package source.'
            : `String literal still contains a placeholder/debug marker: "${getStringLikeText(node)!}".`,
          location: {
            file: record.relativePath,
            line,
            column,
          },
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(record.sourceFile);

    const unusedInternalImports = [...internalImports.keys()].filter((name) => (identifierUsage.get(name) ?? 0) <= 1);
    if (unusedInternalImports.length > 0 && localImplementationCount > 0) {
      reimplementationCount += 1;
      rawFindings.push({
        id: `integrity/reimplementation/${record.relativePath}`,
        section: 'integrity',
        rule: 'suspicious-reimplementation',
        severity: 'warning',
        title: 'Internal helper import is unused next to local implementation logic',
        summary: `Unused internal import(s) ${unusedInternalImports.join(', ')} sit beside local implementation code, which is a reimplementation smell worth reviewing.`,
        location: {
          file: record.relativePath,
          line: 1,
          column: 1,
        },
      });
    }
  }

  const partitioned = partitionAllowlistedFindings(rawFindings);
  return {
    section: 'integrity',
    summary: {
      runtimeFileCount: sourceRecords.length,
      stubCount,
      missingCapabilityCount,
      fallbackCount,
      consoleCount,
      placeholderCount,
      reimplementationCount,
    },
    findings: partitioned.findings,
    suppressed: partitioned.suppressed,
  };
}

function main(): void {
  const result = runIntegrityAudit();
  const outputPath = `${repoRoot}/${reportPaths.json.replace(/\.json$/, '.integrity.json')}`;
  writeTextFile(outputPath, JSON.stringify(result, null, 2));
  const counts = createCounts(result.findings);
  console.log(
    `integrity audit: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info finding(s), ${result.suppressed.length} suppressed`,
  );
}

if (isDirectExecution(import.meta.url)) {
  main();
}

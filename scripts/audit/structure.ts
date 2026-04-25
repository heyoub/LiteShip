import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { packageTopology, reportPaths, surfacePolicy } from './policy.js';
import {
  createCounts,
  isDirectExecution,
  lineAndColumn,
  listPackageManifests,
  partitionAllowlistedFindings,
  readSourceFileRecords,
  repoRoot,
  relativeToRoot,
  writeTextFile,
} from './shared.js';
import type { AuditFinding, AuditSectionResult } from './types.js';

export interface StructureSummary {
  readonly packageCount: number;
  readonly sourceFileCount: number;
  readonly internalImportEdges: number;
  readonly externalImportCount: number;
  readonly publicExportCount: number;
  readonly orphanCandidateCount: number;
  readonly defaultExportCount: number;
  readonly packageEdges: readonly {
    readonly from: string;
    readonly to: string;
    readonly count: number;
  }[];
}

interface ExportedSymbol {
  readonly file: string;
  readonly packageName: string;
  readonly name: string;
  readonly line: number;
  readonly column: number;
}

interface ResolvedImport {
  readonly specifier: string;
  readonly targetFile: string | null;
  readonly targetPackage: string | null;
  readonly kind: 'relative' | 'internal-package' | 'external';
}

interface PackageExportTarget {
  readonly [subpath: string]: string;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function candidatePaths(basePath: string): readonly string[] {
  return [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    resolve(basePath, 'index.ts'),
    resolve(basePath, 'index.tsx'),
  ];
}

function resolveRelativeImport(specifier: string, containingFile: string): string | null {
  const basePath = resolve(dirname(containingFile), specifier);
  for (const candidate of candidatePaths(basePath)) {
    const tsCandidate =
      candidate.endsWith('.js') && existsSync(candidate.replace(/\.js$/, '.ts'))
        ? candidate.replace(/\.js$/, '.ts')
        : candidate.endsWith('.jsx') && existsSync(candidate.replace(/\.jsx$/, '.tsx'))
          ? candidate.replace(/\.jsx$/, '.tsx')
          : candidate;
    if (existsSync(tsCandidate)) {
      return tsCandidate.replace(/\\/g, '/');
    }
  }
  return null;
}

function buildPackageExportTargets(root = repoRoot): Map<string, PackageExportTarget> {
  const targets = new Map<string, PackageExportTarget>();

  for (const pkg of listPackageManifests(root)) {
    const packageTargets: Record<string, string> = {};
    const entries = Object.entries(pkg.exports);

    for (const [subpath, rawValue] of entries) {
      if (typeof rawValue === 'string') {
        packageTargets[subpath] = resolve(pkg.dir, rawValue).replace(/\\/g, '/');
        continue;
      }

      if (rawValue && typeof rawValue === 'object') {
        const developmentPath = (rawValue as { development?: string }).development;
        const importPath = (rawValue as { import?: string }).import;
        if (developmentPath) {
          packageTargets[subpath] = resolve(pkg.dir, developmentPath).replace(/\\/g, '/');
          continue;
        }
        if (importPath) {
          packageTargets[subpath] = resolve(pkg.dir, importPath).replace(/\\/g, '/');
        }
      }
    }

    targets.set(pkg.name, packageTargets);
  }

  return targets;
}

function resolveInternalPackageImport(
  specifier: string,
  packageExportTargets: Map<string, PackageExportTarget>,
): ResolvedImport {
  if (!specifier.startsWith('@czap/')) {
    return {
      specifier,
      targetFile: null,
      targetPackage: null,
      kind: 'external',
    };
  }

  const parts = specifier.split('/');
  const packageName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  const subpath = parts.length > 2 ? `./${parts.slice(2).join('/')}` : '.';
  const exports = packageExportTargets.get(packageName);

  if (!exports) {
    return {
      specifier,
      targetFile: null,
      targetPackage: packageName,
      kind: 'internal-package',
    };
  }

  const directMatch = exports[subpath];
  if (directMatch) {
    return {
      specifier,
      targetFile: directMatch.replace(/\\/g, '/'),
      targetPackage: packageName,
      kind: 'internal-package',
    };
  }

  const wildcard = exports['./*'];
  if (wildcard) {
    const suffix = subpath.slice(2);
    return {
      specifier,
      targetFile: wildcard.replace('*', suffix).replace(/\\/g, '/'),
      targetPackage: packageName,
      kind: 'internal-package',
    };
  }

  if (subpath === '.') {
    return {
      specifier,
      targetFile: exports['.'] ?? null,
      targetPackage: packageName,
      kind: 'internal-package',
    };
  }

  return {
    specifier,
    targetFile: null,
    targetPackage: packageName,
    kind: 'internal-package',
  };
}

function resolveImport(
  specifier: string,
  containingFile: string,
  packageExportTargets: Map<string, PackageExportTarget>,
): ResolvedImport {
  if (specifier.startsWith('.')) {
    return {
      specifier,
      targetFile: resolveRelativeImport(specifier, containingFile),
      targetPackage: null,
      kind: 'relative',
    };
  }

  return resolveInternalPackageImport(specifier, packageExportTargets);
}

function exportedNamesFromNode(node: ts.Node): readonly { name: string; pos: number }[] {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
    return node.name ? [{ name: node.name.text, pos: node.name.getStart() }] : [];
  }

  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .filter((declaration): declaration is ts.VariableDeclaration & { name: ts.Identifier } => ts.isIdentifier(declaration.name))
      .map((declaration) => ({
        name: declaration.name.text,
        pos: declaration.name.getStart(),
      }));
  }

  if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
    return node.exportClause.elements.map((element) => ({
      name: element.name.text,
      pos: element.name.getStart(),
    }));
  }

  if (ts.isExportAssignment(node)) {
    return [{ name: 'default', pos: node.getStart() }];
  }

  return [];
}

export function runStructureAudit(root = repoRoot): AuditSectionResult<StructureSummary> {
  const packageInfos = listPackageManifests(root);
  const packageByName = new Map(packageInfos.map((pkg) => [pkg.name, pkg] as const));
  const packageExportTargets = buildPackageExportTargets(root);
  const knownSurfaceFiles = new Set<string>([
    ...surfacePolicy.astroRuntimeFiles,
    ...surfacePolicy.astroClientDirectives.map((directive) => `packages/astro/src/client-directives/${directive}.ts`),
    'packages/astro/src/middleware.ts',
    ...packageInfos.flatMap((pkg) =>
      Object.values(pkg.exports)
        .map((value) => {
          const candidate =
            typeof value === 'string'
              ? value
              : value && typeof value === 'object'
                ? ((value as { development?: string }).development ?? (value as { import?: string }).import ?? null)
                : null;
          if (!candidate || candidate.includes('*')) return null;
          return relativeToRoot(resolve(pkg.dir, candidate), root);
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ]);
  const sourceRecords = readSourceFileRecords(root);
  const sourceByPath = new Map(sourceRecords.map((record) => [record.absolutePath, record] as const));

  const rawFindings: AuditFinding[] = [];
  const exportedSymbols: ExportedSymbol[] = [];
  const inboundReferences = new Map<string, Set<string>>();
  const inboundFiles = new Set<string>();
  const packageEdges = new Map<string, number>();
  let externalImportCount = 0;
  let internalImportEdges = 0;
  let defaultExportCount = 0;

  for (const record of sourceRecords) {
    const packageInfo = record.packageName ? packageByName.get(record.packageName) : null;
    if (!packageInfo) continue;

    const visit = (node: ts.Node): void => {
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isEnumDeclaration(node) ||
          ts.isVariableStatement(node) ||
          ts.isExportDeclaration(node) ||
          ts.isExportAssignment(node)) &&
        (hasModifier(node, ts.SyntaxKind.ExportKeyword) || ts.isExportDeclaration(node) || ts.isExportAssignment(node))
      ) {
        for (const symbol of exportedNamesFromNode(node)) {
          const { line, column } = lineAndColumn(record.sourceFile, symbol.pos);
          exportedSymbols.push({
            file: record.relativePath,
            packageName: packageInfo.name,
            name: symbol.name,
            line,
            column,
          });

          if (symbol.name === 'default') {
            defaultExportCount += 1;
            rawFindings.push({
              id: `structure/default-export/${record.relativePath}:${line}:${column}`,
              section: 'structure',
              rule: 'default-export',
              severity: 'warning',
              title: 'Default export found in package source',
              summary: 'czap standardizes on named exports; this default export should be justified or removed.',
              location: {
                file: record.relativePath,
                line,
                column,
              },
              metadata: {
                packageName: packageInfo.name,
              },
            });
          }
        }
      }

      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        const resolved = resolveImport(specifier, record.absolutePath, packageExportTargets);

        if (resolved.kind === 'external') {
          externalImportCount += 1;
        }

        if (resolved.kind === 'relative' && !resolved.targetFile) {
          const { line, column } = lineAndColumn(record.sourceFile, node.moduleSpecifier.getStart());
          rawFindings.push({
            id: `structure/unresolved-relative/${record.relativePath}:${line}:${column}`,
            section: 'structure',
            rule: 'unresolved-internal-import',
            severity: 'error',
            title: 'Unresolved relative import',
            summary: `Could not resolve relative import "${specifier}".`,
            location: {
              file: record.relativePath,
              line,
              column,
            },
          });
        }

        if (resolved.kind === 'internal-package') {
          internalImportEdges += 1;
          const { line, column } = lineAndColumn(record.sourceFile, node.moduleSpecifier.getStart());
          if (!resolved.targetPackage || !packageByName.has(resolved.targetPackage)) {
            rawFindings.push({
              id: `structure/unknown-package/${record.relativePath}:${line}:${column}`,
              section: 'structure',
              rule: 'unknown-internal-package',
              severity: 'error',
              title: 'Unknown internal package import',
              summary: `Import "${specifier}" does not resolve to a known workspace package.`,
              location: {
                file: record.relativePath,
                line,
                column,
              },
            });
          } else {
            const edgeKey = `${packageInfo.name} -> ${resolved.targetPackage}`;
            packageEdges.set(edgeKey, (packageEdges.get(edgeKey) ?? 0) + 1);

            if (resolved.targetPackage !== packageInfo.name && !packageInfo.dependencies.includes(resolved.targetPackage)) {
              rawFindings.push({
                id: `structure/manifest-mismatch/${record.relativePath}:${line}:${column}`,
                section: 'structure',
                rule: 'missing-manifest-dependency',
                severity: 'warning',
                title: 'Workspace import missing from package manifest',
                summary: `Package ${packageInfo.name} imports ${resolved.targetPackage} but does not declare it in package.json.`,
                location: {
                  file: record.relativePath,
                  line,
                  column,
                },
                metadata: {
                  packageName: packageInfo.name,
                  targetPackage: resolved.targetPackage,
                },
              });
            }

            const policy = packageTopology[packageInfo.name];
            if (resolved.targetPackage !== packageInfo.name && policy && !policy.allowedInternalImports.includes(resolved.targetPackage)) {
              rawFindings.push({
                id: `structure/layer-violation/${record.relativePath}:${line}:${column}`,
                section: 'structure',
                rule: 'package-topology',
                severity: 'error',
                title: 'Package import violates audit topology',
                summary: `Package ${packageInfo.name} is not expected to import ${resolved.targetPackage} in the repo-native topology.`,
                location: {
                  file: record.relativePath,
                  line,
                  column,
                },
                metadata: {
                  packageName: packageInfo.name,
                  targetPackage: resolved.targetPackage,
                },
              });
            }
          }
        }

        const referencedNames = new Set<string>();
        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause;
          if (clause?.name) {
            referencedNames.add('default');
          }
          if (clause?.namedBindings) {
            if (ts.isNamespaceImport(clause.namedBindings)) {
              referencedNames.add('*');
            } else {
              clause.namedBindings.elements.forEach((element) => {
                referencedNames.add(element.propertyName?.text ?? element.name.text);
              });
            }
          }
          if (!clause) {
            referencedNames.add('*');
          }
        } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          node.exportClause.elements.forEach((element) => {
            referencedNames.add(element.propertyName?.text ?? element.name.text);
          });
        } else {
          referencedNames.add('*');
        }

        if (resolved.targetFile && sourceByPath.has(resolved.targetFile)) {
          const targetRelativePath = relativeToRoot(resolved.targetFile, root);
          const refs = inboundReferences.get(targetRelativePath) ?? new Set<string>();
          referencedNames.forEach((name) => refs.add(name));
          inboundReferences.set(targetRelativePath, refs);
          inboundFiles.add(targetRelativePath);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(record.sourceFile);
  }

  for (const symbol of exportedSymbols) {
    if (symbol.name === 'default' || symbol.file.endsWith('/index.ts')) continue;
    if (knownSurfaceFiles.has(symbol.file)) continue;
    if (inboundFiles.has(symbol.file)) continue;
    const inbound = inboundReferences.get(symbol.file);
    if (inbound?.has(symbol.name) || inbound?.has('*')) continue;

    rawFindings.push({
      id: `structure/orphan-export/${symbol.file}:${symbol.line}:${symbol.column}:${symbol.name}`,
      section: 'structure',
      rule: 'orphan-export-candidate',
      severity: 'info',
      title: 'Exported symbol has no in-repo consumers',
      summary: `Export "${symbol.name}" is not imported or re-exported by another source file in the repository.`,
      location: {
        file: symbol.file,
        line: symbol.line,
        column: symbol.column,
      },
      metadata: {
        packageName: symbol.packageName,
        symbol: symbol.name,
      },
    });
  }

  const partitioned = partitionAllowlistedFindings(rawFindings);
  const packageEdgeSummary = [...packageEdges.entries()]
    .map(([edge, count]) => {
      const [from, to] = edge.split(' -> ');
      return {
        from: from!,
        to: to!,
        count,
      };
    })
    .sort((left, right) => right.count - left.count || left.from.localeCompare(right.from) || left.to.localeCompare(right.to));

  return {
    section: 'structure',
    summary: {
      packageCount: packageInfos.length,
      sourceFileCount: sourceRecords.length,
      internalImportEdges,
      externalImportCount,
      publicExportCount: exportedSymbols.length,
      orphanCandidateCount: partitioned.findings.filter((finding) => finding.rule === 'orphan-export-candidate').length,
      defaultExportCount,
      packageEdges: packageEdgeSummary,
    },
    findings: partitioned.findings,
    suppressed: partitioned.suppressed,
  };
}

function main(): void {
  const result = runStructureAudit();
  const outputPath = resolve(repoRoot, reportPaths.json.replace(/\.json$/, '.structure.json'));
  writeTextFile(outputPath, JSON.stringify(result, null, 2));
  const counts = createCounts(result.findings);
  console.log(
    `structure audit: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info finding(s), ${result.suppressed.length} suppressed`,
  );
  console.log(`wrote ${relativeToRoot(outputPath)}`);
}

if (isDirectExecution(import.meta.url)) {
  main();
}

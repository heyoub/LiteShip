import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reportPaths, surfacePolicy } from './policy.js';
import {
  createCounts,
  isDirectExecution,
  listPackageManifests,
  partitionAllowlistedFindings,
  repoRoot,
  writeTextFile,
} from './shared.js';
import type { AuditFinding, AuditSectionResult } from './types.js';

export interface SurfaceSummary {
  readonly packageCount: number;
  readonly packageExportCount: number;
  readonly astroDirectiveCount: number;
  readonly astroRuntimeAdapterCount: number;
  readonly viteVirtualModuleCount: number;
  readonly capabilityNotes: readonly string[];
}

function asDevelopmentPath(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    const development = (value as { development?: string }).development;
    const imported = (value as { import?: string }).import;
    return development ?? imported ?? null;
  }
  return null;
}

export function runSurfaceAudit(root = repoRoot): AuditSectionResult<SurfaceSummary> {
  const packageInfos = listPackageManifests(root);
  const rawFindings: AuditFinding[] = [];
  let packageExportCount = 0;

  for (const pkg of packageInfos) {
    const exportEntries = Object.entries(pkg.exports);
    packageExportCount += exportEntries.length;
    for (const [subpath, value] of exportEntries) {
      const candidate = asDevelopmentPath(value);
      if (!candidate) continue;
      if (candidate.includes('*')) continue;

      const filePath = resolve(pkg.dir, candidate).replace(/\\/g, '/');
      if (!existsSync(filePath)) {
        rawFindings.push({
          id: `surface/package-export/${pkg.name}:${subpath}`,
          section: 'surface',
          rule: 'package-export-surface',
          severity: 'error',
          title: 'Package export points at a missing source file',
          summary: `Export "${subpath}" for ${pkg.name} resolves to a missing path: ${candidate}.`,
          location: {
            file: pkg.packageJsonPath,
          },
        });
      }
    }
  }

  const astroPackage = packageInfos.find((pkg) => pkg.name === surfacePolicy.astroPackage);
  if (!astroPackage) {
    rawFindings.push({
      id: 'surface/astro-package-missing',
      section: 'surface',
      rule: 'host-surface',
      severity: 'error',
      title: 'Astro package manifest missing',
      summary: '@czap/astro package.json is required for the host-wired surface inventory.',
      location: {
        file: 'packages/astro/package.json',
      },
    });
  } else {
    for (const directive of surfacePolicy.astroClientDirectives) {
      const exportKey = `./client-directives/${directive}`;
      if (!(exportKey in astroPackage.exports)) {
        rawFindings.push({
          id: `surface/astro-export/${directive}`,
          section: 'surface',
          rule: 'host-surface',
          severity: 'error',
          title: 'Astro client directive export is missing',
          summary: `@czap/astro should export ${exportKey} as part of the documented host surface.`,
          location: {
            file: astroPackage.packageJsonPath,
          },
        });
      }

      const directivePath = resolve(root, `packages/astro/src/client-directives/${directive}.ts`).replace(/\\/g, '/');
      if (!existsSync(directivePath)) {
        rawFindings.push({
          id: `surface/astro-file/${directive}`,
          section: 'surface',
          rule: 'host-surface',
          severity: 'error',
          title: 'Astro client directive source file is missing',
          summary: `packages/astro/src/client-directives/${directive}.ts should exist for the documented directive surface.`,
          location: {
            file: `packages/astro/src/client-directives/${directive}.ts`,
          },
        });
      }
    }

    for (const runtimeFile of surfacePolicy.astroRuntimeFiles) {
      const runtimePath = resolve(root, runtimeFile).replace(/\\/g, '/');
      if (!existsSync(runtimePath)) {
        rawFindings.push({
          id: `surface/runtime-file/${runtimeFile}`,
          section: 'surface',
          rule: 'host-surface',
          severity: 'error',
          title: 'Shared runtime adapter file is missing',
          summary: `${runtimeFile} is expected by the shared-runtime audit policy but is not present.`,
          location: {
            file: runtimeFile,
          },
        });
      }
    }
  }

  const virtualModulesPath = resolve(root, 'packages/vite/src/virtual-modules.ts').replace(/\\/g, '/');
  const virtualModulesSource = existsSync(virtualModulesPath) ? readFileSync(virtualModulesPath, 'utf8') : '';

  if (!virtualModulesSource) {
    rawFindings.push({
      id: 'surface/vite-virtual-modules-missing',
      section: 'surface',
      rule: 'virtual-module-surface',
      severity: 'error',
      title: 'Vite virtual module source file is missing',
      summary: 'packages/vite/src/virtual-modules.ts is required to inventory the virtual module surface.',
      location: {
        file: 'packages/vite/src/virtual-modules.ts',
      },
    });
  } else {
    for (const virtualId of surfacePolicy.viteVirtualModules) {
      if (!virtualModulesSource.includes(virtualId)) {
        rawFindings.push({
          id: `surface/vite-virtual/${virtualId}`,
          section: 'surface',
          rule: 'virtual-module-surface',
          severity: 'error',
          title: 'Virtual module is missing from the Vite surface',
          summary: `${virtualId} is expected by the repo-native Vite policy but was not found in virtual-modules.ts.`,
          location: {
            file: 'packages/vite/src/virtual-modules.ts',
          },
        });
      }
    }
  }

  const capabilityNotes = surfacePolicy.knownCapabilityNotes
    .filter((note) => existsSync(resolve(root, note.file)))
    .map((note) => note.summary);

  const partitioned = partitionAllowlistedFindings(rawFindings);
  return {
    section: 'surface',
    summary: {
      packageCount: packageInfos.length,
      packageExportCount,
      astroDirectiveCount: surfacePolicy.astroClientDirectives.length,
      astroRuntimeAdapterCount: surfacePolicy.astroRuntimeFiles.length,
      viteVirtualModuleCount: surfacePolicy.viteVirtualModules.length,
      capabilityNotes,
    },
    findings: partitioned.findings,
    suppressed: partitioned.suppressed,
  };
}

function main(): void {
  const result = runSurfaceAudit();
  const outputPath = `${repoRoot}/${reportPaths.json.replace(/\.json$/, '.surface.json')}`;
  writeTextFile(outputPath, JSON.stringify(result, null, 2));
  const counts = createCounts(result.findings);
  console.log(
    `surface audit: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info finding(s), ${result.suppressed.length} suppressed`,
  );
}

if (isDirectExecution(import.meta.url)) {
  main();
}

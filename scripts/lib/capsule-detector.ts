/**
 * Type-directed capsule detector. Uses the TypeScript checker to find
 * every CallExpression whose resolved return type extends
 * CapsuleContract<K, In, Out, R>, regardless of whether the callee is
 * defineCapsule directly or a factory that wraps it.
 *
 * Replaces the syntax-only ts.createSourceFile walker that was blind to
 * factory wrappers (defineAsset, BeatMarkerProjection, ...).
 *
 * @module
 */

import ts from 'typescript';
import { resolve } from 'node:path';

/**
 * Workspace `@czap/*` -> source-tree path map. Mirrors
 * Config.toTestAliases so the type checker resolves cross-package
 * imports to source `.ts` files, not built `.d.ts` files. Without this,
 * factory return types like `CapsuleDef<'cachedProjection', ...>` collapse
 * to `any` (because `dist/index.d.ts` re-imports `@czap/core` and the
 * checker has no resolver for that bare specifier).
 */
export const WORKSPACE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  '@czap/core': ['packages/core/src/index.ts'],
  '@czap/quantizer': ['packages/quantizer/src/index.ts'],
  '@czap/compiler': ['packages/compiler/src/index.ts'],
  '@czap/web/lite': ['packages/web/src/lite.ts'],
  '@czap/web': ['packages/web/src/index.ts'],
  '@czap/detect': ['packages/detect/src/index.ts'],
  '@czap/vite/html-transform': ['packages/vite/src/html-transform.ts'],
  '@czap/vite': ['packages/vite/src/index.ts'],
  '@czap/astro/runtime': ['packages/astro/src/runtime/index.ts'],
  '@czap/astro': ['packages/astro/src/index.ts'],
  '@czap/remotion': ['packages/remotion/src/index.ts'],
  '@czap/scene': ['packages/scene/src/index.ts'],
  '@czap/assets': ['packages/assets/src/index.ts'],
  '@czap/cli': ['packages/cli/src/index.ts'],
  '@czap/mcp-server': ['packages/mcp-server/src/index.ts'],
  '@czap/edge': ['packages/edge/src/index.ts'],
  '@czap/worker': ['packages/worker/src/index.ts'],
  '@czap/_spine': ['packages/_spine/index.ts'],
};

/** A single resolved capsule call site. */
export interface DetectedCall {
  /** Absolute path of the source file. */
  readonly file: string;
  /** 1-based line number of the call expression. */
  readonly line: number;
  /** Capsule kind, parsed from the K type parameter (e.g. 'cachedProjection'). */
  readonly kind: string;
  /** Capsule name. From the object literal `.name` for direct defineCapsule, or
   * from the first string-literal argument for factory calls. */
  readonly name: string;
  /** Set when the callee is not the literal `defineCapsule` identifier. */
  readonly factory?: string;
  /** Literal arguments captured from a factory call (string/number/bool/null). */
  readonly args?: readonly unknown[];
  /**
   * If the call sits at the right-hand side of an `export const X = ...`
   * (or top-level `const X = ...` followed by an `export { X }`), this is
   * the bound identifier — used by the harness to import the runtime
   * capsule binding into generated test files.
   */
  readonly binding?: string;
}

/** Internal record before name resolution. */
interface RawHit {
  readonly file: string;
  readonly line: number;
  readonly kind: string;
  readonly node: ts.CallExpression;
  readonly callee: ts.Expression;
  readonly binding?: string;
}

/** Type names whose `<K, ...>` first argument is the capsule kind. */
const CAPSULE_TYPE_NAMES = new Set(['CapsuleContract', 'CapsuleDef']);

/**
 * Build a TypeScript program covering enough of the repo to resolve
 * capsule contract return types across factory wrappers.
 */
function createProgram(files: readonly string[]): ts.Program {
  const baseUrl = process.cwd();
  // Materialize relative-path alias map for the TS resolver.
  const paths: Record<string, string[]> = {};
  for (const [k, vs] of Object.entries(WORKSPACE_ALIASES)) {
    paths[k] = vs.map((v) => `./${v}`);
  }
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    strict: true,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    esModuleInterop: true,
    isolatedModules: true,
    noEmit: true,
    allowJs: false,
    resolveJsonModule: true,
    noUncheckedIndexedAccess: true,
    types: ['node'],
    baseUrl,
    paths,
  };
  // createProgram resolves transitively imported files automatically.
  return ts.createProgram({
    rootNames: files.map((f) => resolve(f)),
    options,
  });
}

/**
 * Strip surrounding double quotes from a string literal type as rendered
 * by `checker.typeToString` (e.g. `"cachedProjection"` -> `cachedProjection`).
 * Returns undefined if the value is not a single-quoted-string form.
 */
function unquoteLiteralString(s: string): string | undefined {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return undefined;
}

/**
 * Try to extract the capsule kind from a resolved type.
 *
 * Returns the kind string (e.g. 'pureTransform') if `type` is or extends
 * CapsuleContract<K, ...> / CapsuleDef<K, ...>, else undefined.
 */
function tryExtractKind(checker: ts.TypeChecker, type: ts.Type): string | undefined {
  // Walk the candidate type itself plus its base types so we catch
  // CapsuleDef<K,...> which extends CapsuleContract<K,...>.
  const candidates: ts.Type[] = [type];
  const baseTypes = type.getBaseTypes?.() ?? [];
  for (const b of baseTypes) candidates.push(b);
  const apparent = checker.getApparentType(type);
  if (apparent !== type) candidates.push(apparent);

  for (const candidate of candidates) {
    // Check BOTH the alias name (covers literal `CapsuleContract<...>`
    // type expressions and external type aliases) AND the structural
    // symbol (covers cases where a private type alias like
    // `AnyAssetCapsule = CapsuleDef<...>` masks the underlying interface).
    const aliasName = candidate.aliasSymbol?.getName();
    const structuralName = candidate.getSymbol()?.getName();
    const matchedAlias = aliasName !== undefined && CAPSULE_TYPE_NAMES.has(aliasName);
    const matchedStructural =
      structuralName !== undefined && CAPSULE_TYPE_NAMES.has(structuralName);
    if (!matchedAlias && !matchedStructural) continue;

    // When the alias matched (CapsuleContract used directly), prefer
    // aliasTypeArguments — they were given by the user. Otherwise fall
    // back to structural type arguments on the reference (resolved
    // through any type-alias indirection).
    let typeArgs: readonly ts.Type[] | undefined;
    if (matchedAlias) {
      typeArgs = candidate.aliasTypeArguments;
    }
    if ((!typeArgs || typeArgs.length === 0) && matchedStructural) {
      typeArgs = checker.getTypeArguments(candidate as ts.TypeReference) as
        | readonly ts.Type[]
        | undefined;
    }
    if (!typeArgs || typeArgs.length === 0) continue;

    const first = typeArgs[0];
    if (!first) continue;

    // Direct string-literal type.
    if (first.isStringLiteral()) return first.value;
    // Render fallback handles weirder shapes like inferred string-literal
    // unions where the literal still prints as `"foo"`.
    const printed = checker.typeToString(first);
    const unquoted = unquoteLiteralString(printed);
    if (unquoted) return unquoted;
  }
  return undefined;
}

/**
 * Convert a literal-ish AST node to its primitive value, or undefined if
 * the node is not a directly serializable literal.
 */
function literalValue(node: ts.Node): unknown | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  return undefined;
}

/** Extract a callee's printable name, handling member expressions. */
function calleeName(expr: ts.Expression): string {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    return `${calleeName(expr.expression)}.${expr.name.text}`;
  }
  return expr.getText();
}

/**
 * Read a string-typed property out of a defineCapsule / defineAsset
 * object literal. Tries each name in `keys` in order. Returns the first
 * matching string-literal initializer found.
 */
function readStringPropertyFromObjectLiteral(
  obj: ts.ObjectLiteralExpression,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const keyText = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name)
          ? prop.name.text
          : undefined;
      if (keyText === key && ts.isStringLiteral(prop.initializer)) {
        return prop.initializer.text;
      }
    }
  }
  return undefined;
}

/**
 * Public entrypoint: detect every capsule call site reachable from the
 * supplied root file set.
 */
export function detectCapsuleCalls(files: readonly string[]): readonly DetectedCall[] {
  if (files.length === 0) return [];

  const program = createProgram(files);
  const checker = program.getTypeChecker();
  const rootSet = new Set(files.map((f) => resolve(f).replace(/\\/g, '/')));

  const hits: RawHit[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const normalized = resolve(sourceFile.fileName).replace(/\\/g, '/');
    if (!rootSet.has(normalized)) continue;

    visit(sourceFile);

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const type = checker.getTypeAtLocation(node);
        const kind = tryExtractKind(checker, type);
        if (kind !== undefined) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          // Walk up to find the enclosing `const X = ...` declaration so the
          // harness can later `import { X } from '<source>'`. We only need
          // direct `VariableDeclaration` parents — call sites buried deeper
          // (e.g. inside an array literal) won't have a stable binding name.
          let binding: string | undefined;
          let p: ts.Node | undefined = node.parent;
          while (p !== undefined) {
            if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
              binding = p.name.text;
              break;
            }
            // Stop walking once we've left the variable-decl initializer
            // chain — we don't want to climb into surrounding statements.
            if (
              !ts.isParenthesizedExpression(p) &&
              !ts.isAsExpression(p) &&
              !ts.isTypeAssertionExpression(p) &&
              !ts.isSatisfiesExpression(p) &&
              !ts.isCallExpression(p) &&
              !ts.isObjectLiteralExpression(p) &&
              !ts.isPropertyAssignment(p)
            ) {
              break;
            }
            p = p.parent;
          }
          hits.push({
            file: resolve(sourceFile.fileName),
            line: line + 1,
            kind,
            node,
            callee: node.expression,
            ...(binding !== undefined ? { binding } : {}),
          });
        }
      }
      ts.forEachChild(node, visit);
    }
  }

  // Resolve names + dedupe nested calls (a factory body's inner
  // defineCapsule resolves to the same kind; we only want the outermost
  // hit per file:line to avoid double-reporting).
  const out: DetectedCall[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const key = `${hit.file}:${hit.line}`;
    if (seen.has(key)) continue;

    const callee = hit.callee;
    const isDirectDefineCapsule =
      ts.isIdentifier(callee) && callee.text === 'defineCapsule';

    let name: string | undefined;
    let factory: string | undefined;
    let args: unknown[] | undefined;

    if (isDirectDefineCapsule) {
      const [arg] = hit.node.arguments;
      if (arg && ts.isObjectLiteralExpression(arg)) {
        name = readStringPropertyFromObjectLiteral(arg, ['name']);
      }
    } else {
      factory = calleeName(callee);
      // First string-literal argument is the conventional name for factories
      // such as BeatMarkerProjection('intro-bed'). For factories that take
      // a config object (defineAsset({id, ...})), fall back to the object's
      // `id` (asset convention) or `name` property.
      const literalArgs: unknown[] = [];
      for (const a of hit.node.arguments) {
        const v = literalValue(a);
        if (v !== undefined) literalArgs.push(v);
      }
      args = literalArgs;
      const firstStr = literalArgs.find((v): v is string => typeof v === 'string');
      if (firstStr !== undefined) {
        name = firstStr;
      } else {
        const [firstArg] = hit.node.arguments;
        if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
          name = readStringPropertyFromObjectLiteral(firstArg, ['name', 'id']);
        }
      }
    }

    if (name === undefined) continue;

    seen.add(key);
    const bindingProp = hit.binding !== undefined ? { binding: hit.binding } : {};
    const detected: DetectedCall = factory === undefined
      ? { file: hit.file, line: hit.line, kind: hit.kind, name, ...bindingProp }
      : args !== undefined && args.length > 0
        ? { file: hit.file, line: hit.line, kind: hit.kind, name, factory, args, ...bindingProp }
        : { file: hit.file, line: hit.line, kind: hit.kind, name, factory, ...bindingProp };
    out.push(detected);
  }

  return out;
}

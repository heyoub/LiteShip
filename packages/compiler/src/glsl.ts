/**
 * GLSL Compiler -- `BoundaryDef` to uniform declarations + `bindUniforms()` helper.
 *
 * Generates GLSL preamble code with:
 *   - `#define` statements for state indices (`STATE_MOBILE 0`, etc.)
 *   - `uniform` declarations for each value key
 *   - A JS helper function string for binding uniform values to WebGL
 *
 * @module
 */

import type { Boundary, StateUnion } from '@czap/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** GLSL scalar, vector, matrix, or sampler type used in a uniform declaration. */
export type GLSLType =
  | 'float'
  | 'int'
  | 'uint'
  | 'bool'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'ivec2'
  | 'ivec3'
  | 'ivec4'
  | 'mat2'
  | 'mat3'
  | 'mat4'
  | 'sampler2D'
  | 'samplerCube';

/** A single GLSL uniform declaration produced by {@link GLSLCompiler.compile}. */
export interface GLSLUniform {
  /** Uniform name (prefixed `u_`, snake-case). */
  readonly name: string;
  /** Inferred GLSL type; float when any state value is non-integer or negative. */
  readonly type: GLSLType;
  /** Optional inline comment emitted alongside the declaration. */
  readonly comment?: string;
}

/** A single GLSL `#define` produced by {@link GLSLCompiler.compile}. */
export interface GLSLDefine {
  /** Macro name (`STATE_*` or `STATE_COUNT`). */
  readonly name: string;
  /** Macro value (always numeric, serialized as a string). */
  readonly value: string;
  /** Optional inline comment emitted alongside the `#define`. */
  readonly comment?: string;
}

/**
 * Output of {@link GLSLCompiler.compile}.
 *
 * `declarations` is the complete preamble block ready to prepend to a
 * shader; `bindUniforms` is a `function bindUniforms(gl, program, values)`
 * stringified helper that routes the values map into `uniform*` calls.
 */
export interface GLSLCompileResult {
  /** State-index `#define`s. */
  readonly defines: readonly GLSLDefine[];
  /** Uniform declarations, including the `u_state` index uniform. */
  readonly uniforms: readonly GLSLUniform[];
  /** Default uniform values keyed by uniform name (from the last state's values). */
  readonly uniformValues: Record<string, number>;
  /** Pre-serialized `#define` + `uniform` declarations block. */
  readonly declarations: string;
  /** Stringified `bindUniforms(gl, program, values)` helper. */
  readonly bindUniforms: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a JS camelCase or kebab-case name to a GLSL-friendly uniform name.
 * Prefixes with 'u_' and converts to snake_case.
 */
function toUniformName(key: string): string {
  const snake = key
    .replace(/-/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
  return `u_${snake}`;
}

/**
 * Convert a state name to a GLSL #define name.
 * STATE_MOBILE, STATE_TABLET, etc.
 */
function toDefineName(stateName: string): string {
  return `STATE_${stateName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

/**
 * Infer a stable GLSL type from ALL values across ALL states.
 * If ANY value is a float (or negative), the uniform must be float
 * to avoid precision loss from narrowing to int.
 *
 * Negative integers are promoted to float to avoid GLSL sign-extension issues on
 * some mobile GPUs (Adreno, Mali). Safer to use float uniformly.
 */
function inferStableGLSLType(allValues: readonly number[]): GLSLType {
  return allValues.some((v) => !Number.isInteger(v) || v < 0) ? 'float' : 'int';
}

function appendComment(line: string, comment: string): string {
  return `${line} // ${comment}`;
}

// ---------------------------------------------------------------------------
// GLSLCompiler
// ---------------------------------------------------------------------------

/**
 * Compile a boundary definition and per-state numeric value maps into
 * GLSL `#define` statements, `uniform` declarations, and a `bindUniforms`
 * helper function string.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { GLSLCompiler } from '@czap/compiler';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['mobile', 'desktop'] as const,
 *   thresholds: [0, 768],
 * });
 * const result = GLSLCompiler.compile(boundary, {
 *   mobile: { blur: 0.5, brightness: 1.0 },
 *   desktop: { blur: 0.0, brightness: 1.2 },
 * });
 * console.log(result.declarations);
 * // #define STATE_MOBILE 0
 * // #define STATE_DESKTOP 1
 * // uniform int u_state;
 * // uniform float u_blur;
 * // uniform float u_brightness;
 * ```
 *
 * @param boundary - The boundary definition with states
 * @param states   - Per-state numeric value maps
 * @returns A {@link GLSLCompileResult} with defines, uniforms, and helper code
 */
function compile<B extends Boundary.Shape>(
  boundary: B,
  states: { [S in StateUnion<B> & string]: Record<string, number> },
): GLSLCompileResult {
  // Reinterpret the runtime tuple as the keyed state-name array so each element
  // is a valid index into `states` without per-site casts.
  const stateNames: ReadonlyArray<StateUnion<B> & string> = boundary.states as ReadonlyArray<StateUnion<B> & string>;

  // Build #define statements for state indices
  const defines: GLSLDefine[] = stateNames.map((name, index) => ({
    name: toDefineName(name),
    value: String(index),
    comment: `State index for '${name}'`,
  }));

  // Add a define for the current state uniform
  defines.push({
    name: 'STATE_COUNT',
    value: String(stateNames.length),
    comment: 'Total number of states',
  });

  // Collect all unique value keys across all states
  const allKeys = new Set<string>();
  const mergedValues: Record<string, number> = {};

  for (const stateName of stateNames) {
    const stateValues = states[stateName];
    if (!stateValues) continue;
    for (const [key, val] of Object.entries(stateValues)) {
      allKeys.add(key);
      // Use the last state's values as defaults for the uniform values map
      mergedValues[toUniformName(key)] = val;
    }
  }

  // Build uniform declarations
  const uniforms: GLSLUniform[] = [{ name: 'u_state', type: 'int', comment: 'Current state index' }];

  for (const key of allKeys) {
    // Collect ALL values for this key across every state, then pick the widest type
    const valuesForKey: number[] = [];
    for (const stateName of stateNames) {
      const stateValues = states[stateName];
      if (stateValues && key in stateValues) {
        valuesForKey.push(stateValues[key]!);
      }
    }
    // allKeys only contains keys observed in at least one state map.
    const glslType = inferStableGLSLType(valuesForKey);
    uniforms.push({
      name: toUniformName(key),
      type: glslType,
      comment: `Boundary value for '${key}'`,
    });
  }

  // Add u_state to merged values
  mergedValues['u_state'] = 0;

  // Build declaration strings
  const defineLines = defines.map((d) => appendComment(`#define ${d.name} ${d.value}`, d.comment!));

  const uniformLines = uniforms.map((u) => appendComment(`uniform ${u.type} ${u.name};`, u.comment!));

  const declarations = [...defineLines, '', ...uniformLines].join('\n');

  // Build the bindUniforms helper function string
  const bindBody = uniforms.map((u) => {
    const setter = u.type === 'int' || u.type === 'uint' || u.type === 'bool' ? 'uniform1i' : 'uniform1f';
    return `  gl.${setter}(gl.getUniformLocation(program, '${u.name}'), values['${u.name}']);`;
  });

  const bindUniforms = ['function bindUniforms(gl, program, values) {', ...bindBody, '}'].join('\n');

  return { defines, uniforms, uniformValues: mergedValues, declarations, bindUniforms };
}

/**
 * Serialize a {@link GLSLCompileResult} into a full GLSL preamble string
 * including declarations and the `bindUniforms` helper.
 *
 * @example
 * ```ts
 * import { GLSLCompiler } from '@czap/compiler';
 *
 * const result = GLSLCompiler.compile(boundary, states);
 * const glsl = GLSLCompiler.serialize(result);
 * // Prepend to your fragment shader source
 * const shaderSource = glsl + '\n' + mainShaderCode;
 * ```
 *
 * @param result - The compile result to serialize
 * @returns A GLSL preamble string
 */
function serialize(result: GLSLCompileResult): string {
  return [
    '// === czap GLSL Preamble ===',
    result.declarations,
    '',
    '// === Bind Uniforms Helper ===',
    result.bindUniforms,
  ].join('\n');
}

/**
 * GLSL compiler namespace.
 *
 * Compiles boundary definitions into GLSL shader preambles containing
 * `#define` state constants, `uniform` declarations, and a JavaScript
 * `bindUniforms()` helper for setting uniform values via WebGL.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { GLSLCompiler } from '@czap/compiler';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['sm', 'lg'] as const,
 *   thresholds: [0, 768],
 * });
 * const result = GLSLCompiler.compile(boundary, {
 *   sm: { intensity: 0.5 }, lg: { intensity: 1.0 },
 * });
 * const preamble = GLSLCompiler.serialize(result);
 * ```
 */
export const GLSLCompiler = { compile, serialize } as const;

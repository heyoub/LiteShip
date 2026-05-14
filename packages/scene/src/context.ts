/**
 * Scene composition context — fields a child scene inherits from its
 * parent when included via {@link Scene.subscene} (or, in future,
 * threaded through {@link Scene.include}).
 *
 * Today this is a plain interface passed by parameter. If/when scene
 * compilation gains more threaded state, we can promote it to an
 * Effect `Context.Tag` without changing the call sites that consume
 * the merged shape.
 *
 * @module
 */

/** Per-scene compositional state inherited across `Scene.subscene`. */
export interface SceneContext {
  readonly bpm: number;
  readonly fps: number;
  readonly rootTimeMs: number;
}

/**
 * Build a child {@link SceneContext} by merging explicit overrides
 * over inherited parent fields. Missing override fields fall through
 * to the parent — explicit `undefined` is treated as "no override".
 */
export function inheritContext(parent: SceneContext, overrides?: Partial<SceneContext>): SceneContext {
  return {
    bpm: overrides?.bpm ?? parent.bpm,
    fps: overrides?.fps ?? parent.fps,
    rootTimeMs: overrides?.rootTimeMs ?? parent.rootTimeMs,
  };
}

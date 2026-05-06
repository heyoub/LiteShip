/** Scene composition capsule — typed timeline authoring over czap's ECS. */

export type {
  SceneContract,
  SceneBeat,
  VideoTrack,
  AudioTrack,
  TransitionTrack,
  EffectTrack,
  TrackId,
  TrackKind,
  SceneInvariant,
} from './contract.js';

// `Track` is re-exported as a value (with companion namespace types) from
// ./track.js. The union of concrete track shapes is available there as
// `Track.Any` to avoid a duplicate-identifier conflict at the module boundary.
export { Track } from './track.js';

export { compileScene } from './compile.js';
export type { CompiledScene, TrackSpawn } from './compile.js';

export { BeatBinding, beatBindingCapsule, bindBeats } from './capsules/beat-binding.js';
export type { BeatComponent, BeatSpawn } from './capsules/beat-binding.js';

export { SceneRuntime, sceneRuntimeCapsule } from './runtime.js';
export type { SceneRuntimeHandle, SceneRuntimeOptions } from './runtime.js';

export { VideoSystem } from './systems/video.js';
export { AudioSystem } from './systems/audio.js';
export { TransitionSystem } from './systems/transition.js';
export { EffectSystem } from './systems/effect.js';
export { SyncSystem } from './systems/sync.js';
export { PassThroughMixer } from './systems/pass-through-mixer.js';
export type { MixReceipt } from './systems/pass-through-mixer.js';

export { Beat, resolveBeat } from './sugar/beat.js';
export type { BeatHandle } from './sugar/beat.js';
export { syncTo } from './sugar/sync-to.js';
export { fade, pulse } from './sugar/envelope.js';
export type { FadeEnvelope, PulseEnvelope } from './sugar/envelope.js';
export { ease } from './sugar/ease.js';
export type { EaseFn } from './sugar/ease.js';
export { Layout } from './sugar/layout.js';
export { Scene } from './include.js';
export type { SceneSubscenePartial } from './include.js';

export { inheritContext } from './context.js';
export type { SceneContext } from './context.js';

// `startDevServer` lives at `@czap/scene/dev` sub-path — it imports
// `node:os`, `node:crypto`, and Vite's server. Keeping it off the main
// entry prevents bundlers targeting browsers / Workers / Deno from hitting
// a hard import error at parse time on code paths they never call.

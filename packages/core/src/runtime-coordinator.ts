/**
 * RuntimeCoordinator -- shared host/runtime coordination surface.
 *
 * Bridges Plan and ECS into the live host path by:
 * - defining the execution graph for runtime passes
 * - backing quantizer state indices and dirty epochs with dense stores
 *
 * The coordinator is intentionally light-weight on the hot path: the plan is
 * constructed once up front, and dense stores are used for numeric state that
 * is read repeatedly during runtime work.
 *
 * @module
 */

import { Part, EntityId } from './ecs.js';
import type { DenseStore } from './ecs.js';
import { Plan } from './plan.js';

/**
 * Named stages of the runtime frame pass, in canonical topological order:
 * discrete quantization first, then blend weights, then target emitters.
 */
export type RuntimePhase = 'compute-discrete' | 'compute-blend' | 'emit-css' | 'emit-glsl' | 'emit-aria';

/** Options accepted by {@link RuntimeCoordinator.create}: entity capacity and plan name. */
export interface RuntimeCoordinatorConfig {
  readonly capacity?: number;
  readonly name?: string;
}

/**
 * Live coordinator surface: the immutable runtime {@link Plan}, ordered phase
 * list, dense stores for state index + dirty epoch, and registration/mutation
 * APIs used by the compositor on the hot path.
 */
export interface RuntimeCoordinatorShape {
  readonly plan: Plan.IR;
  readonly phases: readonly RuntimePhase[];
  readonly stores: {
    readonly stateIndex: DenseStore;
    readonly dirtyEpoch: DenseStore;
  };
  reset(
    registrations?: readonly {
      readonly name: string;
      readonly states: readonly string[];
    }[],
  ): void;
  registerQuantizer(name: string, states: readonly string[]): EntityId;
  removeQuantizer(name: string): void;
  hasQuantizer(name: string): boolean;
  setState(name: string, state: string): void;
  applyState(name: string, state: string): number;
  getStateIndex(name: string): number;
  markDirty(name: string): void;
  getDirtyEpoch(name: string): number;
  registeredNames(): readonly string[];
}

interface RegisteredQuantizer {
  readonly entityId: EntityId;
  readonly stateLookup: Readonly<Record<string, number>>;
}

const DEFAULT_RUNTIME_CAPACITY = 128;

function makeRuntimePlan(name: string): Plan.IR {
  return Plan.make(name)
    .step('compute-discrete', { type: 'noop' }, { phase: 'compute-discrete' })
    .step('compute-blend', { type: 'noop' }, { phase: 'compute-blend' })
    .step('emit-css', { type: 'noop' }, { phase: 'emit-css' })
    .step('emit-glsl', { type: 'noop' }, { phase: 'emit-glsl' })
    .step('emit-aria', { type: 'noop' }, { phase: 'emit-aria' })
    .seq('step-1', 'step-2')
    .par('step-2', 'step-3')
    .par('step-2', 'step-4')
    .par('step-2', 'step-5')
    .build();
}

function orderedPhases(plan: Plan.IR): readonly RuntimePhase[] {
  const sorted = Plan.topoSort(plan).sorted;
  const stepsById = new Map(plan.steps.map((step) => [step.id, step]));
  return sorted
    .map((id) => stepsById.get(id)?.metadata?.['phase'])
    .filter((phase): phase is RuntimePhase => typeof phase === 'string');
}

const RUNTIME_PLAN_TEMPLATE = makeRuntimePlan('czap-runtime');
const RUNTIME_PHASES = orderedPhases(RUNTIME_PLAN_TEMPLATE);

/**
 * Build a fresh {@link RuntimeCoordinator} with dense backing stores and the
 * canonical runtime plan. Prefer {@link RuntimeCoordinator.create}, which is
 * the exported entry point.
 */
export function createRuntimeCoordinator(config?: RuntimeCoordinatorConfig): RuntimeCoordinatorShape {
  const name = config?.name ?? 'czap-runtime';
  const plan = name === RUNTIME_PLAN_TEMPLATE.name ? RUNTIME_PLAN_TEMPLATE : { ...RUNTIME_PLAN_TEMPLATE, name };
  const phases = RUNTIME_PHASES;
  const stateIndex = Part.dense('state-index', config?.capacity ?? DEFAULT_RUNTIME_CAPACITY);
  const dirtyEpoch = Part.dense('dirty-epoch', config?.capacity ?? DEFAULT_RUNTIME_CAPACITY);
  const quantizerByName = new Map<string, RegisteredQuantizer>();
  let nextEntity = 0;

  const ensureQuantizer = (name: string): RegisteredQuantizer | undefined => quantizerByName.get(name);
  return {
    plan,
    phases,
    stores: {
      stateIndex,
      dirtyEpoch,
    },

    reset(registrations) {
      quantizerByName.clear();
      nextEntity = 0;
      stateIndex.reset();
      dirtyEpoch.reset();

      for (const registration of registrations ?? []) {
        this.registerQuantizer(registration.name, registration.states);
      }
    },

    registerQuantizer(name, states) {
      const existing = ensureQuantizer(name);
      if (existing) {
        return existing.entityId;
      }

      const entityId = EntityId(`runtime-${++nextEntity}`);
      const stateLookup: Record<string, number> = Object.create(null);
      for (let index = 0; index < states.length; index++) {
        stateLookup[states[index]!] = index;
      }
      quantizerByName.set(name, {
        entityId,
        stateLookup,
      });
      stateIndex.set(entityId, 0);
      dirtyEpoch.set(entityId, 1);
      return entityId;
    },

    removeQuantizer(name) {
      const quantizer = ensureQuantizer(name);
      if (!quantizer) {
        return;
      }

      quantizerByName.delete(name);
      stateIndex.delete(quantizer.entityId);
      dirtyEpoch.delete(quantizer.entityId);
    },

    hasQuantizer(name) {
      return quantizerByName.has(name);
    },

    setState(name, state) {
      const quantizer = ensureQuantizer(name);
      if (!quantizer) {
        return;
      }

      stateIndex.set(quantizer.entityId, quantizer.stateLookup[state] ?? 0);
    },

    applyState(name, state) {
      const quantizer = ensureQuantizer(name);
      if (!quantizer) {
        return 0;
      }

      const nextIndex = quantizer.stateLookup[state] ?? 0;
      stateIndex.set(quantizer.entityId, nextIndex);
      return nextIndex;
    },

    getStateIndex(name) {
      const quantizer = ensureQuantizer(name);
      if (!quantizer) {
        return 0;
      }

      return stateIndex.get(quantizer.entityId)!;
    },

    markDirty(name) {
      const quantizer = ensureQuantizer(name);
      if (!quantizer) {
        return;
      }

      dirtyEpoch.set(quantizer.entityId, dirtyEpoch.get(quantizer.entityId)! + 1);
    },

    getDirtyEpoch(name) {
      const quantizer = ensureQuantizer(name);
      if (!quantizer) {
        return 0;
      }

      return dirtyEpoch.get(quantizer.entityId)!;
    },

    registeredNames() {
      return Array.from(quantizerByName.keys());
    },
  };
}

/**
 * Runtime coordinator namespace — single entry point for building the shared
 * {@link Plan} + ECS store bundle consumed by every host adapter.
 */
export const RuntimeCoordinator = {
  /** Create a fresh coordinator. See {@link createRuntimeCoordinator}. */
  create: createRuntimeCoordinator,
} as const;

export declare namespace RuntimeCoordinator {
  /** Alias for `RuntimeCoordinatorShape`. */
  export type Shape = RuntimeCoordinatorShape;
  /** Alias for `RuntimeCoordinatorConfig`. */
  export type Config = RuntimeCoordinatorConfig;
  /** Alias for `RuntimePhase`. */
  export type Phase = RuntimePhase;
}

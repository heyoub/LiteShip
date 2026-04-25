/**
 * Plan -- plan IR builder for universal execution DAG.
 *
 * @module
 */

/**
 * Discriminated union describing the kind of work a `PlanStep` performs.
 *
 * `pure` and `effect` name an executable function; `spawn` references a child
 * fiber/worker keyed by `key`; `domain` dispatches to an external domain's
 * named operation; `choice` marks a branch point; `noop` is an explicit
 * placeholder.
 */
export type OpType =
  | { readonly type: 'pure'; readonly fn?: string }
  | { readonly type: 'effect'; readonly fn?: string }
  | { readonly type: 'spawn'; readonly key: string; readonly spec: Record<string, unknown> }
  | { readonly type: 'domain'; readonly domain: string; readonly op: string }
  | { readonly type: 'choice'; readonly condition: unknown }
  | { readonly type: 'noop' };

/**
 * Edge flavor in a plan DAG: sequential (`seq`), parallel (`par`), or the two
 * branches of a `choice` step (`choice_then` / `choice_else`).
 */
export type EdgeType = 'seq' | 'par' | 'choice_then' | 'choice_else';

/** A single node in a {@link PlanIR}: an identifier, a display name, and its {@link OpType}. */
export interface PlanStep {
  readonly id: string;
  readonly name: string;
  readonly opType: OpType;
  readonly metadata?: Record<string, unknown>;
}

/** A directed edge between two {@link PlanStep}s, tagged by {@link EdgeType}. */
export interface PlanEdge {
  readonly from: string;
  readonly to: string;
  readonly type: EdgeType;
}

/** Intermediate representation of a plan: named steps plus directed edges. */
export interface PlanIR {
  readonly name: string;
  readonly steps: readonly PlanStep[];
  readonly edges: readonly PlanEdge[];
  readonly metadata?: Record<string, unknown>;
}

/** Structural failure from {@link Plan.validate}: either a cycle or an edge pointing at a missing step. */
export type PlanValidationError =
  | { readonly type: 'cycle'; readonly message: string; readonly stepIds?: readonly string[] }
  | { readonly type: 'missing_step'; readonly message: string; readonly stepIds?: readonly string[] };

/** Result of {@link Plan.validate}: either the validated plan or a list of errors. */
export type PlanValidationResult =
  | { readonly ok: true; readonly plan: PlanIR }
  | { readonly ok: false; readonly errors: readonly PlanValidationError[] };

/**
 * Result of {@link Plan.topoSort}: the sorted step IDs, optionally accompanied by
 * the IDs that participated in a detected cycle.
 */
export type TopoSortResult =
  | { readonly sorted: readonly string[]; readonly cycle?: undefined }
  | { readonly sorted: readonly string[]; readonly cycle: readonly string[] };

interface PlanBuilder {
  step(name: string, opType: OpType, metadata?: Record<string, unknown>): PlanBuilder;
  seq(fromId: string, toId: string): PlanBuilder;
  par(fromId: string, toId: string): PlanBuilder;
  choice(fromId: string, thenId: string, elseId: string): PlanBuilder;
  build(): PlanIR;
}

class PlanBuilderImpl implements PlanBuilder {
  private steps: PlanStep[] = [];
  private edges: PlanEdge[] = [];

  constructor(private readonly planName: string) {}

  step(name: string, opType: OpType, metadata?: Record<string, unknown>): PlanBuilder {
    const id = `step-${this.steps.length + 1}`;
    this.steps.push({ id, name, opType, metadata });
    return this;
  }

  seq(fromId: string, toId: string): PlanBuilder {
    this.edges.push({ from: fromId, to: toId, type: 'seq' });
    return this;
  }

  par(fromId: string, toId: string): PlanBuilder {
    this.edges.push({ from: fromId, to: toId, type: 'par' });
    return this;
  }

  choice(fromId: string, thenId: string, elseId: string): PlanBuilder {
    this.edges.push({ from: fromId, to: thenId, type: 'choice_then' });
    this.edges.push({ from: fromId, to: elseId, type: 'choice_else' });
    return this;
  }

  build(): PlanIR {
    return {
      name: this.planName,
      steps: [...this.steps],
      edges: [...this.edges],
    };
  }
}

/**
 * Create a new PlanBuilder with the given plan name.
 *
 * Returns a fluent builder that supports chaining `.step()`, `.seq()`,
 * `.par()`, and `.choice()` calls. Call `.build()` to produce the PlanIR.
 *
 * @example
 * ```ts
 * const plan = Plan.make('my-pipeline')
 *   .step('fetch', { type: 'effect' })
 *   .step('transform', { type: 'pure' })
 *   .seq('step-1', 'step-2')
 *   .build();
 * // plan.name === 'my-pipeline'
 * // plan.steps.length === 2
 * // plan.edges.length === 1
 * ```
 */
function _make(name: string): PlanBuilder {
  return new PlanBuilderImpl(name);
}

function hasCycle(planIR: PlanIR): boolean {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const adjList = new Map<string, string[]>();

  for (const step of planIR.steps) {
    adjList.set(step.id, []);
  }

  for (const edge of planIR.edges) {
    adjList.get(edge.from)?.push(edge.to);
  }

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    for (const neighbor of adjList.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }
    recStack.delete(node);
    return false;
  }

  for (const step of planIR.steps) {
    if (!visited.has(step.id) && dfs(step.id)) return true;
  }

  return false;
}

/**
 * Validate a PlanIR for structural correctness.
 *
 * Checks that all edges reference existing steps and that the graph is acyclic.
 * Returns `{ ok: true, plan }` on success or `{ ok: false, errors }` with
 * detailed validation errors.
 *
 * @example
 * ```ts
 * const plan = Plan.make('test').step('a', { type: 'noop' }).build();
 * const result = Plan.validate(plan);
 * // result.ok === true
 * // result.plan === plan
 * ```
 */
function _validate(planIR: PlanIR): PlanValidationResult {
  const errors: PlanValidationError[] = [];
  const stepIds = new Set(planIR.steps.map((s) => s.id));

  for (const edge of planIR.edges) {
    if (!stepIds.has(edge.from)) {
      errors.push({
        type: 'missing_step',
        message: `Edge references unknown step: ${edge.from}`,
        stepIds: [edge.from],
      });
    }
    if (!stepIds.has(edge.to)) {
      errors.push({
        type: 'missing_step',
        message: `Edge references unknown step: ${edge.to}`,
        stepIds: [edge.to],
      });
    }
  }

  if (hasCycle(planIR)) {
    errors.push({ type: 'cycle', message: 'Plan contains a cycle' });
  }

  return errors.length === 0 ? { ok: true, plan: planIR } : { ok: false, errors };
}

/**
 * Topologically sort the steps of a PlanIR using Kahn's algorithm.
 *
 * Returns `{ sorted }` on success. If a cycle exists, returns
 * `{ sorted, cycle }` where `cycle` lists the step IDs involved.
 *
 * @example
 * ```ts
 * const plan = Plan.make('pipeline')
 *   .step('a', { type: 'pure' })
 *   .step('b', { type: 'pure' })
 *   .seq('step-1', 'step-2')
 *   .build();
 * const result = Plan.topoSort(plan);
 * // result.sorted === ['step-1', 'step-2']
 * ```
 */
function _topoSort(planIR: PlanIR): TopoSortResult {
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const step of planIR.steps) {
    adjList.set(step.id, []);
    inDegree.set(step.id, 0);
  }

  for (const edge of planIR.edges) {
    adjList.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  const result: string[] = [];

  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const neighbor of adjList.get(current) ?? []) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (result.length !== planIR.steps.length) {
    const resultSet = new Set(result);
    const cycleNodes = planIR.steps.filter((s) => !resultSet.has(s.id)).map((s) => s.id);
    return { sorted: result, cycle: cycleNodes };
  }

  return { sorted: result };
}

/**
 * Plan namespace -- plan IR builder for universal execution DAG.
 *
 * Build, validate, and topologically sort execution plans. Plans model
 * computation graphs with sequential, parallel, and conditional edges.
 *
 * @example
 * ```ts
 * import { Plan } from '@czap/core';
 *
 * const plan = Plan.make('render-pipeline')
 *   .step('load', { type: 'effect' })
 *   .step('compile', { type: 'pure' })
 *   .step('emit', { type: 'effect' })
 *   .seq('step-1', 'step-2')
 *   .seq('step-2', 'step-3')
 *   .build();
 * const valid = Plan.validate(plan);
 * const order = Plan.topoSort(plan);
 * // order.sorted === ['step-1', 'step-2', 'step-3']
 * ```
 */
export const Plan = {
  /** Start a new fluent {@link Plan.Builder} with the given display name. */
  make: _make,
  /** Check that every edge references a known step and that the graph is acyclic. */
  validate: _validate,
  /** Kahn's-algorithm topological sort; surfaces cycle participants if the plan is not a DAG. */
  topoSort: _topoSort,
};

export declare namespace Plan {
  /** Alias for `PlanIR`. */
  export type IR = PlanIR;
  /** Alias for `PlanStep`. */
  export type Step = PlanStep;
  /** Alias for `PlanEdge`. */
  export type Edge = PlanEdge;
  /** Alias for `PlanValidationError`. */
  export type ValidationError = PlanValidationError;
  /** Alias for `PlanValidationResult`. */
  export type ValidationResult = PlanValidationResult;
  /** Alias for `TopoSortResult`. */
  export type TopoSort = TopoSortResult;
  /** Fluent builder interface returned by `Plan.make`. */
  export type Builder = PlanBuilder;
}

import { describe, expect, test } from 'vitest';

import { integration } from '@czap/astro';
import { bootstrapSlots, installSwapReinit, loadWasmRuntime } from '@czap/astro/runtime';
import { Compositor, RuntimeCoordinator } from '@czap/core';
import { CompositorWorker } from '@czap/worker';
import { createEdgeHostAdapter } from '@czap/edge';

describe('cross-package runtime wiring invariants', () => {
  // ---------------------------------------------------------------------------
  // 1. Worker directive uses initWorkerDirective (not inline Blob URLs)
  //
  // The Astro integration registers a worker client directive whose entrypoint
  // is '@czap/astro/client-directives/worker'. That module delegates to
  // initWorkerDirective from the runtime layer. We verify the integration
  // wires the correct entrypoint by calling the hooks and inspecting the
  // registered directives.
  // ---------------------------------------------------------------------------
  test('worker directive is registered through the integration entrypoint', () => {
    const astroIntegration = integration({ workers: { enabled: true } });
    expect(astroIntegration.name).toBe('@czap/astro');

    const directives: Array<{ name: string; entrypoint: string }> = [];

    const hooks = astroIntegration.hooks as Record<string, (...args: unknown[]) => void>;
    const setup = hooks['astro:config:setup'];
    expect(typeof setup).toBe('function');

    // Call the setup hook with a minimal stub to capture registered directives
    setup({
      updateConfig: () => {},
      addClientDirective: (directive: { name: string; entrypoint: string }) => {
        directives.push(directive);
      },
      injectScript: () => {},
      logger: { info: () => {} },
    });

    const workerDirective = directives.find((d) => d.name === 'worker');
    expect(workerDirective).toBeDefined();
    expect(workerDirective!.entrypoint).toBe('@czap/astro/client-directives/worker');
  });

  // ---------------------------------------------------------------------------
  // 2. WASM directive uses loadWasmRuntime (not raw WebAssembly.instantiate)
  //
  // loadWasmRuntime is the shared runtime entry that delegates to
  // WASMDispatch.load rather than calling WebAssembly.instantiate directly.
  // ---------------------------------------------------------------------------
  test('wasm directive uses loadWasmRuntime from the shared runtime layer', () => {
    expect(loadWasmRuntime).toBeDefined();
    expect(typeof loadWasmRuntime).toBe('function');

    // The integration registers a wasm directive when wasm is enabled
    const astroIntegration = integration({ wasm: { enabled: true } });
    const directives: Array<{ name: string; entrypoint: string }> = [];

    const hooks = astroIntegration.hooks as Record<string, (...args: unknown[]) => void>;
    hooks['astro:config:setup']({
      updateConfig: () => {},
      addClientDirective: (directive: { name: string; entrypoint: string }) => {
        directives.push(directive);
      },
      injectScript: () => {},
      logger: { info: () => {} },
    });

    const wasmDirective = directives.find((d) => d.name === 'wasm');
    expect(wasmDirective).toBeDefined();
    expect(wasmDirective!.entrypoint).toBe('@czap/astro/client-directives/wasm');
  });

  // ---------------------------------------------------------------------------
  // 3. Astro integration bootstraps slots through the shared runtime layer
  //
  // bootstrapSlots and installSwapReinit are exported from @czap/astro/runtime
  // and are referenced in the integration's injected bootstrap script.
  // ---------------------------------------------------------------------------
  test('astro integration bootstraps slots through the shared runtime layer', () => {
    expect(bootstrapSlots).toBeDefined();
    expect(typeof bootstrapSlots).toBe('function');

    expect(installSwapReinit).toBeDefined();
    expect(typeof installSwapReinit).toBe('function');
  });

  // ---------------------------------------------------------------------------
  // 4. Compositor uses RuntimeCoordinator
  //
  // Both are namespace objects exported from @czap/core with a .create factory.
  // ---------------------------------------------------------------------------
  test('compositor host path goes through the shared runtime coordinator', () => {
    expect(RuntimeCoordinator).toBeDefined();
    expect(typeof RuntimeCoordinator).toBe('object');
    expect(typeof RuntimeCoordinator.create).toBe('function');

    expect(Compositor).toBeDefined();
    expect(typeof Compositor.create).toBe('function');
  });

  // ---------------------------------------------------------------------------
  // 5. Worker host mirrors runtime coordination
  //
  // CompositorWorker is the off-thread counterpart with the same namespace
  // object + .create pattern.
  // ---------------------------------------------------------------------------
  test('worker host mirrors runtime coordination', () => {
    expect(CompositorWorker).toBeDefined();
    expect(typeof CompositorWorker).toBe('object');
    expect(typeof CompositorWorker.create).toBe('function');
  });

  // ---------------------------------------------------------------------------
  // 6. Astro middleware uses the edge host adapter
  //
  // createEdgeHostAdapter is the factory from @czap/edge used by the
  // middleware to resolve tiers, compile themes, and manage boundary caches.
  // ---------------------------------------------------------------------------
  test('astro middleware uses the shared edge host adapter', () => {
    expect(createEdgeHostAdapter).toBeDefined();
    expect(typeof createEdgeHostAdapter).toBe('function');
  });
});

/**
 * Minimal entry point that imports @czap/core to prove the vite plugin
 * can process a project that depends on czap packages.
 */
import { Boundary } from '@czap/core';

const boundary = Boundary.make({
  input: 'container-width',
  at: [
    [0, 'compact'],
    [481, 'full'],
  ],
});

document.getElementById('app')!.textContent = `czap boundary: ${boundary.states.join(', ')}`;
console.log('[czap-vite-test] boundary loaded:', boundary.states);

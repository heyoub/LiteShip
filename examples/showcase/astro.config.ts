import { defineConfig } from 'astro/config';
import { integration } from '@czap/astro';

export default defineConfig({
  integrations: [
    integration({
      detect: true,
      stream: { enabled: true },
      llm: { enabled: true },
      workers: { enabled: true },
      gpu: { enabled: true, preferWebGPU: false },
      wasm: { enabled: true },
    }),
  ],
});

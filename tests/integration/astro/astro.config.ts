import { defineConfig } from 'astro/config';
import { integration } from '@czap/astro';

export default defineConfig({
  integrations: [
    integration({
      detect: true,
      serverIslands: false,
    }),
  ],
});

import { defineConfig } from 'astro/config';
import { integration } from '@czap/astro';

export default defineConfig({
  integrations: [
    integration({
      // Enable device capability detection (injects inline script that sets
      // data-czap-tier, data-czap-scheme, --czap-vw, etc. on <html>).
      detect: true,

      // Enable the SSE stream client directive (client:stream).
      // This powers Tutorial 04 -- Server Streaming.
      stream: { enabled: true },

      // Enable the LLM client directive (client:llm).
      // This powers Tutorial 05 -- LLM Streaming.
      llm: { enabled: true },
    }),
  ],
});

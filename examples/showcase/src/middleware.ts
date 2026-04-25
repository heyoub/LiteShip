import { czapMiddleware } from '@czap/astro';

/**
 * Astro middleware -- parses Client Hints, computes device tier,
 * and injects czap locals for downstream components.
 */
export const onRequest = czapMiddleware();

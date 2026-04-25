/**
 * Spacing design tokens.
 *
 * Tokens are named design values that can vary across axes (theme, density,
 * contrast, etc.). czap compiles them to CSS custom properties so they
 * participate in the cascade naturally.
 *
 * Each token below defines a single axis ("density") with two variants:
 *   - "default"  -- standard spacing for desktop
 *   - "compact"  -- tighter spacing for mobile / dense layouts
 *
 * The `fallback` is used when no axis value matches.
 *
 * In CSS, these become:
 *   --gap-sm: <resolved value>;
 *   --gap-md: <resolved value>;
 *   --gap-lg: <resolved value>;
 */

import { Token } from '@czap/core';

export const gapSm = Token.make({
  name: 'gap-sm',
  category: 'spacing',
  axes: ['density'] as const,
  values: {
    default: '0.5rem',
    compact: '0.25rem',
  },
  fallback: '0.5rem',
});

export const gapMd = Token.make({
  name: 'gap-md',
  category: 'spacing',
  axes: ['density'] as const,
  values: {
    default: '1rem',
    compact: '0.5rem',
  },
  fallback: '1rem',
});

export const gapLg = Token.make({
  name: 'gap-lg',
  category: 'spacing',
  axes: ['density'] as const,
  values: {
    default: '2rem',
    compact: '1rem',
  },
  fallback: '2rem',
});

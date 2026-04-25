import { Theme } from '@czap/core';

/**
 * Dark theme definition.
 *
 * Overrides surface and text tokens for dark mode rendering.
 * The meta labels allow UI chrome (theme toggle, settings) to
 * present human-readable names and infer light/dark semantics.
 */
export const dark = Theme.make({
  name: 'brand',
  variants: ['light', 'dark'] as const,
  tokens: {
    primary: { light: '#4f46e5', dark: '#818cf8' },
    secondary: { light: '#0d9488', dark: '#2dd4bf' },
    surface: { light: '#ffffff', dark: '#0f172a' },
    text: { light: '#1e293b', dark: '#e2e8f0' },
    muted: { light: '#64748b', dark: '#94a3b8' },
    border: { light: '#e2e8f0', dark: '#334155' },
  },
  meta: {
    light: { label: 'Light', mode: 'light' },
    dark: { label: 'Dark', mode: 'dark' },
  },
});

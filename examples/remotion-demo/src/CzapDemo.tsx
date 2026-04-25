/**
 * CzapDemo -- Remotion composition component driven by czap CompositeState.
 *
 * Reads the current frame's CompositeState via useCzapState(),
 * converts to CSS custom properties, and renders a centered "czap"
 * title with scale transform and dynamic background from the boundary.
 *
 * @module
 */

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { useCzapState, cssVarsFromState } from '@czap/remotion';
import type { CSSProperties } from 'react';

export function CzapDemo() {
  const state = useCzapState();
  const vars = cssVarsFromState(state);
  const frame = useCurrentFrame();

  const scale = vars['--scale'] ?? '1';
  const bg = vars['--bg'] ?? '#000000';
  const fg = vars['--fg'] ?? '#ffffff';
  const currentState = state.discrete['scale'] ?? 'idle';

  const containerStyle: CSSProperties = {
    ...vars,
    backgroundColor: bg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const titleStyle: CSSProperties = {
    color: fg,
    fontSize: 120,
    fontWeight: 900,
    letterSpacing: '-0.04em',
    transform: `scale(${scale})`,
    transition: 'transform 0.1s ease-out',
  };

  const subtitleStyle: CSSProperties = {
    color: fg,
    fontSize: 24,
    fontWeight: 400,
    opacity: 0.6,
    marginTop: 16,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
  };

  const badgeStyle: CSSProperties = {
    color: fg,
    fontSize: 14,
    fontWeight: 600,
    opacity: 0.4,
    marginTop: 32,
    padding: '6px 16px',
    border: `1px solid ${fg}40`,
    borderRadius: 20,
  };

  return (
    <AbsoluteFill style={containerStyle}>
      <div style={titleStyle}>czap</div>
      <div style={subtitleStyle}>constraint-based adaptive rendering</div>
      <div style={badgeStyle}>
        state: {currentState} · frame {frame} · scale {scale}x
      </div>
    </AbsoluteFill>
  );
}

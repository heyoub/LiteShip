/**
 * HMR handler for `czap:update` messages.
 *
 * Performs surgical DOM updates when `@quantize` CSS or shader
 * uniforms change during development, avoiding full page reloads.
 *
 * @module
 */

declare global {
  interface HTMLCanvasElement {
    /**
     * czap runtime-attached WebGL program for HMR uniform updates.
     * Set by the shader directive when a program is linked.
     */
    __czapProgram?: WebGLProgram;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of the HMR payload the czap Vite plugin ships over the Vite
 * dev-server WebSocket. Handled by {@link handleHMR} on the client.
 */
export interface HMRPayload {
  /** Message discriminator. Always `'czap:update'`. */
  readonly type: 'czap:update';
  /** Boundary id whose compiled output changed. */
  readonly boundary: string;
  /** New compiled CSS (omitted when only uniforms changed). */
  readonly css?: string;
  /** New shader-uniform values (omitted when only CSS changed). */
  readonly uniforms?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// CSS Hot Update
// ---------------------------------------------------------------------------

/**
 * Find or create a <style> element for a specific boundary's compiled CSS.
 * Uses a data attribute for identification across HMR cycles.
 */
function getOrCreateStyleElement(boundaryId: string): HTMLStyleElement {
  const selector = `style[data-czap-boundary="${boundaryId}"]`;
  const existing = document.querySelector(selector);
  if (existing instanceof HTMLStyleElement) return existing;

  const el = document.createElement('style');
  el.setAttribute('data-czap-boundary', boundaryId);
  document.head.appendChild(el);
  return el;
}

/**
 * Apply CSS updates by replacing the boundary's style element content.
 */
function applyCSSUpdate(boundary: string, css: string): void {
  const el = getOrCreateStyleElement(boundary);
  el.textContent = css;
}

// ---------------------------------------------------------------------------
// Shader Uniform Hot Update
// ---------------------------------------------------------------------------

/**
 * Update shader uniform values on all canvases that have a czap-boundary
 * attribute matching the boundary name.
 *
 * This works by dispatching a custom event that the czap runtime shader
 * system listens for, passing the uniform map for in-place updates.
 */
function applyUniformUpdate(boundary: string, uniforms: Record<string, number>): void {
  const event = new CustomEvent('czap:uniform-update', {
    detail: { boundary, uniforms },
    bubbles: true,
  });
  document.dispatchEvent(event);

  // Direct update: find canvas elements with matching boundary data attribute
  const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>(`canvas[data-czap-boundary="${boundary}"]`));
  for (const canvas of canvases) {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) continue;

    // Look up the program stored on the canvas element via a custom property
    const program = canvas.__czapProgram;
    if (!program) continue;

    for (const [name, value] of Object.entries(uniforms)) {
      const location = gl.getUniformLocation(program, name);
      if (location !== null) {
        gl.uniform1f(location, value);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Handle a czap:update HMR payload.
 * Dispatches to CSS replacement or shader uniform updates based on payload content.
 */
export function handleHMR(payload: HMRPayload): void {
  if (typeof document === 'undefined') return;

  if (payload.css !== undefined) {
    applyCSSUpdate(payload.boundary, payload.css);
  }

  if (payload.uniforms !== undefined) {
    applyUniformUpdate(payload.boundary, payload.uniforms);
  }
}

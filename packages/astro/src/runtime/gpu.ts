import { Diagnostics, CANVAS_FALLBACK_WIDTH, CANVAS_FALLBACK_HEIGHT } from '@czap/core';
import { readRuntimeEndpointPolicy } from './policy.js';
import { allowRuntimeEndpointUrl } from './url-policy.js';

const DEFAULT_VERTEX_SHADER = `#version 300 es
precision mediump float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FULLSCREEN_QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    Diagnostics.warn({
      source: 'czap/astro.gpu',
      code: 'shader-compile-failed',
      message: 'Shader compilation failed.',
      detail: gl.getShaderInfoLog(shader),
    });
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    Diagnostics.warn({
      source: 'czap/astro.gpu',
      code: 'program-link-failed',
      message: 'Shader program linking failed.',
      detail: gl.getProgramInfoLog(program),
    });
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

/**
 * Entry point used by the `client:gpu` directive to wire a
 * satellite element to a WebGL shader.
 *
 * Reads `data-czap-shader-type` / `data-czap-shader-src` off the
 * element, fetches and compiles the program, then subscribes to
 * `czap:uniform-update` events so each boundary transition updates the
 * shader uniforms.
 *
 * @param load - Dynamic-import factory the directive passes in (kept
 *   async so the expensive GPU module is code-split).
 * @param el - Satellite element carrying the shader attributes.
 */
export function initGPUDirective(load: () => Promise<unknown>, el: HTMLElement): void {
  const shaderType = el.getAttribute('data-czap-shader-type') ?? 'glsl';
  const shaderSrc = allowRuntimeEndpointUrl(
    el.getAttribute('data-czap-shader-src'),
    'gpu-shader',
    'czap/astro.gpu',
    {
      crossOriginRejected: 'shader-cross-origin-url-rejected',
      malformedUrl: 'shader-malformed-url-rejected',
      originNotAllowed: 'shader-origin-not-allowed',
      endpointKindNotPermitted: 'shader-endpoint-kind-not-permitted',
    },
    readRuntimeEndpointPolicy(),
  );

  const tier = document.documentElement.getAttribute('data-czap-tier') ?? 'reactive';
  if (tier === 'static' || tier === 'styled') {
    load();
    return;
  }

  if (shaderType === 'wgsl') {
    Diagnostics.warnOnce({
      source: 'czap/astro.gpu',
      code: 'wgsl-not-yet-supported',
      message:
        'WGSL shader directives are not yet wired into the Astro GPU runtime. Use WGSLCompiler directly for WGSL output.',
    });
    load();
    return;
  }

  let canvas: HTMLCanvasElement;
  if (el instanceof HTMLCanvasElement) {
    canvas = el;
  } else {
    canvas = document.createElement('canvas');
    canvas.width = el.clientWidth || CANVAS_FALLBACK_WIDTH;
    canvas.height = el.clientHeight || CANVAS_FALLBACK_HEIGHT;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    el.appendChild(canvas);
  }

  const gl = canvas.getContext('webgl2');
  if (!gl) {
    Diagnostics.warnOnce({
      source: 'czap/astro.gpu',
      code: 'webgl2-unavailable',
      message: 'WebGL2 is unavailable; falling back to CSS rendering.',
    });
    load();
    return;
  }

  const webgl = gl;

  async function initShader(): Promise<void> {
    let fragSource: string;

    if (shaderSrc && (shaderSrc.startsWith('/') || shaderSrc.startsWith('http'))) {
      try {
        const response = await fetch(shaderSrc);
        if (!response.ok) {
          Diagnostics.warn({
            source: 'czap/astro.gpu',
            code: 'shader-fetch-failed',
            message: 'Failed to fetch shader source.',
            detail: response.statusText,
          });
          return;
        }
        fragSource = await response.text();
      } catch (err) {
        Diagnostics.warn({
          source: 'czap/astro.gpu',
          code: 'shader-fetch-threw',
          message: 'Fetching shader source threw an error.',
          cause: err,
        });
        return;
      }
    } else if (shaderSrc) {
      fragSource = shaderSrc;
    } else {
      fragSource = `#version 300 es
precision mediump float;
in vec2 v_uv;
out vec4 fragColor;
uniform float u_state;
uniform float u_time;
void main() {
  vec3 color = mix(vec3(0.2, 0.3, 0.8), vec3(0.8, 0.3, 0.2), u_state);
  float bands = 4.0;
  color = floor(color * bands) / bands;
  fragColor = vec4(color, 1.0);
}`;
    }

    const program = createProgram(webgl, DEFAULT_VERTEX_SHADER, fragSource);
    if (!program) return;

    webgl.useProgram(program);

    const vao = webgl.createVertexArray();
    webgl.bindVertexArray(vao);
    const buffer = webgl.createBuffer();
    webgl.bindBuffer(webgl.ARRAY_BUFFER, buffer);
    webgl.bufferData(webgl.ARRAY_BUFFER, FULLSCREEN_QUAD, webgl.STATIC_DRAW);
    const posLoc = webgl.getAttribLocation(program, 'a_position');
    webgl.enableVertexAttribArray(posLoc);
    webgl.vertexAttribPointer(posLoc, 2, webgl.FLOAT, false, 0, 0);

    const uniforms = new Map<string, WebGLUniformLocation>();
    const numUniforms = webgl.getProgramParameter(program, webgl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = webgl.getActiveUniform(program, i);
      if (info) {
        const loc = webgl.getUniformLocation(program, info.name);
        if (loc) uniforms.set(info.name, loc);
      }
    }

    const startTime = performance.now();
    let animFrame = 0;

    function render(): void {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        webgl.viewport(0, 0, w, h);
      }

      const timeLoc = uniforms.get('u_time');
      if (timeLoc) {
        webgl.uniform1f(timeLoc, (performance.now() - startTime) / 1000);
      }

      const resLoc = uniforms.get('u_resolution');
      if (resLoc) {
        webgl.uniform2f(resLoc, w, h);
      }

      webgl.drawArrays(webgl.TRIANGLES, 0, 6);
      animFrame = requestAnimationFrame(render);
    }

    const onElementUniformUpdate = (event: Event): void => {
      /* v8 ignore next — `czap:uniform-update` is always dispatched via `new CustomEvent(...)`;
         the guard narrows the generic `Event` parameter for TypeScript's typed `.detail` access. */
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail;
      if (!detail) return;

      const boundaryJson = el.getAttribute('data-czap-boundary');
      if (boundaryJson && detail.discrete) {
        try {
          const boundary = JSON.parse(boundaryJson);
          const stateName = detail.discrete[boundary.id ?? 'default'];
          if (stateName) {
            const idx = boundary.states.indexOf(stateName);
            const stateLoc = uniforms.get('u_state');
            if (stateLoc && idx >= 0) {
              webgl.uniform1f(stateLoc, idx / Math.max(1, boundary.states.length - 1));
            }
          }
        } catch {
          Diagnostics.warnOnce({
            source: 'czap/astro.gpu',
            code: 'uniform-update-parse-failed',
            message: 'Failed to parse boundary JSON during uniform update.',
          });
        }
      }

      if (detail.css) {
        for (const [key, value] of Object.entries(detail.css)) {
          const uniformName = key.replace('--czap-', 'u_').replace(/-/g, '_');
          const loc = uniforms.get(uniformName);
          if (loc && typeof value === 'string') {
            const num = parseFloat(value);
            if (!Number.isNaN(num)) {
              webgl.uniform1f(loc, num);
            }
          }
        }
      }
    };

    const onDocumentUniformUpdate = (event: Event): void => {
      /* v8 ignore next — `czap:uniform-update` is always dispatched via `new CustomEvent(...)`;
         the guard narrows the generic `Event` parameter for TypeScript's typed `.detail` access. */
      if (!(event instanceof CustomEvent)) return;
      if (event.detail?.uniform && event.detail?.value !== undefined) {
        const loc = uniforms.get(event.detail.uniform);
        if (loc) {
          webgl.uniform1f(loc, event.detail.value);
        }
      }
    };

    el.addEventListener('czap:uniform-update', onElementUniformUpdate);
    document.addEventListener('czap:uniform-update', onDocumentUniformUpdate);

    el.dispatchEvent(new CustomEvent('czap:gpu-ready', { bubbles: true }));
    render();

    el.addEventListener('czap:reinit', () => {
      cancelAnimationFrame(animFrame);
      el.removeEventListener('czap:uniform-update', onElementUniformUpdate);
      document.removeEventListener('czap:uniform-update', onDocumentUniformUpdate);
      webgl.deleteProgram(program);
    });
  }

  void initShader();
  load();
}

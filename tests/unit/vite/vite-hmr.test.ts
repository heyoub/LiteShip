// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { handleHMR } from '@czap/vite';

describe('@czap/vite HMR handler', () => {
  test('creates or updates a style tag for css payloads', () => {
    handleHMR({
      type: 'czap:update',
      boundary: 'hero',
      css: '.hero { color: red; }',
    });

    const style = document.querySelector('style[data-czap-boundary="hero"]');
    expect(style?.textContent).toContain('color: red');

    handleHMR({
      type: 'czap:update',
      boundary: 'hero',
      css: '.hero { color: blue; }',
    });
    expect(style?.textContent).toContain('color: blue');
  });

  test('dispatches uniform updates and applies them to matching canvases', () => {
    const uniformCalls: Array<[string, number]> = [];
    const gl = {
      getUniformLocation: (_program: unknown, name: string) => name,
      uniform1f: (location: string, value: number) => {
        uniformCalls.push([location, value]);
      },
    };

    const canvas = document.createElement('canvas') as HTMLCanvasElement & {
      __czapProgram?: Record<string, unknown>;
    };
    canvas.setAttribute('data-czap-boundary', 'hero');
    canvas.__czapProgram = {};
    vi.spyOn(canvas, 'getContext').mockImplementation((kind: string) => (kind === 'webgl2' ? null : (gl as never)));
    document.body.appendChild(canvas);

    const payloads: unknown[] = [];
    document.addEventListener('czap:uniform-update', ((event: CustomEvent) => {
      payloads.push(event.detail);
    }) as EventListener);

    handleHMR({
      type: 'czap:update',
      boundary: 'hero',
      uniforms: { u_progress: 0.75 },
    });

    expect(payloads).toEqual([{ boundary: 'hero', uniforms: { u_progress: 0.75 } }]);
    expect(uniformCalls).toEqual([['u_progress', 0.75]]);
  });

  test('ignores updates when document is unavailable and skips canvases without a usable GL program', () => {
    const originalDocument = globalThis.document;
    vi.stubGlobal('document', undefined);

    expect(() =>
      handleHMR({
        type: 'czap:update',
        boundary: 'hero',
        css: '.hero { color: green; }',
      }),
    ).not.toThrow();

    vi.unstubAllGlobals();
    vi.stubGlobal('document', originalDocument);

    const payloads: unknown[] = [];
    document.addEventListener('czap:uniform-update', ((event: CustomEvent) => {
      payloads.push(event.detail);
    }) as EventListener);

    const noContextCanvas = document.createElement('canvas');
    noContextCanvas.setAttribute('data-czap-boundary', 'hero');
    vi.spyOn(noContextCanvas, 'getContext').mockReturnValue(null);
    document.body.appendChild(noContextCanvas);

    const noProgramCanvas = document.createElement('canvas');
    noProgramCanvas.setAttribute('data-czap-boundary', 'hero');
    vi.spyOn(noProgramCanvas, 'getContext').mockReturnValue({
      getUniformLocation: vi.fn(),
      uniform1f: vi.fn(),
    } as unknown as RenderingContext);
    document.body.appendChild(noProgramCanvas);

    expect(() =>
      handleHMR({
        type: 'czap:update',
        boundary: 'hero',
        uniforms: { u_progress: 0.5 },
      }),
    ).not.toThrow();

    expect(payloads).toEqual([{ boundary: 'hero', uniforms: { u_progress: 0.5 } }]);
  });

  test('skips uniform writes when getUniformLocation returns null', () => {
    const uniform1f = vi.fn();
    const gl = {
      getUniformLocation: vi.fn(() => null),
      uniform1f,
    };

    const canvas = document.createElement('canvas') as HTMLCanvasElement & {
      __czapProgram?: Record<string, unknown>;
    };
    canvas.setAttribute('data-czap-boundary', 'hero');
    canvas.__czapProgram = {};
    vi.spyOn(canvas, 'getContext').mockReturnValue(gl as unknown as RenderingContext);
    document.body.appendChild(canvas);

    handleHMR({
      type: 'czap:update',
      boundary: 'hero',
      uniforms: { u_progress: 0.25 },
    });

    expect(gl.getUniformLocation).toHaveBeenCalledWith(canvas.__czapProgram, 'u_progress');
    expect(uniform1f).not.toHaveBeenCalled();
  });
});

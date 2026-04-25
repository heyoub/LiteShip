/**
 * GPU probe upgrade -- replaces provisional tier with full detection.
 *
 * Runs after DOMContentLoaded (not render-blocking). Creates a throwaway
 * WebGL context, reads the GPU renderer string, classifies the GPU tier
 * using the same heuristics as `@czap/detect`, and updates the HTML element
 * attributes.
 *
 * @module
 */

/**
 * Inline script that performs full GPU tier detection.
 * Deferred to DOMContentLoaded to avoid blocking rendering.
 */
export const DETECT_UPGRADE_SCRIPT = `
(function(){
  function writeDetectState(next) {
    var safe = Object.freeze(Object.assign({}, next));
    try {
      Object.defineProperty(window, '__CZAP_DETECT__', {
        value: safe,
        configurable: true,
        enumerable: false,
        writable: false
      });
    } catch (_) {
      try {
        window.__CZAP_DETECT__ = safe;
      } catch (_) {}
    }
  }

  function upgrade() {
    try {
      var h = document.documentElement;
      var tier = 1;
      var renderer = '';
      var webgpu = false;

      // WebGL renderer probe
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
        }
        // Classify GPU tier from renderer string
        var r = renderer.toLowerCase();
        if (/swiftshader|llvmpipe|virtualbox|vmware/.test(r)) {
          tier = 0; // software
        } else if (/rtx|radeon rx [67]|apple m[3-9]|adreno 7/.test(r)) {
          tier = 3; // high
        } else if (/geforce|radeon rx [45]|adreno [56]|mali-g7|apple m[12]|intel arc/.test(r)) {
          tier = 2; // mid
        } else if (/intel|mali|adreno [1-4]|powervr|apple gpu/.test(r)) {
          tier = 1; // integrated
        }
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }

      // WebGPU check
      if (typeof navigator !== 'undefined' && navigator.gpu) {
        webgpu = true;
      }

      // Compute final tier using GPU + cores + memory
      var cores = navigator.hardwareConcurrency || 2;
      var mem = navigator.deviceMemory || 4;
      var motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      var capLevel = 'reactive';
      if (motion) capLevel = 'static';
      else if (tier === 0 || cores <= 2 || mem <= 2) capLevel = 'styled';
      else if (tier >= 3 && cores >= 4 && webgpu) capLevel = 'gpu';
      else if (tier >= 2 && cores >= 4) capLevel = 'animated';

      var motionTier = 'animations';
      if (motion) motionTier = 'none';
      else if (tier === 0 || cores <= 2) motionTier = 'transitions';
      else if (tier >= 3 && webgpu) motionTier = 'compute';
      else if (tier >= 2) motionTier = 'physics';

      h.setAttribute('data-czap-tier', capLevel);
      h.setAttribute('data-czap-gpu-tier', String(tier));
      if (webgpu) h.setAttribute('data-czap-webgpu', 'true');
      h.removeAttribute('data-czap-tier-provisional');

      // Update a minimal runtime snapshot instead of exposing the full probe payload.
      writeDetectState({
        tier: capLevel,
        gpuTier: tier,
        webgpu: webgpu,
        motionTier: motionTier
      });
    } catch(e) { try { document.documentElement.setAttribute('data-czap-tier-probe-error', 'true'); } catch(_) {} }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', upgrade);
  } else {
    upgrade();
  }
})();
`.trim();

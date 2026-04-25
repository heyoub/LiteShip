import { initGPUDirective } from '../runtime/gpu.js';

export default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {
  initGPUDirective(load, el);
};

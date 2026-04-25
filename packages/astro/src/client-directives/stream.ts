import { initStreamDirective } from '../runtime/stream.js';

export default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {
  initStreamDirective(load, el);
};

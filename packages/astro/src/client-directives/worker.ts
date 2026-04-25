import { initWorkerDirective } from '../runtime/worker.js';

export default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {
  initWorkerDirective(load, el);
};

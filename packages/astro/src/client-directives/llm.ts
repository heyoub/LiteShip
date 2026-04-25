import { initLLMDirective } from '../runtime/llm.js';

export default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {
  initLLMDirective(load, el);
};

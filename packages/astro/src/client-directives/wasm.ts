import { loadWasmRuntime } from '../runtime/wasm.js';

export default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {
  void loadWasmRuntime(el);
  load();
};

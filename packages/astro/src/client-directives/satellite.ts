import { initSatelliteDirective } from '../runtime/satellite.js';

export default (load: () => Promise<unknown>, _opts: Record<string, unknown>, el: HTMLElement) => {
  initSatelliteDirective(load, el);
};

/**
 * Test helpers -- shared mocks and utilities.
 */

export { MockEventSource } from './mock-event-source.js';
export { MockWebSocket } from './mock-websocket.js';
export { mockHTMLElement, mockCanvas } from './mock-dom.js';
export type { MockHTMLElementShape, MockCanvasShape } from './mock-dom.js';
export { MockWorker } from './mock-worker.js';
export { mockNavigator, mockMatchMedia, mockWebGL, mockViewport } from './mock-browser.js';
export type { NavigatorOverrides, MockMediaQueryList } from './mock-browser.js';
export {
  runScoped,
  runScopedAsync,
  collectStream,
  collectStreamAsync,
  drainStream,
  drainStreamAsync,
} from './effect-test.js';
export {
  definePropertyStub,
  createStubRegistry,
  stubWorkerEnvironment,
} from './define-property-stub.js';

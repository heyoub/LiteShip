// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('web.stream.receipt', () => {
  it.skip('contract shape: input and output decode/encode round-trip', () => {
    // TODO(harness): wire schema round-trip via cap.input / cap.output.
  });

  it.skip('is idempotent: two identical inputs produce equivalent receipts', () => {
    // TODO(harness): receipted mutations need a runtime channel to invoke
    // — until cap exposes a typed mutate handler, skip rather than fake.
  });

  it.skip('emits audit receipt with declared capabilities', () => {
    // TODO(harness): same — needs runtime channel to read emitted receipts.
  });

  it.skip('fault injection: declared faults are reachable', () => {
    // TODO(harness): faults table not yet on the capsule contract.
  });
});

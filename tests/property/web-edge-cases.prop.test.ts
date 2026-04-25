/**
 * Property test: Web package edge cases and browser API fallbacks.
 *
 * Tests WebCodecs fallback, URL validation security, and slot registry error recovery.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { resolveRuntimeUrl, SlotRegistry } from '@czap/web';

// Mock DOM APIs for Node.js test environment
const mockCreateElement = vi.fn(() => ({
  dispatchEvent: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(global, 'document', {
    value: {
      createElement: mockCreateElement,
      dispatchEvent: vi.fn(),
    },
    writable: true,
  });
});

describe('Web package edge cases', () => {

  describe('RuntimeURL security validation', () => {
    test('rejects dangerous protocols deterministically', () => {
      fc.assert(
        fc.property(fc.string(), (url) => {
          const result = resolveRuntimeUrl(url, {
            kind: 'stream',
            policy: { mode: 'allowlist', allowOrigins: ['*'], byKind: { stream: ['*'] } },
          });

          // Should reject dangerous protocols
          if (url.startsWith('javascript:')) {
            return result.type !== 'allowed';
          }
          if (url.startsWith('data:')) {
            return result.type !== 'allowed';
          }
          if (url.startsWith('vbscript:')) {
            return result.type !== 'allowed';
          }

          // Should return a valid resolution type for any input
          return ['missing', 'malformed', 'cross-origin-rejected', 'origin-not-allowed', 'kind-not-allowed', 'private-ip-rejected', 'allowed'].includes(result.type);
        }),
      );
    });

    test('URL parsing edge cases are handled consistently', () => {
      fc.assert(
        fc.property(fc.oneof(
          fc.string(),
          fc.constant(null),
          fc.constant(undefined)
        ), (url) => {
          const result = resolveRuntimeUrl(url, {
            kind: 'stream',
            policy: { mode: 'allowlist', allowOrigins: ['*'], byKind: { stream: ['*'] } },
          });

          // Should always return a valid resolution type
          return ['missing', 'malformed', 'cross-origin-rejected', 'origin-not-allowed', 'kind-not-allowed', 'private-ip-rejected', 'allowed'].includes(result.type);
        }),
      );
    });

    test('private IP detection is deterministic', () => {
      fc.assert(
        fc.property(fc.string(), (hostname) => {
          // Test known private IP patterns
          const privateIPs = [
            '127.0.0.1',
            '10.0.0.1',
            '192.168.1.1',
            '172.16.0.1',
            '169.254.169.254',
            '::1',
            'fe80::1',
            'fc00::1',
          ];

          const url = `http://${hostname}/test`;
          const result = resolveRuntimeUrl(url, {
            kind: 'stream',
            policy: { mode: 'allowlist', allowOrigins: ['*'], byKind: { stream: ['*'] } },
          });

          // Private IPs should be rejected
          if (privateIPs.includes(hostname)) {
            return result.type === 'private-ip-rejected';
          }

          // Should return some valid resolution
          return ['missing', 'malformed', 'cross-origin-rejected', 'origin-not-allowed', 'kind-not-allowed', 'private-ip-rejected', 'allowed'].includes(result.type);
        }),
      );
    });
  });

  describe('SlotRegistry error recovery', () => {
    test('handles invalid paths gracefully', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (invalidPath) => {
          const registry = SlotRegistry.create();

          // Should handle invalid paths without throwing
          registry.register({
            path: invalidPath as any,
            element: document.createElement('div'),
            mode: 'partial' as const,
            mounted: true,
          });

          // Should not throw and should maintain registry integrity
          return registry.has(invalidPath as any) === true;
        }),
      );
    });

    test('registry operations maintain consistency', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 5 }), (paths) => {
          const registry = SlotRegistry.create();
          const elements = paths.map(() => document.createElement('div'));

          // Register all paths
          paths.forEach((path, index) => {
            registry.register({
              path: path as any,
              element: elements[index],
              mode: 'partial' as const,
              mounted: true,
            });
          });

          // All should be registered
          const allRegistered = paths.every(path => registry.has(path as any));

          // Find by prefix should work
          const prefixResults = registry.findByPrefix(paths[0] as any);
          const prefixConsistent = prefixResults.every((entry: any) =>
            (entry.path as string).startsWith(paths[0])
          );

          return allRegistered && prefixConsistent;
        }),
      );
    });

    test('unregister operations are idempotent', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 10 }), (path) => {
          const registry = SlotRegistry.create();
          const element = document.createElement('div');

          registry.register({
            path: path as any,
            element,
            mode: 'partial' as const,
            mounted: true,
          });

          // First unregister should work
          registry.unregister(path as any);
          const firstResult = registry.has(path as any);

          // Second unregister should be safe (idempotent)
          registry.unregister(path as any);
          const secondResult = registry.has(path as any);

          return firstResult === false && secondResult === false;
        }),
      );
    });
  });
});

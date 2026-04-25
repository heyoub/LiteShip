import { expect, test } from '@playwright/test';

test.describe('Stream Runtime Stress Harness', () => {
  test('reconnects cleanly and preserves the swapped runtime target', async ({ page }) => {
    await page.goto('/stream-harness.html');

    const result = await page.evaluate(async () => {
      const runtimeWindow = window as Window & {
        __streamPromise: Promise<void>;
        __streamError: string | null;
        __streamResult: {
          morphCount: number;
          signalCount: number;
          reconnectCount: number;
          finalHtml: string;
        };
      };
      await runtimeWindow.__streamPromise;
      if (runtimeWindow.__streamError) {
        throw new Error(runtimeWindow.__streamError);
      }
      return runtimeWindow.__streamResult;
    });

    expect(result.morphCount).toBe(2);
    expect(result.signalCount).toBe(1);
    expect(result.reconnectCount).toBe(1);
    expect(result.finalHtml).toContain('second');
  });
});

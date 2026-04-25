import { Effect } from 'effect';
import { Millis, SSE_RECONNECT_INITIAL_MS, SSE_RECONNECT_MAX_MS } from '@czap/core';
import { Morph, Resumption, SSE, SlotAddressing, SlotRegistry, resolveHtmlString } from '@czap/web';
import type { ResumeResponse, SSEMessage } from '@czap/web';
import { bootstrapSlots, rescanSlots } from './slots.js';
import { readRuntimeHtmlPolicy, readRuntimeEndpointPolicy } from './policy.js';
import { createStreamScheduler } from './stream-session.js';
import { allowRuntimeEndpointUrl } from './url-policy.js';

type Locator =
  | { readonly type: 'slot'; readonly value: string }
  | { readonly type: 'id'; readonly value: string }
  | { readonly type: 'semantic-id'; readonly value: string };

function targetLocator(element: HTMLElement): Locator | null {
  const slot = element.getAttribute('data-czap-slot');
  if (slot) {
    return { type: 'slot', value: slot };
  }

  if (element.id) {
    return { type: 'id', value: element.id };
  }

  const semanticId = element.getAttribute('data-czap-id');
  if (semanticId) {
    return { type: 'semantic-id', value: semanticId };
  }

  return null;
}

function findTarget(locator: Locator | null): HTMLElement | null {
  if (!locator) {
    return null;
  }

  switch (locator.type) {
    case 'slot': {
      const el = SlotRegistry.findElement(SlotAddressing.brand(locator.value));
      /* v8 ignore next — slot elements are always HTML host elements (divs/sections/etc.);
         this narrows SlotRegistry.findElement's generic `Element | null` return so SVG-like
         non-HTML descendants are rejected if they ever leak into the slot registry. */
      return el instanceof HTMLElement ? el : null;
    }
    case 'id':
      return document.getElementById(locator.value);
    case 'semantic-id': {
      const root = document.documentElement;
      if (root.getAttribute('data-czap-id') === locator.value) {
        return root;
      }

      for (const candidate of Array.from(root.querySelectorAll('[data-czap-id]'))) {
        if (candidate.getAttribute('data-czap-id') === locator.value && candidate instanceof HTMLElement) {
          return candidate;
        }
      }

      return null;
    }
  }
}

function messageHtml(message: SSEMessage): string | null {
  if ((message.type === 'patch' || message.type === 'batch') && typeof message.data === 'string') {
    return message.data;
  }

  if (message.type === 'snapshot' && message.data !== null && typeof message.data === 'object') {
    if ('html' in message.data && typeof message.data.html === 'string') {
      return message.data.html;
    }
    return null;
  }

  return null;
}

function replayHtml(patch: unknown): string | null {
  if (typeof patch === 'string') {
    return patch;
  }

  if (patch !== null && typeof patch === 'object') {
    if ('html' in patch && typeof patch.html === 'string') {
      return patch.html;
    }
    if ('data' in patch && typeof patch.data === 'string') {
      return patch.data;
    }
  }

  return null;
}

function patchCouldInvalidateSlots(
  locator: Locator | null,
  morphStyle: 'innerHTML' | 'outerHTML',
  html: string,
): boolean {
  if (morphStyle === 'outerHTML') {
    return true;
  }

  if (locator?.type === 'slot') {
    return true;
  }

  return (
    html.includes('data-czap-slot') ||
    html.includes('data-czap-id') ||
    html.includes(' id=') ||
    html.includes(' id="') ||
    html.includes(" id='")
  );
}

function saveResumptionState(artifactId: string | undefined, lastEventId: string): void {
  if (!artifactId || !lastEventId) {
    return;
  }

  const parsed = Resumption.parseEventId(lastEventId);
  Effect.runSync(
    Resumption.saveState({
      artifactId,
      lastEventId,
      lastSequence: parsed.sequence,
      timestamp: Date.now(),
    }),
  );
}

function hasCustomEndpointPolicy(policy: ReturnType<typeof readRuntimeEndpointPolicy>): boolean {
  return (
    policy.mode !== 'same-origin' ||
    policy.allowOrigins.length > 0 ||
    Object.values(policy.byKind).some((allowlist) => allowlist.length > 0)
  );
}

/**
 * Entry point for the `client:stream` directive. Opens an SSE client
 * to the `data-czap-stream-url` endpoint, funnels incoming HTML
 * patches through a {@link createStreamScheduler}, and triggers slot
 * rescans when necessary. Honors `czap:reinit` / `czap:dispose` to
 * survive Astro view transitions.
 */
export function initStreamDirective(load: () => Promise<unknown>, element: HTMLElement): void {
  bootstrapSlots();
  const endpointPolicy = readRuntimeEndpointPolicy();
  const htmlPolicy = readRuntimeHtmlPolicy();
  const prepareHtml = (html: string): string =>
    resolveHtmlString(html, {
      policy: htmlPolicy.streamDefault,
      allowTrustedHtml: htmlPolicy.allowTrustedHtml,
    });

  let target = element;
  let reinitTarget: HTMLElement | null = null;
  const streamUrl = allowRuntimeEndpointUrl(
    target.getAttribute('data-czap-stream-url'),
    'stream',
    'czap/astro.stream',
    {
      crossOriginRejected: 'stream-cross-origin-url-rejected',
      malformedUrl: 'stream-malformed-url-rejected',
      originNotAllowed: 'stream-origin-not-allowed',
      endpointKindNotPermitted: 'stream-endpoint-kind-not-permitted',
    },
    endpointPolicy,
  );
  if (!streamUrl) {
    return;
  }

  const artifactId = target.getAttribute('data-czap-stream-artifact') ?? undefined;
  const morphStyle = (target.getAttribute('data-czap-stream-morph') ?? 'innerHTML') as 'innerHTML' | 'outerHTML';
  const snapshotUrl =
    allowRuntimeEndpointUrl(
      target.getAttribute('data-czap-snapshot-url'),
      'snapshot',
      'czap/astro.stream',
      {
        crossOriginRejected: 'snapshot-cross-origin-url-rejected',
        malformedUrl: 'snapshot-malformed-url-rejected',
        originNotAllowed: 'snapshot-origin-not-allowed',
        endpointKindNotPermitted: 'snapshot-endpoint-kind-not-permitted',
      },
      endpointPolicy,
    ) ?? undefined;
  const replayUrl =
    allowRuntimeEndpointUrl(
      target.getAttribute('data-czap-replay-url'),
      'replay',
      'czap/astro.stream',
      {
        crossOriginRejected: 'replay-cross-origin-url-rejected',
        malformedUrl: 'replay-malformed-url-rejected',
        originNotAllowed: 'replay-origin-not-allowed',
        endpointKindNotPermitted: 'replay-endpoint-kind-not-permitted',
      },
      endpointPolicy,
    ) ?? undefined;

  let source: EventSource | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastEventId: string | null = null;
  let recoveryPending = false;
  let pendingLocator: Locator | null = null;

  const reconnectConfig = {
    maxAttempts: 10,
    initialDelay: Millis(SSE_RECONNECT_INITIAL_MS),
    maxDelay: Millis(SSE_RECONNECT_MAX_MS),
    factor: 2,
  } as const;

  const bindReinit = (nextTarget: HTMLElement): void => {
    if (reinitTarget === nextTarget) {
      return;
    }

    reinitTarget?.removeEventListener('czap:reinit', handleReinit);
    reinitTarget = nextTarget;
    reinitTarget.addEventListener('czap:reinit', handleReinit);
  };

  const patchScheduler = createStreamScheduler({
    applyHtml: (html) => {
      const locator = targetLocator(target);
      pendingLocator = locator;
      Effect.runSync(
        Morph.morphWithState(target, html, {
          morphStyle,
          preserveFocus: true,
          preserveScroll: true,
          preserveSelection: true,
        }),
      );

      if (locator && locator.type !== 'slot') {
        target = findTarget(locator) ?? target;
      }
    },
    onFlush: ({ patchCount, requiresRescan }) => {
      if (requiresRescan) {
        rescanSlots(document.documentElement);
      }

      target = findTarget(pendingLocator) ?? target;
      bindReinit(target);
      for (let index = 0; index < patchCount; index++) {
        target.dispatchEvent(
          new CustomEvent('czap:stream-morph', {
            bubbles: true,
          }),
        );
      }
      pendingLocator = null;
    },
  });

  const enqueueHtml = (html: string): Promise<void> => {
    const normalizedHtml = prepareHtml(html);
    return patchScheduler.enqueue({
      html: normalizedHtml,
      requiresRescan: patchCouldInvalidateSlots(targetLocator(target), morphStyle, normalizedHtml),
    });
  };

  const applyResumeResponse = async (response: ResumeResponse): Promise<void> => {
    if (response.type === 'snapshot') {
      await enqueueHtml(response.html);
      return;
    }

    const patches = response.patches
      .map((patch) => replayHtml(patch))
      .filter((html): html is string => html !== null)
      .map((html) => ({
        html,
        requiresRescan: patchCouldInvalidateSlots(targetLocator(target), morphStyle, html),
      }));

    await patchScheduler.enqueueBatch(patches);
  };

  const reconcileResumption = async (currentEventId: string): Promise<void> => {
    const resolvedArtifactId = artifactId!;
    try {
      const response = await Effect.runPromise(
        Resumption.resume(resolvedArtifactId, currentEventId, {
          ...(snapshotUrl ? { snapshotUrl } : {}),
          ...(replayUrl ? { replayUrl } : {}),
          ...(hasCustomEndpointPolicy(endpointPolicy) ? { endpointPolicy } : {}),
        }),
      );
      await applyResumeResponse(response);
    } catch (error) {
      target.dispatchEvent(
        new CustomEvent('czap:stream-error', {
          detail: {
            reason: 'resume-failed',
            message: error instanceof Error ? error.message : String(error),
          },
          bubbles: true,
        }),
      );
    }
  };

  const buildUrl = (): string => SSE.buildUrl(streamUrl, artifactId, lastEventId ?? undefined);

  const connect = (): void => {
    source = new EventSource(buildUrl());

    source.onopen = () => {
      reconnectAttempt = 0;
      patchScheduler.activate();
      target.dispatchEvent(new CustomEvent('czap:stream-connected', { bubbles: true }));
    };

    source.onmessage = (event: MessageEvent) => {
      if (event.lastEventId) {
        lastEventId = event.lastEventId;
        saveResumptionState(artifactId, event.lastEventId);
      }

      if (recoveryPending && artifactId && event.lastEventId) {
        recoveryPending = false;
        void reconcileResumption(event.lastEventId);
      }

      const message = SSE.parseMessage(event);
      if (!message) {
        return;
      }

      if (message.type === 'signal') {
        target.dispatchEvent(
          new CustomEvent('czap:signal', {
            detail: message.data,
            bubbles: true,
          }),
        );
        return;
      }

      if (message.type === 'heartbeat' || message.type === 'receipt') {
        return;
      }

      const html = messageHtml(message);
      if (html) {
        void enqueueHtml(html);
      }
    };

    source.onerror = () => {
      source?.close();
      source = null;
      recoveryPending = artifactId !== undefined && lastEventId !== null;
      patchScheduler.beginReconnect();

      target.dispatchEvent(new CustomEvent('czap:stream-disconnected', { bubbles: true }));

      if (reconnectAttempt < reconnectConfig.maxAttempts) {
        const delay = SSE.calculateDelay(reconnectAttempt, reconnectConfig);
        reconnectAttempt += 1;
        reconnectTimer = patchScheduler.setReconnectTimer(connect, delay);
        return;
      }

      target.dispatchEvent(
        new CustomEvent('czap:stream-error', {
          detail: { reason: 'max-reconnect-attempts' },
          bubbles: true,
        }),
      );
    };
  };

  const cleanup = (): void => {
    reconnectTimer = patchScheduler.clearReconnectTimer(reconnectTimer);

    source?.close();
    source = null;
  };

  const handleReinit = (): void => {
    cleanup();
    reconnectAttempt = 0;
    recoveryPending = false;
    connect();
  };

  bindReinit(target);
  connect();
  element.addEventListener('czap:dispose', () => {
    cleanup();
    patchScheduler.dispose();
  });
  load();
}

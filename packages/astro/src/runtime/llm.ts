import { Diagnostics } from '@czap/core';
import type { Receipt } from '@czap/core';
import type { LLMChunk } from '@czap/web';
import { createLLMSession } from './llm-session.js';
import { readRuntimeHtmlPolicy, readRuntimeEndpointPolicy } from './policy.js';
import { allowRuntimeEndpointUrl } from './url-policy.js';

const SAFE_LLM_TARGET_SELECTOR = /^(?:#[A-Za-z][\w-]*|\.[A-Za-z_][\w-]*|\[data-czap-target="[-:A-Za-z0-9_]+"\])$/;

const parseJSONUnknown = (text: string): unknown => JSON.parse(text);

function normalizeToolDeltaContent(content: unknown, toolArgs: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }

  if (typeof toolArgs === 'string') {
    return toolArgs;
  }

  if (toolArgs && typeof toolArgs === 'object') {
    return JSON.stringify(toolArgs);
  }

  return undefined;
}

function firstMeaningfulCharCode(raw: string): number {
  for (let index = 0; index < raw.length; index++) {
    const code = raw.charCodeAt(index);
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
      return code;
    }
  }

  return -1;
}

function toStructuredChunk(
  type: LLMChunk['type'],
  partial: unknown,
  content: unknown,
  toolName: unknown,
  toolArgs: unknown,
): LLMChunk {
  const normalizedToolName = typeof toolName === 'string' ? toolName : undefined;
  const normalizedContent =
    type === 'tool-call-delta'
      ? normalizeToolDeltaContent(content, toolArgs)
      : typeof content === 'string'
        ? content
        : undefined;

  return {
    type,
    partial: partial === true,
    content: normalizedContent,
    toolName: normalizedToolName,
    toolArgs,
  };
}

/**
 * Parse a raw `MessageEvent` payload into an {@link LLMChunk}. Returns
 * `null` when the payload is unrecognised so callers can drop
 * non-chunk events (metrics, heartbeats, ...) silently.
 */
export function parseLLMChunk(event: Pick<MessageEvent, 'data'>): LLMChunk | null {
  const decoded = decodeLLMEventData(event.data);
  return decoded.type === 'chunk' ? decoded.chunk : null;
}

function mapDeviceTier(): 'none' | 'transitions' | 'animations' | 'physics' | 'compute' {
  switch (document.documentElement.getAttribute('data-czap-tier')) {
    case 'static':
      return 'none';
    case 'styled':
      return 'transitions';
    case 'gpu':
      return 'compute';
    case 'animated':
      return 'physics';
    default:
      return 'animations';
  }
}

function parseLLMError(error: { content?: unknown; message?: unknown }): string {
  if (typeof error.content === 'string') {
    return error.content;
  }
  if (typeof error.message === 'string') {
    return error.message;
  }

  return 'unknown error';
}

type ParsedEventData =
  | { readonly type: 'receipt'; readonly envelope: Receipt.Envelope }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'chunk'; readonly chunk: LLMChunk }
  | { readonly type: 'ignored' };

interface StructuredLLMEvent {
  readonly type?: unknown;
  readonly data?: unknown;
  readonly content?: unknown;
  readonly message?: unknown;
  readonly partial?: unknown;
  readonly toolName?: unknown;
  readonly toolArgs?: unknown;
}

function isStructuredLLMEvent(value: unknown): value is StructuredLLMEvent {
  return typeof value === 'object' && value !== null;
}

function decodeStructuredLLMEventData(data: unknown): ParsedEventData {
  if (!isStructuredLLMEvent(data)) {
    return { type: 'ignored' };
  }

  switch (data.type) {
    case 'receipt':
      return isReceiptEnvelope(data.data) ? { type: 'receipt', envelope: data.data } : { type: 'ignored' };
    case 'error': {
      return { type: 'error', message: parseLLMError(data) };
    }
    case 'text':
    case 'tool-call-start':
    case 'tool-call-delta':
    case 'tool-call-end':
    case 'done':
      return {
        type: 'chunk',
        chunk: toStructuredChunk(data.type, data.partial, data.content, data.toolName, data.toolArgs),
      };
    default:
      return { type: 'ignored' };
  }
}

function decodeLLMEventData(data: unknown): ParsedEventData {
  if (typeof data === 'string') {
    const firstChar = firstMeaningfulCharCode(data);
    if (firstChar === -1) {
      return { type: 'ignored' };
    }

    if (firstChar !== 123 && firstChar !== 91) {
      return {
        type: 'chunk',
        chunk: {
          type: 'text',
          partial: false,
          content: data,
          toolName: undefined,
          toolArgs: undefined,
        },
      };
    }

    let parsed: unknown;
    let syntaxError = false;

    try {
      parsed = parseJSONUnknown(data);
    } catch (error) {
      if (error instanceof SyntaxError) {
        syntaxError = true;
      } else {
        throw error;
      }
    }

    if (syntaxError) {
      return { type: 'ignored' };
    }

    return decodeStructuredLLMEventData(parsed);
  }

  return decodeStructuredLLMEventData(data);
}

function isReceiptEnvelope(value: unknown): value is Receipt.Envelope {
  if (typeof value !== 'object' || value === null) return false;
  if (!('hash' in value) || !('previous' in value)) return false;
  return typeof value.hash === 'string';
}

function resolveLLMTarget(element: HTMLElement, selector: string | null): HTMLElement {
  if (!selector || !SAFE_LLM_TARGET_SELECTOR.test(selector)) {
    return element;
  }

  try {
    const found = element.querySelector(selector);
    return found instanceof HTMLElement ? found : element;
  } catch {
    return element;
  }
}

/**
 * Entry point used by the `client:llm` directive to start a streaming
 * LLM session on `element`. Reads `data-czap-llm-url` (plus optional
 * target / mode attributes), validates it against the runtime
 * endpoint policy, opens an SSE stream, and drives an
 * {@link LLMSessionShape} to completion.
 */
export function initLLMDirective(load: () => Promise<unknown>, element: HTMLElement): void {
  const endpointPolicy = readRuntimeEndpointPolicy();
  const htmlPolicy = readRuntimeHtmlPolicy();
  const llmUrl = allowRuntimeEndpointUrl(
    element.getAttribute('data-czap-llm-url'),
    'llm',
    'czap/astro.llm',
    {
      crossOriginRejected: 'llm-cross-origin-url-rejected',
      malformedUrl: 'llm-malformed-url-rejected',
      originNotAllowed: 'llm-origin-not-allowed',
      endpointKindNotPermitted: 'llm-endpoint-kind-not-permitted',
    },
    endpointPolicy,
  );
  if (!llmUrl) {
    return;
  }

  const mode = element.getAttribute('data-czap-llm-mode') ?? 'append';
  const targetSelector = element.getAttribute('data-czap-llm-target');
  const resolveTarget = (): HTMLElement => resolveLLMTarget(element, targetSelector);
  const resetTarget = (target: HTMLElement): void => {
    target.replaceChildren();
  };

  let source: EventSource | null = null;
  const session = createLLMSession({
    element,
    target: resolveTarget(),
    mode,
    getDeviceTier: mapDeviceTier,
    htmlPolicy: htmlPolicy.llmDefault,
    allowTrustedHtml: htmlPolicy.allowTrustedHtml,
  });

  const cleanupSource = (): void => {
    if (source) {
      source.onopen = null;
      source.onmessage = null;
      source.onerror = null;
    }
    source?.close();
    source = null;
  };

  const cleanup = (): void => {
    cleanupSource();
    session.dispose();
  };

  const handleDisconnect = (): void => {
    cleanupSource();
    session.beginReconnect();

    const strategy = session.replayGap();
    if (strategy.type === 'replay') {
      return;
    }

    element.dispatchEvent(
      new CustomEvent('czap:llm-error', {
        detail: { reason: 'connection-error', strategy: strategy.type },
        bubbles: true,
      }),
    );
  };

  const connect = (): void => {
    cleanupSource();
    const target = resolveTarget();
    resetTarget(target);
    session.reset(target);
    source = new EventSource(llmUrl);

    source.onopen = () => {
      session.activate();
      element.dispatchEvent(new CustomEvent('czap:llm-start', { bubbles: true }));
    };

    source.onmessage = (event: MessageEvent) => {
      const decoded = decodeLLMEventData(event.data);
      switch (decoded.type) {
        case 'receipt':
          session.rememberEnvelope(decoded.envelope);
          return;
        case 'error':
          element.dispatchEvent(
            new CustomEvent('czap:llm-error', {
              detail: { message: decoded.message },
              bubbles: true,
            }),
          );
          cleanupSource();
          return;
        case 'ignored':
          return;
        case 'chunk':
          if (session.ingest(decoded.chunk) === 'done') {
            cleanupSource();
          }
          return;
      }
    };

    source.onerror = () => {
      handleDisconnect();
    };
  };

  try {
    connect();
  } catch (error) {
    Diagnostics.error({
      source: 'czap/astro.llm',
      code: 'llm-runtime-init-failed',
      message: 'The shared LLM runtime could not initialize.',
      detail: error instanceof Error ? error.message : String(error),
    });
    cleanup();
  }

  element.addEventListener('czap:reinit', () => {
    connect();
  });

  element.addEventListener('czap:dispose', () => {
    cleanup();
  });

  load();
}

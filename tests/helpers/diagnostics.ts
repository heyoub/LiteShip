import { Diagnostics } from '@czap/core';

export interface CapturedDiagnostics {
  readonly events: Diagnostics.Event[];
}

function parseConsoleDiagnostic(
  level: Diagnostics.Level,
  args: readonly unknown[],
): Diagnostics.Event | null {
  const [headline, detail, cause] = args;
  if (typeof headline !== 'string') {
    return null;
  }

  const match = /^\[(?<source>[^\]]+)\]\s+(?<code>[^:]+):\s+(?<message>.*)$/.exec(headline);
  if (!match?.groups) {
    return null;
  }

  return {
    level,
    timestamp: Date.now(),
    source: match.groups.source,
    code: match.groups.code,
    message: match.groups.message,
    detail,
    cause,
  };
}

function createCapturedDiagnostics(): {
  readonly events: Diagnostics.Event[];
  readonly restore: () => void;
} {
  const events: Diagnostics.Event[] = [];
  const sink: Diagnostics.Sink = {
    emit(event) {
      events.push(event);
    },
  };

  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: readonly unknown[]) => {
    const event = parseConsoleDiagnostic('warn', args);
    if (event) {
      events.push(event);
    }
  };

  console.error = (...args: readonly unknown[]) => {
    const event = parseConsoleDiagnostic('error', args);
    if (event) {
      events.push(event);
    }
  };

  Diagnostics.reset();
  Diagnostics.setSink(sink);

  return {
    events,
    restore: () => {
      console.warn = originalWarn;
      console.error = originalError;
      Diagnostics.reset();
    },
  };
}

export function withCapturedDiagnostics<T>(run: (captured: CapturedDiagnostics) => T): T {
  const captured = createCapturedDiagnostics();

  try {
    return run({ events: captured.events });
  } finally {
    captured.restore();
  }
}

export async function withCapturedDiagnosticsAsync<T>(
  run: (captured: CapturedDiagnostics) => Promise<T>,
): Promise<T> {
  const captured = createCapturedDiagnostics();

  try {
    return await run({ events: captured.events });
  } finally {
    captured.restore();
  }
}

export function captureDiagnostics<T>(run: (captured: CapturedDiagnostics) => T): T {
  return withCapturedDiagnostics(run);
}

export async function captureDiagnosticsAsync<T>(
  run: (captured: CapturedDiagnostics) => Promise<T>,
): Promise<T> {
  return withCapturedDiagnosticsAsync(run);
}

export function captureDiagnosticEvents<T>(run: () => T): ReturnType<typeof Diagnostics.createBufferSink>['events'] {
  return withCapturedDiagnostics(({ events }) => {
    run();
    return [...events];
  });
}

export async function captureDiagnosticEventsAsync<T>(
  run: () => Promise<T>,
): Promise<ReturnType<typeof Diagnostics.createBufferSink>['events']> {
  return withCapturedDiagnosticsAsync(async ({ events }) => {
    await run();
    return [...events];
  });
}

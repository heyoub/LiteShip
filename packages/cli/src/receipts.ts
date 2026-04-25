/**
 * Shared receipt shapes + emit helpers for CLI commands. Every command
 * emits one of these to stdout as a single JSON line. Errors go to
 * stderr as structured JSON events.
 *
 * @module
 */

/** Base shape carried by every CLI command receipt. */
export interface BaseReceipt {
  readonly status: 'ok' | 'failed';
  readonly command: string;
  readonly timestamp: string;
}

/** Receipt emitted by `scene compile`. */
export interface SceneCompileReceipt extends BaseReceipt {
  readonly command: 'scene.compile';
  readonly sceneId: string;
  readonly trackCount: number;
  readonly durationMs: number;
}

/** Receipt emitted by `scene render`. */
export interface SceneRenderReceipt extends BaseReceipt {
  readonly command: 'scene.render';
  readonly sceneId: string;
  readonly output: string;
  readonly frameCount: number;
  readonly elapsedMs: number;
}

/** Receipt emitted by `asset analyze`. */
export interface AssetAnalyzeReceipt extends BaseReceipt {
  readonly command: 'asset.analyze';
  readonly assetId: string;
  readonly projection: 'beat' | 'onset' | 'waveform';
  readonly markerCount: number;
}

/** Emit a receipt to stdout as a single JSON line. */
export function emit(receipt: unknown): void {
  process.stdout.write(JSON.stringify(receipt) + '\n');
}

/** Emit a structured error event to stderr as a single JSON line. */
export function emitError(command: string, message: string): void {
  process.stderr.write(
    JSON.stringify({
      status: 'failed',
      command,
      error: message,
      timestamp: new Date().toISOString(),
    }) + '\n',
  );
}

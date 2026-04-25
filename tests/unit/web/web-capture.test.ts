import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mediabunnyState = vi.hoisted(() => ({
  codecNames: [] as string[],
  packets: [] as Array<{ packet: unknown; metadata?: unknown }>,
  tracks: [] as Array<{ source: unknown; options: Record<string, unknown> }>,
  formatOptions: [] as Record<string, unknown>[],
  packetInputs: [] as unknown[],
  startCalls: 0,
  finalizeCalls: 0,
  buffer: new Uint8Array([1, 2, 3, 4]) as Uint8Array | null,
}));

vi.mock('../../../packages/web/src/capture/mediabunny.js', () => {
  class BufferTarget {
    get buffer(): Uint8Array | null {
      return mediabunnyState.buffer;
    }
  }

  class EncodedVideoPacketSource {
    constructor(codec: string) {
      mediabunnyState.codecNames.push(codec);
    }

    async add(packet: unknown, metadata?: unknown): Promise<void> {
      mediabunnyState.packets.push({ packet, metadata });
    }
  }

  class Output {
    constructor(_config: Record<string, unknown>) {}

    addVideoTrack(source: unknown, options: Record<string, unknown>): void {
      mediabunnyState.tracks.push({ source, options });
    }

    async start(): Promise<void> {
      mediabunnyState.startCalls++;
    }

    async finalize(): Promise<void> {
      mediabunnyState.finalizeCalls++;
    }
  }

  class Mp4OutputFormat {
    constructor(options: Record<string, unknown>) {
      mediabunnyState.formatOptions.push(options);
    }
  }

  const EncodedPacket = {
    fromEncodedChunk(chunk: unknown) {
      mediabunnyState.packetInputs.push(chunk);
      return { chunk };
    },
  };

  return {
    BufferTarget,
    EncodedPacket,
    EncodedVideoPacketSource,
    Mp4OutputFormat,
    Output,
  };
});

import { renderToCanvas } from '../../../packages/web/src/capture/render.js';
import * as MediabunnyBridge from '../../../packages/web/src/capture/mediabunny.js';
import { WebCodecsCapture } from '../../../packages/web/src/capture/webcodecs.js';

type VideoEncoderInit = {
  output: (chunk: unknown, metadata?: unknown) => void;
  error: (error: DOMException) => void;
};

class EncodedVideoChunkMock {
  readonly byteLength: number;

  constructor(
    readonly init: {
      data: Uint8Array;
      type: 'key' | 'delta';
      timestamp: number;
      duration?: number;
    },
  ) {
    this.byteLength = init.data.byteLength;
  }

  get type(): 'key' | 'delta' {
    return this.init.type;
  }

  get timestamp(): number {
    return this.init.timestamp;
  }

  get duration(): number | undefined {
    return this.init.duration;
  }

  copyTo(target: Uint8Array): void {
    target.set(this.init.data);
  }
}

class EncodedAudioChunkMock {}

const encoderState = {
  instances: [] as VideoEncoderMock[],
  frames: [] as Array<{ bitmap: unknown; init: { timestamp: number; duration: number } }>,
  supportResult: true,
  supportError: null as Error | null,
  emitChunks: true,
  chunkMetadataMode: 'first-only' as 'first-only' | 'never',
  pendingError: null as DOMException | null,
};

class VideoEncoderMock {
  static readonly isConfigSupported = vi.fn(async (config: Record<string, unknown>) => {
    if (encoderState.supportError) {
      throw encoderState.supportError;
    }

    return {
      supported: encoderState.supportResult,
      config,
    };
  });

  readonly configure = vi.fn((config: Record<string, unknown>) => {
    this.config = config;
  });
  readonly flush = vi.fn(async () => {});
  readonly close = vi.fn(() => {});
  readonly encode = vi.fn((_frame: unknown, options?: Record<string, unknown>) => {
    if (encoderState.pendingError) {
      this.init.error(encoderState.pendingError);
      return;
    }

    if (!encoderState.emitChunks) {
      return;
    }

    const latestFrame = encoderState.frames.at(-1);
    this.init.output(
      new EncodedVideoChunkMock({
        data: new Uint8Array([1, 2, 3, 4]),
        type: options?.keyFrame ? 'key' : 'delta',
        timestamp: latestFrame?.init.timestamp ?? 0,
        duration: latestFrame?.init.duration,
      }),
      encoderState.chunkMetadataMode === 'first-only' && this.encode.mock.calls.length === 1
        ? {
            decoderConfig: {
              codec: 'vp09.00.10.08',
              codedWidth: 640,
              codedHeight: 480,
              description: new Uint8Array([1, 2, 3]),
            },
          }
        : undefined,
    );
  });

  config: Record<string, unknown> | null = null;

  constructor(private readonly init: VideoEncoderInit) {
    encoderState.instances.push(this);
  }
}

class VideoFrameMock {
  readonly close = vi.fn(() => {});

  constructor(bitmap: unknown, init: { timestamp: number; duration: number }) {
    encoderState.frames.push({ bitmap, init });
  }
}

describe('web capture runtime', () => {
  beforeEach(() => {
    mediabunnyState.codecNames.length = 0;
    mediabunnyState.packets.length = 0;
    mediabunnyState.tracks.length = 0;
    mediabunnyState.formatOptions.length = 0;
    mediabunnyState.packetInputs.length = 0;
    mediabunnyState.startCalls = 0;
    mediabunnyState.finalizeCalls = 0;
    mediabunnyState.buffer = new Uint8Array([1, 2, 3, 4]);

    encoderState.instances.length = 0;
    encoderState.frames.length = 0;
    encoderState.supportResult = true;
    encoderState.supportError = null;
    encoderState.emitChunks = true;
    encoderState.chunkMetadataMode = 'first-only';
    encoderState.pendingError = null;

    VideoEncoderMock.isConfigSupported.mockClear();
    vi.stubGlobal('VideoEncoder', VideoEncoderMock as never);
    vi.stubGlobal('VideoFrame', VideoFrameMock as never);
    vi.stubGlobal('EncodedVideoChunk', EncodedVideoChunkMock as never);
    vi.stubGlobal('EncodedAudioChunk', EncodedAudioChunkMock as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('renders default CSS-derived fills on OffscreenCanvas and HTMLCanvasElement targets', () => {
    const ctx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    const offscreenCanvas = {
      width: 32,
      height: 18,
      getContext: vi.fn(() => ctx),
    };
    const htmlCanvas = {
      width: 24,
      height: 12,
      getContext: vi.fn(() => ctx),
    };

    renderToCanvas(
      {
        discrete: {},
        blend: {},
        outputs: {
          css: {
            '--czap-background': 'black',
            '--czap-foreground': 'white',
          },
          glsl: {},
          aria: {},
        },
      } as never,
      offscreenCanvas as never,
    );
    renderToCanvas(
      {
        discrete: {},
        blend: {},
        outputs: {
          css: {
            '--czap-bg': 'navy',
            '--czap-color': 'gold',
          },
          glsl: {},
          aria: {},
        },
      } as never,
      htmlCanvas as never,
    );

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 32, 18);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 32, 18);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 24, 12);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 24, 12);
    expect(ctx.fillStyle).toBe('gold');

    expect(() =>
      renderToCanvas(
        {
          discrete: {},
          blend: {},
          outputs: { css: {}, glsl: {}, aria: {} },
        } as never,
        {
          width: 1,
          height: 1,
          getContext: () => null,
        } as never,
      ),
    ).toThrow('Failed to get 2D context from OffscreenCanvas');
  });

  test('exports the mediabunny bridge from the shared capture seam', () => {
    expect(typeof MediabunnyBridge.BufferTarget).toBe('function');
    expect(typeof MediabunnyBridge.EncodedVideoPacketSource).toBe('function');
    expect(typeof MediabunnyBridge.Output).toBe('function');
  });

  test('covers support probing, timestamp normalization, packet draining, and codec mapping', async () => {
    const avcCapture = WebCodecsCapture.make();
    await expect(
      avcCapture.init({
        width: 641,
        height: 480,
        fps: 30,
      } as never),
    ).rejects.toThrow('requires even dimensions');

    const capture = WebCodecsCapture.make({
      codec: 'vp09.00.10.08',
      bitrate: 2_000_000,
      keyframeInterval: 2,
    });

    await capture.init({
      width: 641,
      height: 481,
      fps: 30,
    } as never);

    await capture.capture({
      frame: 0,
      timestamp: 10,
      bitmap: { frame: 'first' } as never,
    });
    await capture.capture({
      frame: 1,
      timestamp: 9,
      bitmap: { frame: 'second' } as never,
    });

    const result = await capture.finalize();
    const encoder = encoderState.instances[0];

    expect(VideoEncoderMock.isConfigSupported).toHaveBeenCalledWith({
      codec: 'vp09.00.10.08',
      width: 641,
      height: 481,
      bitrate: 2_000_000,
      framerate: 30,
    });
    expect(encoder).toBeDefined();
    expect(encoder?.configure).toHaveBeenCalledWith({
      codec: 'vp09.00.10.08',
      width: 641,
      height: 481,
      bitrate: 2_000_000,
      framerate: 30,
    });
    expect(encoder?.encode.mock.calls[0]?.[1]).toEqual({ keyFrame: true });
    expect(encoder?.encode.mock.calls[1]?.[1]).toEqual({ keyFrame: false });
    expect(encoder?.flush).toHaveBeenCalledOnce();
    expect(encoder?.close).toHaveBeenCalledOnce();

    expect(encoderState.frames[0]?.init).toEqual({
      timestamp: 10_000,
      duration: 1_000_000 / 30,
    });
    expect(encoderState.frames[1]?.init.timestamp).toBe(10_001);

    expect(mediabunnyState.codecNames).toEqual(['vp9']);
    expect(mediabunnyState.tracks[0]?.options).toEqual({ frameRate: 30 });
    expect(mediabunnyState.packets).toHaveLength(2);
    expect(mediabunnyState.packets[0]?.metadata).toBeDefined();
    expect(mediabunnyState.packets[1]?.metadata).toBeUndefined();

    expect(result.codec).toBe('vp09.00.10.08');
    expect(result.frames).toBe(2);
    expect(Number(result.durationMs)).toBeCloseTo(66.66, 1);
    expect(result.blob.type).toBe('video/mp4');
    expect(result.blob.size).toBeGreaterThan(0);

    await expect(capture.finalize()).rejects.toThrow('FrameCapture not initialized');
  });

  test('rejects unsupported codec mappings and support probe failures', async () => {
    const unsupportedCapture = WebCodecsCapture.make({
      codec: 'weird-codec',
    });
    await expect(
      unsupportedCapture.init({
        width: 640,
        height: 480,
        fps: 30,
      } as never),
    ).rejects.toThrow('Unsupported WebCodecs codec');

    encoderState.supportResult = false;
    const unsupportedConfigCapture = WebCodecsCapture.make();
    await expect(
      unsupportedConfigCapture.init({
        width: 640,
        height: 480,
        fps: 30,
      } as never),
    ).rejects.toThrow('VideoEncoder does not support codec');

    encoderState.supportResult = true;
    encoderState.supportError = new Error('probe boom');
    const probeErrorCapture = WebCodecsCapture.make();
    await expect(
      probeErrorCapture.init({
        width: 640,
        height: 480,
        fps: 30,
      } as never),
    ).rejects.toThrow('VideoEncoder support probe failed: probe boom');
  });

  test('maps HEVC and AV1 codec aliases and stringifies non-Error support probe failures', async () => {
    encoderState.supportError = 'probe string boom' as never;
    const stringProbeCapture = WebCodecsCapture.make({
      codec: 'hev1.1.6.L93.B0',
    });
    await expect(
      stringProbeCapture.init({
        width: 640,
        height: 480,
        fps: 30,
      } as never),
    ).rejects.toThrow('VideoEncoder support probe failed: probe string boom');

    encoderState.supportError = null;

    const hevcCapture = WebCodecsCapture.make({
      codec: 'hvc1.1.6.L93.B0',
    });
    await hevcCapture.init({
      width: 640,
      height: 480,
      fps: 30,
    } as never);
    await hevcCapture.capture({ bitmap: { close() {} }, timestamp: 0 } as never);
    await hevcCapture.finalize();

    const av1Capture = WebCodecsCapture.make({
      codec: 'av1',
    });
    await av1Capture.init({
      width: 641,
      height: 481,
      fps: 30,
    } as never);
    await av1Capture.capture({ bitmap: { close() {} }, timestamp: 0 } as never);
    await av1Capture.finalize();

    expect(mediabunnyState.codecNames).toEqual(expect.arrayContaining(['hevc', 'av1']));
  });

  test('rejects unavailable encoders and skips support probing when the runtime does not expose it', async () => {
    const originalVideoEncoder = VideoEncoderMock as unknown as typeof VideoEncoder;
    vi.stubGlobal('VideoEncoder', undefined);

    const unavailableCapture = WebCodecsCapture.make();
    await expect(
      unavailableCapture.init({
        width: 640,
        height: 480,
        fps: 30,
      } as never),
    ).rejects.toThrow('WebCodecs VideoEncoder is unavailable in this environment');

    vi.stubGlobal('VideoEncoder', originalVideoEncoder as never);
    vi.stubGlobal('VideoFrame', VideoFrameMock as never);
    const supportProbe = VideoEncoderMock.isConfigSupported;
    try {
      Object.defineProperty(VideoEncoderMock, 'isConfigSupported', {
        configurable: true,
        value: undefined,
      });

      const capture = WebCodecsCapture.make({
        codec: 'vp09.00.10.08',
      });
      await capture.init({
        width: 641,
        height: 481,
        fps: 30,
      } as never);
      expect(VideoEncoderMock.isConfigSupported).toBeUndefined();
      await capture.capture({
        frame: 0,
        timestamp: Number.NaN,
        bitmap: {} as never,
      });
      const result = await capture.finalize();
      expect(result.frames).toBe(1);
      expect(encoderState.frames[0]?.init.timestamp).toBe(Math.max(0, Math.round(1_000_000 / 30) - 1));
    } finally {
      Object.defineProperty(VideoEncoderMock, 'isConfigSupported', {
        configurable: true,
        value: supportProbe,
      });
    }
  });

  test('surfaces encoder errors, missing packets, and empty muxer output deterministically', async () => {
    const errorCapture = WebCodecsCapture.make();
    await errorCapture.init({
      width: 640,
      height: 480,
      fps: 30,
    } as never);
    encoderState.pendingError = new DOMException('encode boom');
    await expect(
      errorCapture.capture({
        frame: 0,
        timestamp: 0,
        bitmap: {} as never,
      }),
    ).rejects.toThrow('VideoEncoder error: encode boom');

    encoderState.pendingError = null;
    encoderState.emitChunks = false;
    const noPacketsCapture = WebCodecsCapture.make();
    await noPacketsCapture.init({
      width: 640,
      height: 480,
      fps: 30,
    } as never);
    await noPacketsCapture.capture({
      frame: 0,
      timestamp: 0,
      bitmap: {} as never,
    });
    await expect(noPacketsCapture.finalize()).rejects.toThrow('VideoEncoder produced no packets');

    encoderState.emitChunks = true;
    mediabunnyState.buffer = null;
    const noOutputCapture = WebCodecsCapture.make();
    await noOutputCapture.init({
      width: 640,
      height: 480,
      fps: 30,
    } as never);
    await noOutputCapture.capture({
      frame: 0,
      timestamp: 0,
      bitmap: {} as never,
    });
    await expect(noOutputCapture.finalize()).rejects.toThrow('MP4 muxer produced no output');
  });

  test('rejects capture and finalize before initialization and rejects empty finalize runs', async () => {
    const capture = WebCodecsCapture.make({
      codec: 'vp09.00.10.08',
    });

    await expect(
      capture.capture({
        frame: 0,
        timestamp: 0,
        bitmap: {} as never,
      }),
    ).rejects.toThrow('FrameCapture not initialized');
    await expect(capture.finalize()).rejects.toThrow('FrameCapture not initialized');

    await capture.init({
      width: 640,
      height: 480,
      fps: 30,
    } as never);
    await expect(capture.finalize()).rejects.toThrow('FrameCapture has no frames to finalize');
  });
});

// ---------------------------------------------------------------------------
// captureVideo pipeline
// ---------------------------------------------------------------------------

describe('captureVideo pipeline', () => {
  test('orchestrates renderer -> capture -> result', async () => {
    const { captureVideo } = await import('../../../packages/web/src/capture/pipeline.js');

    const frames = [
      { frame: 0, timestamp: 0, state: { outputs: { css: {} } } },
      { frame: 1, timestamp: 33, state: { outputs: { css: {} } } },
    ];

    const renderer = {
      config: { width: 320, height: 240, fps: 30 },
      async *frames() {
        for (const f of frames) yield f;
      },
    };

    const initSpy = vi.fn();
    const captureSpy = vi.fn();
    const finalizeSpy = vi.fn().mockResolvedValue({
      codec: 'mock',
      frames: 2,
      durationMs: 66,
      blob: new Blob(),
    });

    const mockCapture = {
      init: initSpy,
      capture: captureSpy,
      finalize: finalizeSpy,
    };

    // Mock OffscreenCanvas globally for this test
    const mockCtx = { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
    const OrigOffscreenCanvas = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = class {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return mockCtx;
      }
    } as never;

    try {
      const result = await captureVideo(renderer as never, mockCapture as never);

      expect(initSpy).toHaveBeenCalledWith({ width: 320, height: 240, fps: 30 });
      expect(captureSpy).toHaveBeenCalledTimes(2);
      expect(finalizeSpy).toHaveBeenCalledOnce();
      expect(result.frames).toBe(2);
    } finally {
      if (OrigOffscreenCanvas) {
        globalThis.OffscreenCanvas = OrigOffscreenCanvas;
      } else {
        delete (globalThis as Record<string, unknown>).OffscreenCanvas;
      }
    }
  });

  test('falls back to HTMLCanvasElement and ImageBitmap when OffscreenCanvas is unavailable', async () => {
    const { captureVideo } = await import('../../../packages/web/src/capture/pipeline.js');

    const renderer = {
      config: { width: 64, height: 48, fps: 24 },
      async *frames() {
        yield { frame: 0, timestamp: 0, state: { outputs: { css: {} } } };
      },
    };

    const initSpy = vi.fn();
    const captureSpy = vi.fn();
    const finalizeSpy = vi.fn().mockResolvedValue({
      codec: 'mock',
      frames: 1,
      durationMs: 41,
      blob: new Blob(),
    });

    const mockCapture = {
      init: initSpy,
      capture: captureSpy,
      finalize: finalizeSpy,
    };

    const originalOffscreenCanvas = globalThis.OffscreenCanvas;
    const originalCreateImageBitmap = globalThis.createImageBitmap;
    const originalDocument = globalThis.document;
    const imageBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const createImageBitmapSpy = vi.fn(async () => imageBitmap);
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        clearRect() {},
        fillRect() {},
        fillStyle: '',
      })),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => mockCanvas),
    } as unknown as Document);
    const mockCtx = {
      clearRect() {},
      fillRect() {},
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
    mockCanvas.getContext.mockReturnValue(mockCtx);

    delete (globalThis as Record<string, unknown>).OffscreenCanvas;
    vi.stubGlobal('createImageBitmap', createImageBitmapSpy);

    try {
      const result = await captureVideo(renderer as never, mockCapture as never);

      expect(initSpy).toHaveBeenCalledWith({ width: 64, height: 48, fps: 24 });
      expect(createImageBitmapSpy).toHaveBeenCalledOnce();
      expect(captureSpy).toHaveBeenCalledWith({
        frame: 0,
        timestamp: 0,
        bitmap: imageBitmap,
      });
      expect((imageBitmap as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalledOnce();
      expect(result.frames).toBe(1);
    } finally {
      if (originalOffscreenCanvas) {
        globalThis.OffscreenCanvas = originalOffscreenCanvas;
      } else {
        delete (globalThis as Record<string, unknown>).OffscreenCanvas;
      }
      if (originalDocument) {
        globalThis.document = originalDocument;
      } else {
        delete (globalThis as Record<string, unknown>).document;
      }
      if (originalCreateImageBitmap) {
        globalThis.createImageBitmap = originalCreateImageBitmap;
      } else {
        delete (globalThis as Record<string, unknown>).createImageBitmap;
      }
    }
  });

  test('throws when neither OffscreenCanvas nor document canvas support is available', async () => {
    const { captureVideo } = await import('../../../packages/web/src/capture/pipeline.js');

    const renderer = {
      config: { width: 16, height: 16, fps: 30 },
      async *frames() {
        yield { frame: 0, timestamp: 0, state: { outputs: { css: {} } } };
      },
    };

    const initSpy = vi.fn(async () => {});
    const finalizeSpy = vi.fn(async () => ({
      codec: 'mock',
      frames: 0,
      durationMs: 0,
      blob: new Blob(),
    }));
    const mockCapture = {
      init: initSpy,
      capture: vi.fn(),
      finalize: finalizeSpy,
    };

    const originalOffscreenCanvas = globalThis.OffscreenCanvas;
    const originalDocument = globalThis.document;
    delete (globalThis as Record<string, unknown>).OffscreenCanvas;
    delete (globalThis as Record<string, unknown>).document;

    try {
      await expect(captureVideo(renderer as never, mockCapture as never)).rejects.toThrow(
        'captureVideo requires OffscreenCanvas or HTMLCanvasElement support.',
      );
      expect(initSpy).toHaveBeenCalledOnce();
      expect(finalizeSpy).not.toHaveBeenCalled();
    } finally {
      if (originalOffscreenCanvas) {
        globalThis.OffscreenCanvas = originalOffscreenCanvas;
      } else {
        delete (globalThis as Record<string, unknown>).OffscreenCanvas;
      }
      if (originalDocument) {
        globalThis.document = originalDocument;
      } else {
        delete (globalThis as Record<string, unknown>).document;
      }
    }
  });

  test('throws when DOM canvas fallback cannot create an ImageBitmap', async () => {
    const { captureVideo } = await import('../../../packages/web/src/capture/pipeline.js');

    const renderer = {
      config: { width: 64, height: 48, fps: 24 },
      async *frames() {
        yield { frame: 0, timestamp: 0, state: { outputs: { css: {} } } };
      },
    };

    const mockCapture = {
      init: vi.fn(async () => {}),
      capture: vi.fn(),
      finalize: vi.fn(),
    };

    const originalOffscreenCanvas = globalThis.OffscreenCanvas;
    const originalCreateImageBitmap = globalThis.createImageBitmap;
    const originalDocument = globalThis.document;
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        clearRect() {},
        fillRect() {},
        fillStyle: '',
      })),
    };

    vi.stubGlobal(
      'document',
      {
        createElement: vi.fn(() => mockCanvas),
      } as unknown as Document,
    );
    delete (globalThis as Record<string, unknown>).OffscreenCanvas;
    delete (globalThis as Record<string, unknown>).createImageBitmap;

    try {
      await expect(captureVideo(renderer as never, mockCapture as never)).rejects.toThrow(
        'captureVideo requires createImageBitmap when OffscreenCanvas is unavailable.',
      );
      expect(mockCapture.capture).not.toHaveBeenCalled();
      expect(mockCapture.finalize).not.toHaveBeenCalled();
    } finally {
      if (originalOffscreenCanvas) {
        globalThis.OffscreenCanvas = originalOffscreenCanvas;
      } else {
        delete (globalThis as Record<string, unknown>).OffscreenCanvas;
      }
      if (originalDocument) {
        globalThis.document = originalDocument;
      } else {
        delete (globalThis as Record<string, unknown>).document;
      }
      if (originalCreateImageBitmap) {
        globalThis.createImageBitmap = originalCreateImageBitmap;
      } else {
        delete (globalThis as Record<string, unknown>).createImageBitmap;
      }
    }
  });
});

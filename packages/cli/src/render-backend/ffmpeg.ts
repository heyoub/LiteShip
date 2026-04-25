/**
 * Direct-ffmpeg render backend. Reads a VideoFrameOutput async iterable,
 * encodes each frame to raw RGBA, pipes through ffmpeg stdin, produces mp4.
 * No Revideo dependency — ffmpeg is a standard dev-machine binary.
 *
 * @module
 */

import { spawn } from 'node:child_process';
import type { VideoFrameOutput } from '@czap/core';

/** Options for `renderWithFfmpeg`. */
export interface RenderOpts {
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

/** Result summary after a successful render. */
export interface RenderResult {
  readonly frameCount: number;
  readonly elapsedMs: number;
}

/** Render a frame stream through ffmpeg to an mp4 file. */
export async function renderWithFfmpeg(
  frames: AsyncIterable<VideoFrameOutput>,
  opts: RenderOpts,
): Promise<RenderResult> {
  const start = Date.now();
  const args = [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${opts.width}x${opts.height}`,
    '-r', String(opts.fps),
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    opts.output,
  ];
  const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderrBuf = '';
  proc.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });

  let frameCount = 0;

  try {
    for await (const frame of frames) {
      const buf = frameToRGBA(frame, opts.width, opts.height);
      const ok = proc.stdin.write(buf);
      if (!ok) {
        await new Promise<void>((resolve) => proc.stdin.once('drain', () => resolve()));
      }
      frameCount++;
    }
  } finally {
    proc.stdin.end();
  }

  await new Promise<void>((resolveExit, rejectExit) => {
    proc.on('exit', (code) => {
      if (code === 0) resolveExit();
      else rejectExit(new Error(`ffmpeg exited with code ${code}: ${stderrBuf.slice(0, 500)}`));
    });
    proc.on('error', (err) => rejectExit(err));
  });

  return { frameCount, elapsedMs: Date.now() - start };
}

/**
 * Reference encoder — emits an opaque black RGBA buffer of the declared
 * dimensions. Real encoders map CompositeState through the Compositor's
 * multi-target outputs (CSS/GLSL/WGSL/ARIA). This stub produces valid
 * RGBA bytes so ffmpeg can encode the declared number of frames.
 */
function frameToRGBA(_frame: VideoFrameOutput, w: number, h: number): Uint8Array {
  const bytes = new Uint8Array(w * h * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    bytes[i + 3] = 255;
  }
  return bytes;
}

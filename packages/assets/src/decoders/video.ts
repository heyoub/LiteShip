/**
 * Video decoder — delegates to ffprobe for container + codec metadata.
 * Falls back to a header sniff if ffprobe is unavailable. czap does
 * not decode video frames in this layer; the render pipeline uses an
 * ffmpeg subprocess for actual decode.
 *
 * @module
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Decoded video container + codec metadata. */
export interface DecodedVideo {
  readonly container: string;
  readonly codec?: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSec?: number;
  readonly fps?: number;
}

/** Probe a video buffer for container/codec metadata. */
export async function videoDecoder(bytes: ArrayBuffer): Promise<DecodedVideo> {
  if (bytes.byteLength === 0) throw new Error('videoDecoder: empty buffer');
  const dir = mkdtempSync(join(tmpdir(), 'czap-video-'));
  const file = join(dir, 'input.bin');
  try {
    writeFileSync(file, new Uint8Array(bytes));
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' });
    if (r.status !== 0) return { container: guessContainer(bytes) };
    const data = JSON.parse(r.stdout) as {
      format?: { format_name?: string; duration?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string }>;
    };
    const v = (data.streams ?? []).find((s) => s.codec_type === 'video');
    return {
      container: data.format?.format_name ?? guessContainer(bytes),
      codec: v?.codec_name,
      width: v?.width,
      height: v?.height,
      durationSec: data.format?.duration ? Number(data.format.duration) : undefined,
      fps: v?.r_frame_rate ? evalFrac(v.r_frame_rate) : undefined,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function guessContainer(bytes: ArrayBuffer): string {
  const head = new Uint8Array(bytes.slice(0, 12));
  const ascii = String.fromCharCode(...head);
  if (ascii.includes('ftyp')) return 'mp4';
  if (head[0] === 0x1a && head[1] === 0x45) return 'webm';
  return 'unknown';
}

function evalFrac(s: string): number {
  const [n, d] = s.split('/').map(Number);
  return d ? n / d : n;
}

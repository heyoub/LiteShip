/**
 * Browser-side scene-dev player — scrubber + keyboard shortcuts +
 * HMR-reactive scene reload. Preserves playhead position on reload.
 *
 * @module
 */

let frame = 0;
let playing = false;

const playhead = document.getElementById('playhead') as HTMLDivElement;
const frameLabel = document.getElementById('frame') as HTMLSpanElement;
const log = document.getElementById('log') as HTMLPreElement;

function setFrame(n: number): void {
  frame = Math.max(0, n);
  frameLabel.textContent = `frame ${frame}`;
  playhead.style.left = `${Math.min(100, (frame / 240) * 100)}%`;
}

function render(): void {
  if (!playing) return;
  setFrame(frame + 1);
  if (frame < 240) requestAnimationFrame(render);
  else playing = false;
}

document.getElementById('play')!.addEventListener('click', () => {
  playing = true;
  render();
});
document.getElementById('pause')!.addEventListener('click', () => {
  playing = false;
});
document.getElementById('back')!.addEventListener('click', () => setFrame(frame - 1));
document.getElementById('fwd')!.addEventListener('click', () => setFrame(frame + 1));

document.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    playing = !playing;
    if (playing) render();
  } else if (e.key === '[') setFrame(frame - 1);
  else if (e.key === ']') setFrame(frame + 1);
  else if (e.key === ',') setFrame(frame - 10);
  else if (e.key === '.') setFrame(frame + 10);
});

// Vite HMR — preserve playhead on scene module reload.
const importMetaHot = (
  import.meta as unknown as { hot?: { on: (event: string, cb: (data: { sceneId: string }) => void) => void } }
).hot;
if (importMetaHot) {
  importMetaHot.on('czap:scene-update', (payload) => {
    log.textContent += `[hmr] scene ${payload.sceneId} reloaded at frame ${frame}\n`;
  });
}

// Test hook — Playwright waits on this before driving controls.
(window as unknown as { __czap_player_ready?: boolean }).__czap_player_ready = true;

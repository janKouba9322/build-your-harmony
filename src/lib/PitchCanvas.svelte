<script lang="ts">
  // Live pitch-trace canvas. Owns its own drawing, history and viewport.
  // The horizontal axis is in *seconds* (from audioContext time), so it stays
  // faithful to real time regardless of rAF jitter — and lines up with playback.
  // Parent feeds samples via push(), advances the view via tick(),
  // and freezes into a scrollable review via finish().
  import { midiToName } from "./musicTheory";
  import { tick as domTick } from "svelte";
  import type { Note } from "./types";

  type Sample = { time: number; midi: number; confident: boolean };

  const VISIBLE_SECONDS = 5; // how many seconds fit across the plot at once

  // visible vertical range in semitones (MIDI), eases to fit what's sung
  const DEFAULT_LO = 48; // C3
  const DEFAULT_HI = 72; // C5
  const MIN_SPAN = 14;
  const GUTTER = 40; // left axis column (must match .scroller margin-left)
  const NOTE_BAR_WIDTH = 8;

  let rangeLo = DEFAULT_LO;
  let rangeHi = DEFAULT_HI;

  // horizontal viewport: [firstVisibleTime, +VISIBLE_SECONDS] in seconds
  let firstVisibleTime = 0;
  let lastTime = 0;

  const history: Sample[] = [];
  let detectedNotes: Note[] = []; // decided notes from the segmenter (grid bars)

  let canvasEl: HTMLCanvasElement;
  let scrollerEl: HTMLDivElement;
  let spacerWidth = $state(0); // drives the phantom scrollbar's thumb size

  // colors pulled from the design tokens (canvas can't read CSS variables directly)
  let palette: { [key: string]: string } | null = null;

  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    palette = {
      accent: cs.getPropertyValue("--accent").trim(),
      uncertain: cs.getPropertyValue("--uncertain").trim(),
      line: "rgba(255,255,255,0.07)",
      muted: cs.getPropertyValue("--muted").trim(),
      yantar: cs.getPropertyValue("--yantar").trim(),
    };
  }

  // leftmost time that still keeps the newest sample pinned to the right edge
  function maxFirst(): number {
    return Math.max(0, lastTime - VISIBLE_SECONDS);
  }

  // ease the vertical range toward the min/max of confident samples
  function updateRange() {
    const confidentMidis = history
      .filter((s) => s.confident)
      .map((s) => s.midi);
    let targetLo = DEFAULT_LO;
    let targetHi = DEFAULT_HI;
    if (confidentMidis.length > 0) {
      targetLo = Math.min(...confidentMidis) - 3;
      targetHi = Math.max(...confidentMidis) + 3;
      if (targetHi - targetLo < MIN_SPAN) {
        const mid = (targetHi + targetLo) / 2;
        targetLo = mid - MIN_SPAN / 2;
        targetHi = mid + MIN_SPAN / 2;
      }
    }
    rangeLo += (targetLo - rangeLo) * 0.08;
    rangeHi += (targetHi - rangeHi) * 0.08;
  }

  function draw() {
    if (!canvasEl) return;
    if (!palette) readPalette();

    // size the backing store to the CSS box at device resolution
    const dpr = window.devicePixelRatio || 1;
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    if (canvasEl.width !== Math.round(w * dpr)) {
      canvasEl.width = Math.round(w * dpr);
      canvasEl.height = Math.round(h * dpr);
    }
    const ctx = canvasEl.getContext("2d");
    if (!ctx || !palette) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    updateRange();

    const padY = 10;
    const plotW = w - GUTTER;
    const plotH = h - padY * 2;

    const midiToY = (m: number): number =>
      padY + plotH - ((m - rangeLo) / (rangeHi - rangeLo)) * plotH;
    const timeToX = (t: number): number =>
      GUTTER + ((t - firstVisibleTime) / VISIBLE_SECONDS) * plotW;
    const alignXToGutter = (startX: number, endX: number) => {
      let x1: number = startX;
      let x2: number = endX;
      if (startX < GUTTER) {
        x1 = GUTTER;
      }
      if (endX < GUTTER) {
        x1 = -1;
        x2 = -1;
      }
      return { x1, x2 };
    };

    // --- horizontal gridlines + note labels (fixed left axis) ---
    ctx.font = '11px "Space Mono", monospace';
    ctx.textBaseline = "middle";
    const LINES = 5;
    for (let i = 0; i < LINES; i++) {
      const midi = rangeLo + ((rangeHi - rangeLo) * i) / (LINES - 1);
      const y = midiToY(midi);
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(GUTTER, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillStyle = palette.muted;
      ctx.textAlign = "left";
      ctx.fillText(midiToName(midi), 4, y);
    }

    // --- decided note bars (grid-snapped pitch, leading-voice amber) ---
    ctx.strokeStyle = palette.yantar;
    ctx.lineWidth = NOTE_BAR_WIDTH;
    for (const note of detectedNotes) {
      const { x1, x2 } = alignXToGutter(
        timeToX(note.startTime),
        timeToX(note.endTime),
      );
      const y = midiToY(Math.round(note.avgMidifloat)); // snap to the grid
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }

    // --- raw pitch trace (per-frame samples) ---
    for (const s of history) {
      if (!Number.isFinite(s.midi)) continue;
      const x = timeToX(s.time);
      if (x <= GUTTER) continue; // scrolled off behind the axis
      const y = midiToY(s.midi);
      ctx.beginPath();
      ctx.arc(x, y, s.confident ? 2.6 : 1.5, 0, Math.PI * 2);
      ctx.fillStyle = s.confident ? palette.accent : palette.uncertain;
      ctx.globalAlpha = s.confident ? 1 : 0.6;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // phantom scrollbar → viewport offset (review mode only; during recording
  // the spacer is 0-wide so no scrollbar shows and this never fires)
  function onScroll() {
    const max = scrollerEl.scrollWidth - scrollerEl.clientWidth;
    const frac = max > 0 ? scrollerEl.scrollLeft / max : 0;
    firstVisibleTime = frac * maxFirst();
    draw();
  }

  // --- public API for the parent ---

  // store a raw sample; drawing is driven by tick(), not here
  export function push(time: number, midi: number, confident: boolean) {
    history.push({ time, midi, confident });
  }

  // advance the viewport and redraw — called every frame, even on silence
  export function tick(time: number) {
    lastTime = time;
    firstVisibleTime = maxFirst();
    draw();
  }

  export function clear() {
    history.length = 0;
    detectedNotes = [];
    rangeLo = DEFAULT_LO;
    rangeHi = DEFAULT_HI;
    firstVisibleTime = 0;
    lastTime = 0;
    spacerWidth = 0;
    draw();
  }

  // freeze into review mode: size the scrollbar to the take and jump to the end
  export async function finish(notes: Note[]) {
    detectedNotes = notes;
    const view = scrollerEl.clientWidth || 1;
    spacerWidth = view * Math.max(1, lastTime / VISIBLE_SECONDS);
    await domTick(); // wait for the spacer to actually widen…
    scrollerEl.scrollLeft = scrollerEl.scrollWidth; // …then pin the thumb right (triggers onScroll → redraw)
    draw();
  }
</script>

<div class="trace-wrap">
  <canvas class="trace" bind:this={canvasEl} aria-label="Živá stopa výšky hlasu"
  ></canvas>
  <div class="scroller" bind:this={scrollerEl} onscroll={onScroll}>
    <div class="spacer" style:width="{spacerWidth}px"></div>
  </div>
</div>

<style>
  .trace-wrap {
    position: relative;
  }
  .trace {
    width: 100%;
    height: 150px;
    display: block;
    border-radius: 12px;
    background: var(--bg);
  }

  /* phantom scrollbar — empty track, only the spacer creates overflow */
  .scroller {
    overflow-x: auto;
    overflow-y: hidden;
    margin-top: 6px;
    /* leave room for the gutter so the bar lines up with the plot, not the axis */
    margin-left: 40px;
  }
  .spacer {
    height: 1px; /* invisible; just needs to be wider than the track to show a bar */
  }

  /* WebKit / Blink (Chrome, Edge, Safari) */
  .scroller::-webkit-scrollbar {
    height: 10px;
  }
  .scroller::-webkit-scrollbar-track {
    background: var(--text);
    border-radius: 6px;
  }
  .scroller::-webkit-scrollbar-thumb {
    background: var(--muted);
    border-radius: 6px;
    border: 2px solid var(--mutted); /* inset look */
  }
  .scroller::-webkit-scrollbar-thumb:hover {
    background: var(--accent);
  }

  /* Firefox */
  .scroller {
    scrollbar-width: thin;
    scrollbar-color: var(--muted) var(--surface);
  }
</style>

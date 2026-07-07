<script lang="ts">
  // Live pitch-trace canvas. Owns its own drawing, history and viewport.
  // The horizontal axis is in *seconds* (from audioContext time), so it stays
  // faithful to real time regardless of rAF jitter — and lines up with playback.
  // Parent feeds samples via push(), advances the view via tick(),
  // and freezes into a scrollable review via finish().
  //
  // In review mode a chord band appears above the plot: one tile per detected
  // chord segment, sharing the same timeToX axis as the trace and the bars,
  // so chords sit exactly over the notes they cover.
  import { onMount, tick as domTick } from "svelte";
  import {
    midiToName,
    degreeNumeral,
    chordLabel,
    chordUncertain,
  } from "./musicTheory";
  import type { ChordSegment, KeyInfo, KeyMode, Note } from "./types";

  type Sample = { time: number; midi: number; confident: boolean };

  const VISIBLE_SECONDS = 4;
  const CURSOR_POSITION_RATIO = 0.8;

  // visible vertical range in semitones (MIDI), eases to fit what's sung
  const DEFAULT_LO = 48; // C3
  const DEFAULT_HI = 72; // C5
  const MIN_SPAN = 14;

  const GUTTER = 44; // left axis column (must match .scroller margin-left)
  const NOTE_BAR_WIDTH = 7;
  const CHORD_BAND_H = 62; // px reserved for the chord band (review only)
  const PAD_TOP = 10;
  const PAD_BOTTOM = 24; // leaves room for the time ticks

  let rangeLo = DEFAULT_LO;
  let rangeHi = DEFAULT_HI;

  // horizontal viewport: [firstVisibleTime, +VISIBLE_SECONDS] in seconds
  let firstVisibleTime = 0;
  let lastTime = 0;

  const history: Sample[] = [];
  let detectedNotes: Note[] = []; // decided notes from the segmenter (grid bars)
  let chordSegments: ChordSegment[] = [];
  let keyMode: KeyMode | null = null; // needed to render roman numerals

  let canvasEl: HTMLCanvasElement;
  let scrollerEl: HTMLDivElement;
  let spacerWidth = $state(0); // drives the phantom scrollbar's thumb size

  let playhead: number | null = null;

  // Colors pulled from the design tokens. Read on EVERY draw so that a
  // palette change in app.css immediately shows up here too — canvases
  // can't read CSS variables natively.
  let palette: { [key: string]: string } = {};

  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string) => cs.getPropertyValue(name).trim();
    palette = {
      accent: read("--accent"),
      accent2: read("--accent-2"),
      accent3: read("--accent-3"),
      uncertain: read("--uncertain"),
      muted: read("--muted"),
      text: read("--text"),
      line: read("--line"),
      raised: read("--raised"),
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

  // rounded-rect path helper (canvas has roundRect but keep it explicit + safe)
  function roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function draw() {
    if (!canvasEl) return;
    readPalette();

    // size the backing store to the CSS box at device resolution
    // (checks BOTH dimensions so responsive height changes re-render crisply)
    const dpr = window.devicePixelRatio || 1;
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (canvasEl.width !== W || canvasEl.height !== H) {
      canvasEl.width = W;
      canvasEl.height = H;
    }
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    updateRange();

    // the chord band only exists in review mode (segments known)
    const bandH = chordSegments.length > 0 && keyMode ? CHORD_BAND_H : 0;
    const plotTop = bandH + PAD_TOP;
    const plotW = w - GUTTER;
    const plotH = h - plotTop - PAD_BOTTOM;

    const midiToY = (m: number): number =>
      plotTop + plotH - ((m - rangeLo) / (rangeHi - rangeLo)) * plotH;
    const timeToX = (t: number): number =>
      GUTTER + ((t - firstVisibleTime) / VISIBLE_SECONDS) * plotW;

    // --- gutter backdrop: slightly raised column anchoring the axis ---
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = palette.raised;
    ctx.fillRect(0, 0, GUTTER - 6, h);
    ctx.globalAlpha = 1;

    // --- horizontal gridlines + note labels (fixed left axis) ---
    ctx.font = '11px "Space Mono", monospace';
    ctx.textBaseline = "middle";
    const LINES = 5;
    for (let i = 0; i < LINES; i++) {
      const midi = rangeLo + ((rangeHi - rangeLo) * i) / (LINES - 1);
      const y = midiToY(midi);
      ctx.strokeStyle = palette.line;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(GUTTER, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.muted;
      ctx.textAlign = "left";
      ctx.fillText(midiToName(midi), 6, y);
    }

    // --- time ticks along the bottom (one per second) ---
    ctx.textAlign = "center";
    ctx.font = '9px "Space Mono", monospace';
    const tickStart = Math.ceil(firstVisibleTime);
    const tickEnd = Math.floor(firstVisibleTime + VISIBLE_SECONDS);
    for (let t = tickStart; t <= tickEnd; t++) {
      const x = timeToX(t);
      if (x < GUTTER + 10) continue;
      ctx.strokeStyle = palette.line;
      ctx.beginPath();
      ctx.moveTo(x, plotTop + plotH);
      ctx.lineTo(x, plotTop + plotH + 4);
      ctx.stroke();
      ctx.fillStyle = palette.muted;
      ctx.globalAlpha = 0.8;
      ctx.fillText(`${t}s`, x, h - 8);
      ctx.globalAlpha = 1;
    }

    // --- chord band (review only) ---
    if (bandH > 0 && keyMode) {
      const tileY = 6;
      const tileH = bandH - 18;

      for (const seg of chordSegments) {
        const rawX1 = timeToX(seg.startTime);
        const rawX2 = timeToX(seg.endTime);
        const x1 = Math.max(rawX1, GUTTER + 2);
        const x2 = Math.min(rawX2, w - 2);
        const tw = x2 - x1;
        if (tw < 6) continue; // scrolled off / too thin to matter

        const best = seg.candidates[0];
        const second = seg.candidates[1];
        const uncertain = chordUncertain(seg);
        const playingHere =
          playhead !== null &&
          playhead >= seg.startTime &&
          playhead <= seg.endTime;

        // tile fill: honest about uncertainty via alpha; lights up under playhead
        let fillA = uncertain ? 0.08 : 0.16;
        if (playingHere) fillA += 0.1;
        roundRectPath(ctx, x1, tileY, tw, tileH, 9);
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = fillA;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = playingHere ? palette.accent : palette.line;
        ctx.globalAlpha = playingHere ? 0.7 : 0.9;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // labels — degrade gracefully as the tile narrows
        const numeral = degreeNumeral(best.degree, keyMode);
        let label = `${chordLabel(best, keyMode)} (${numeral})`;

        ctx.font = '700 17px "Bricolage Grotesque", system-ui, sans-serif';
        const numW = ctx.measureText(label).width;
        if (numW + 18 <= tw) {
          ctx.textAlign = "left";
          ctx.fillStyle = palette.accent;
          ctx.globalAlpha = uncertain ? 0.65 : 1;
          ctx.fillText(label, x1 + 11, tileY + tileH / 2 - 8);
          ctx.globalAlpha = 1;

          // second line: chord name, plus the runner-up when it's a close call
          if (uncertain && second) {
            const altNumeral = degreeNumeral(second.degree, keyMode);
            const altLabel = `or ${chordLabel(second, keyMode)} (${altNumeral})`;
            ctx.font = '10px "Space Mono", monospace';
            if (ctx.measureText(altLabel).width + 18 <= tw) {
              ctx.fillStyle = palette.muted;
              ctx.fillText(altLabel, x1 + 11, tileY + tileH / 2 + 9);
            }
          }
        }
      }

      // separator under the band
      ctx.strokeStyle = palette.line;
      ctx.beginPath();
      ctx.moveTo(GUTTER, bandH - 4);
      ctx.lineTo(w, bandH - 4);
      ctx.stroke();

      // segment boundaries continue into the plot as faint dashed guides
      ctx.setLineDash([3, 5]);
      ctx.globalAlpha = 0.45;
      for (let i = 1; i < chordSegments.length; i++) {
        const x = timeToX(chordSegments[i].startTime);
        if (x <= GUTTER) continue;
        ctx.beginPath();
        ctx.moveTo(x, bandH);
        ctx.lineTo(x, plotTop + plotH);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // --- decided note bars (grid-snapped pitch, leading-voice amber) ---
    const review = detectedNotes.length > 0;
    ctx.lineCap = "round";
    ctx.lineWidth = NOTE_BAR_WIDTH;
    ctx.strokeStyle = palette.accent;
    if (review) {
      // soft glow makes the "decided melody" read as the hero layer
      ctx.shadowColor = palette.accent;
      ctx.shadowBlur = 7;
    }
    for (const note of detectedNotes) {
      const rawX1 = timeToX(note.startTime);
      const rawX2 = timeToX(note.endTime);
      if (rawX2 <= GUTTER) continue; // fully scrolled off behind the axis
      const x1 = Math.max(rawX1, GUTTER + NOTE_BAR_WIDTH / 2);
      const y = midiToY(Math.round(note.avgMidifloat)); // snap to the grid
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(rawX2, y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";

    // --- raw pitch trace (per-frame samples) ---
    for (const s of history) {
      if (!Number.isFinite(s.midi)) continue;
      const x = timeToX(s.time);
      if (x <= GUTTER) continue; // scrolled off behind the axis
      const y = midiToY(s.midi);
      ctx.beginPath();
      ctx.arc(x, y, s.confident ? 2.6 : 1.5, 0, Math.PI * 2);
      ctx.fillStyle = s.confident ? palette.accent2 : palette.uncertain;
      ctx.globalAlpha = s.confident ? 1 : 0.55;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // --- empty-state hint before anything is sung ---
    if (history.length === 0 && detectedNotes.length === 0) {
      ctx.font = '12px "Space Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = palette.muted;
      ctx.globalAlpha = 0.8;
      ctx.fillText(
        "Turn on the mic — your pitch trace runs here",
        GUTTER + plotW / 2,
        plotTop + plotH / 2,
      );
      ctx.globalAlpha = 1;
    }

    // --- playhead: glowing cursor with a handle, over everything ---
    if (playhead !== null) {
      const x = timeToX(playhead);
      if (x >= GUTTER) {
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2;
        ctx.shadowColor = palette.accent;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // small triangle handle at the very top
        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.moveTo(x - 5, 0);
        ctx.lineTo(x + 5, 0);
        ctx.lineTo(x, 7);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // phantom scrollbar → viewport offset (review mode only; during recording
  // the spacer is 0-wide so no scrollbar shows and this never fires)
  function onScroll() {
    const max = scrollerEl.scrollWidth - scrollerEl.clientWidth;
    const frac = max > 0 ? scrollerEl.scrollLeft / max : 0;
    firstVisibleTime = frac * maxFirst();
    draw();
  }

  onMount(() => {
    draw(); // show the grid + hint before any recording starts
    // web fonts arrive async — redraw once loaded so canvas text uses them
    document.fonts?.ready.then(() => draw());
    // responsive: re-render crisply whenever the container resizes
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvasEl);
    return () => ro.disconnect();
  });

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
    chordSegments = [];
    keyMode = null;
    playhead = null;
    rangeLo = DEFAULT_LO;
    rangeHi = DEFAULT_HI;
    firstVisibleTime = 0;
    lastTime = 0;
    spacerWidth = 0;
    draw();
  }

  // freeze into review mode: store results, size the scrollbar to the take
  // and jump to the end (keyInfo brings the mode for roman numerals)
  export async function finish(
    _notes: Note[],
    _chordSegments: ChordSegment[],
    _keyInfo?: KeyInfo | null,
  ) {
    detectedNotes = _notes;
    chordSegments = _chordSegments;
    keyMode = _keyInfo?.mode ?? null;
    const view = scrollerEl.clientWidth || 1;
    spacerWidth = view * Math.max(1, lastTime / VISIBLE_SECONDS);
    await domTick(); // wait for the spacer to actually widen…
    scrollerEl.scrollLeft = scrollerEl.scrollWidth; // …then pin the thumb right (triggers onScroll → redraw)
    draw();
  }

  export function setPlayhead(t: number | null) {
    playhead = t;
    if (playhead !== null) {
      const cursorPosition = VISIBLE_SECONDS * CURSOR_POSITION_RATIO;
      const desired = playhead > cursorPosition ? playhead - cursorPosition : 0;
      firstVisibleTime = Math.min(desired, maxFirst()); // clamp at the end
    }
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
    height: clamp(240px, 42vw, 320px);
    display: block;
    border-radius: 14px;
    background: var(--well);
    border: 1px solid var(--line);
  }

  /* phantom scrollbar — empty track, only the spacer creates overflow */
  .scroller {
    overflow-x: auto;
    overflow-y: hidden;
    margin-top: 6px;
    /* leave room for the gutter so the bar lines up with the plot, not the axis */
    margin-left: 44px;
  }
  .spacer {
    height: 1px; /* invisible; just needs to be wider than the track to show a bar */
  }

  /* WebKit / Blink (Chrome, Edge, Safari) */
  .scroller::-webkit-scrollbar {
    height: 9px;
  }
  .scroller::-webkit-scrollbar-track {
    background: var(--raised);
    border-radius: 6px;
  }
  .scroller::-webkit-scrollbar-thumb {
    background: var(--line-strong);
    border-radius: 6px;
    border: 2px solid var(--raised); /* inset look */
  }
  .scroller::-webkit-scrollbar-thumb:hover {
    background: var(--accent);
  }

  /* Firefox */
  .scroller {
    scrollbar-width: thin;
    scrollbar-color: var(--line-strong) var(--raised);
  }
</style>

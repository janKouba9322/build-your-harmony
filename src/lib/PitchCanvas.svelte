<script lang="ts">
  // Live pitch-trace canvas. Owns its own drawing, history and viewport.
  // The horizontal axis is in *seconds* (from audioContext time), so it stays
  // faithful to real time regardless of rAF jitter — and lines up with playback.
  //
  // Parent feeds samples via push(), advances the view via tick(), and freezes
  // into a scrollable review via finish().
  //
  // In review mode a chord band appears above the plot: one tile per detected
  // chord segment, sharing the same timeToX axis as the trace and the bars, so
  // chords sit exactly over the notes they cover.
  //
  // The heavy per-frame work lives in draw(), which is split into small
  // drawXxx() steps for readability. Pure geometry/palette/range helpers live
  // in ./canvasHelpers so this file stays focused on orchestration and state.
  import { onMount, tick as domTick } from "svelte";
  import {
    midiToName,
    degreeNumeral,
    chordLabel,
    chordUncertain,
  } from "./musicTheory";
  import type { ChordSegment, KeyInfo, KeyMode, Note, Sample } from "./types";
  import { CONFIDENCE_CLARITY } from "./constans";
  import {
    readPalette,
    computeGeometry,
    makeMidiToY,
    makeTimeToX,
    computeTargetRange,
    roundRectPath,
    type CanvasPalette,
    type PlotGeometry,
  } from "./canvasHelpers";

  type VisualSample = { time: number; midi: number; confident: boolean };

  // --- layout constants ---
  const VISIBLE_SECONDS = 4;
  const CURSOR_POSITION_RATIO = 0.8; // where the playhead sits in the window while playing

  const DEFAULT_LO = 48; // C3 — starting vertical range before anything is sung
  const DEFAULT_HI = 72; // C5
  const MIN_SPAN = 14; // never zoom tighter than this many semitones

  const GUTTER = 44; // left axis column (must match .scroller margin-left)
  const NOTE_BAR_WIDTH = 12;
  const CHORD_BAND_H = 62; // px reserved for the chord band (review only)
  const PAD_TOP = 10;
  const PAD_BOTTOM = 24; // leaves room for the time ticks

  // --- viewport / range state ---
  let rangeLo = DEFAULT_LO;
  let rangeHi = DEFAULT_HI;
  let firstVisibleTime = 0; // left edge of the [.., +VISIBLE_SECONDS] window
  let lastTime = 0; // newest sample time seen

  // --- data state ---
  const visualHistory: VisualSample[] = []; // raw per-frame samples (live trace)
  let detectedNotes: Note[] = []; // decided notes from the segmenter (grid bars)
  let cleanedSamples: Sample[] = []; // cleaned trace shown in review
  let chordSegments: ChordSegment[] = [];
  let keyMode: KeyMode | null = null; // needed to render roman numerals
  let selectedNoteIndex = -1; // clicked note (highlighted teal)
  let playhead: number | null = null;

  // --- DOM refs ---
  let canvasEl: HTMLCanvasElement;
  let scrollerEl: HTMLDivElement;
  let spacerWidth = $state(0); // drives the phantom scrollbar's thumb size

  // --- per-draw scratch (recomputed every frame; shared with handleClick) ---
  let palette: CanvasPalette = {} as CanvasPalette;
  let geo: PlotGeometry = { bandH: 0, plotTop: 0, plotW: 0, plotH: 0 };
  let midiToY: (m: number) => number = () => 0;
  let timeToX: (t: number) => number = () => 0;

  // leftmost time that still keeps the newest sample pinned to the right edge
  function maxFirst(): number {
    return Math.max(0, lastTime - VISIBLE_SECONDS);
  }

  // Ease (live) or snap (review) the vertical range toward the sung pitches.
  // Live uses confident visual samples; review uses the cleaned samples.
  function updateRange() {
    const isRecording = detectedNotes.length === 0;
    const midis = isRecording
      ? visualHistory.filter((s) => s.confident).map((s) => s.midi)
      : detectedNotes.map((s) => Math.round(s.avgMidifloat));

    const target = computeTargetRange(midis, DEFAULT_LO, DEFAULT_HI, MIN_SPAN);
    if (isRecording) {
      // smooth follow while singing, so the axis glides instead of jumping
      rangeLo += (target.lo - rangeLo) * 0.08;
      rangeHi += (target.hi - rangeHi) * 0.08;
    } else {
      // review: show the whole take at once, no easing
      rangeLo = target.lo;
      rangeHi = target.hi;
    }
  }

  // ========================================================================
  //  DRAW — orchestrates the per-frame render out of small named steps
  // ========================================================================
  function draw() {
    if (!canvasEl) return;
    palette = readPalette();

    // size the backing store to the CSS box at device resolution (checks BOTH
    // dimensions so responsive height changes re-render crisply)
    const dpr = window.devicePixelRatio || 1;
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvasEl.width !== bw || canvasEl.height !== bh) {
      canvasEl.width = bw;
      canvasEl.height = bh;
    }
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    updateRange();

    // recompute geometry + coordinate maps for this frame's size/range
    const showBand = chordSegments.length > 0 && keyMode !== null;
    geo = computeGeometry(
      w,
      h,
      GUTTER,
      PAD_TOP,
      PAD_BOTTOM,
      CHORD_BAND_H,
      showBand,
    );
    midiToY = makeMidiToY(geo, rangeLo, rangeHi);
    timeToX = makeTimeToX(geo, GUTTER, firstVisibleTime, VISIBLE_SECONDS);

    drawGutterAndGrid(ctx, w, h);
    drawTimeTicks(ctx, h);
    if (showBand) drawChordBand(ctx, w);
    drawNoteBars(ctx);
    drawTrace(ctx);
    drawEmptyStateHint(ctx);
    drawPlayhead(ctx, h);
  }

  // --- gutter backdrop + horizontal gridlines with note labels ---
  function drawGutterAndGrid(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = palette.raised;
    ctx.fillRect(0, 0, GUTTER - 6, h);
    ctx.globalAlpha = 1;

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
  }

  // --- one tick per second along the bottom ---
  function drawTimeTicks(ctx: CanvasRenderingContext2D, h: number) {
    ctx.textAlign = "center";
    ctx.font = '9px "Space Mono", monospace';
    const tickStart = Math.ceil(firstVisibleTime);
    const tickEnd = Math.floor(firstVisibleTime + VISIBLE_SECONDS);
    for (let t = tickStart; t <= tickEnd; t++) {
      const x = timeToX(t);
      if (x < GUTTER + 10) continue;
      ctx.strokeStyle = palette.line;
      ctx.beginPath();
      ctx.moveTo(x, geo.plotTop + geo.plotH);
      ctx.lineTo(x, geo.plotTop + geo.plotH + 4);
      ctx.stroke();
      ctx.fillStyle = palette.muted;
      ctx.globalAlpha = 0.8;
      ctx.fillText(`${t}s`, x, h - 8);
      ctx.globalAlpha = 1;
    }
  }

  // --- chord band (review only): one tile per segment, over the notes ---
  function drawChordBand(ctx: CanvasRenderingContext2D, w: number) {
    if (!keyMode) return;
    const tileY = 6;
    const tileH = geo.bandH - 18;

    for (const seg of chordSegments) {
      const x1 = Math.max(timeToX(seg.startTime), GUTTER + 2);
      const x2 = Math.min(timeToX(seg.endTime), w - 2);
      const tw = x2 - x1;
      if (tw < 6) continue; // scrolled off / too thin to label

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

      // labels — only when they fit; degrade gracefully as the tile narrows
      const label = `${chordLabel(best, keyMode)} (${degreeNumeral(best.degree, keyMode)})`;
      ctx.font = '700 17px "Bricolage Grotesque", system-ui, sans-serif';
      if (ctx.measureText(label).width + 18 <= tw) {
        ctx.textAlign = "left";
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = uncertain ? 0.65 : 1;
        ctx.fillText(label, x1 + 11, tileY + tileH / 2 - 8);
        ctx.globalAlpha = 1;

        // second line: the runner-up, when it's a genuinely close call
        if (uncertain && second) {
          const altLabel = `or ${chordLabel(second, keyMode)} (${degreeNumeral(second.degree, keyMode)})`;
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
    ctx.moveTo(GUTTER, geo.bandH - 4);
    ctx.lineTo(w, geo.bandH - 4);
    ctx.stroke();

    // segment boundaries continue into the plot as faint dashed guides
    ctx.setLineDash([3, 5]);
    ctx.globalAlpha = 0.45;
    for (let i = 1; i < chordSegments.length; i++) {
      const x = timeToX(chordSegments[i].startTime);
      if (x <= GUTTER) continue;
      ctx.beginPath();
      ctx.moveTo(x, geo.bandH);
      ctx.lineTo(x, geo.plotTop + geo.plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // --- decided note bars (grid-snapped pitch, leading-voice amber) ---
  function drawNoteBars(ctx: CanvasRenderingContext2D) {
    const review = detectedNotes.length > 0;
    ctx.lineCap = "round";
    ctx.lineWidth = NOTE_BAR_WIDTH;
    if (review) {
      // soft glow makes the "decided melody" read as the hero layer
      ctx.shadowColor = palette.accent;
      ctx.shadowBlur = 7;
    }
    for (let i = 0; i < detectedNotes.length; i++) {
      const note = detectedNotes[i];
      const rawX2 = timeToX(note.endTime);
      if (rawX2 <= GUTTER) continue; // fully scrolled off behind the axis
      const rawX1 = timeToX(note.startTime);
      const x1 = Math.max(rawX1, GUTTER + NOTE_BAR_WIDTH / 2);
      const y = midiToY(Math.round(note.avgMidifloat)); // snap to the grid
      if (i === selectedNoteIndex) {
        ctx.strokeStyle = palette.accent3;
        const label = midiToName(Math.round(note.avgMidifloat));
        ctx.font = '700 16px "Bricolage Grotesque", system-ui, sans-serif';
        ctx.textAlign = "left";
        ctx.fillStyle = palette.accent3;
        ctx.globalAlpha = 1;
        if (rawX1 > GUTTER) {
          ctx.fillText(label, rawX1, y - NOTE_BAR_WIDTH * 1.5);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = palette.accent;
      }
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(rawX2, y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
  }

  // --- pitch trace: raw per-frame dots live, cleaned dots in review ---
  function drawTrace(ctx: CanvasRenderingContext2D) {
    const live = cleanedSamples.length === 0;
    const dots: { x: number; y: number; confident: boolean }[] = [];

    if (live) {
      for (const s of visualHistory) {
        if (!Number.isFinite(s.midi)) continue;
        const x = timeToX(s.time);
        if (x <= GUTTER) continue;
        dots.push({ x, y: midiToY(s.midi), confident: s.confident });
      }
    } else {
      for (const s of cleanedSamples) {
        if (!Number.isFinite(s.midi)) continue;
        const x = timeToX(s.time);
        if (x <= GUTTER) continue;
        dots.push({
          x,
          y: midiToY(s.midi),
          confident: s.clarity > CONFIDENCE_CLARITY,
        });
      }
    }

    for (const d of dots) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.confident ? 2.6 : 1.5, 0, Math.PI * 2);
      ctx.fillStyle = d.confident ? palette.accent2 : palette.uncertain;
      ctx.globalAlpha = d.confident ? 1 : 0.55;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- hint shown on the empty canvas before anything is sung ---
  function drawEmptyStateHint(ctx: CanvasRenderingContext2D) {
    if (visualHistory.length > 0 || detectedNotes.length > 0) return;
    ctx.font = '12px "Space Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillStyle = palette.muted;
    ctx.globalAlpha = 0.8;
    ctx.fillText(
      "Turn on the mic — your pitch trace runs here",
      GUTTER + geo.plotW / 2,
      geo.plotTop + geo.plotH / 2,
    );
    ctx.globalAlpha = 1;
  }

  // --- playhead: glowing cursor with a triangle handle, over everything ---
  function drawPlayhead(ctx: CanvasRenderingContext2D, h: number) {
    if (playhead === null) return;
    const x = timeToX(playhead);
    if (x < GUTTER) return;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(x - 5, 0);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x, 7);
    ctx.closePath();
    ctx.fill();
  }

  // phantom scrollbar → viewport offset (review mode only; during recording
  // the spacer is 0-wide so no scrollbar shows and this never fires)
  function onScroll() {
    const max = scrollerEl.scrollWidth - scrollerEl.clientWidth;
    const frac = max > 0 ? scrollerEl.scrollLeft / max : 0;
    firstVisibleTime = frac * maxFirst();
    draw();
  }

  // click a note bar to select it (highlights teal). The hitbox mirrors exactly
  // how drawNoteBars draws each bar — same rounded pitch, same gutter clamp —
  // so a click always lands on what the user sees.
  function handleClick(event: MouseEvent) {
    const rect = canvasEl.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    let hit = -1;
    for (let i = 0; i < detectedNotes.length; i++) {
      const note = detectedNotes[i];
      const x2 = timeToX(note.endTime);
      if (x2 < GUTTER) continue;
      const x1 = Math.max(timeToX(note.startTime), GUTTER + NOTE_BAR_WIDTH / 2);
      const y = midiToY(Math.round(note.avgMidifloat));
      const inBounds =
        mouseX >= x1 &&
        mouseX <= x2 &&
        mouseY >= y - NOTE_BAR_WIDTH / 2 &&
        mouseY <= y + NOTE_BAR_WIDTH / 2;
      if (inBounds) {
        hit = i;
        break; // first bar under the cursor wins
      }
    }
    selectedNoteIndex = hit;
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

  // ======================= public API for the parent =======================

  // store a raw sample; drawing is driven by tick(), not here
  export function push(time: number, midi: number, confident: boolean) {
    visualHistory.push({ time, midi, confident });
  }

  // advance the viewport and redraw — called every frame, even on silence
  export function tick(time: number) {
    lastTime = time;
    firstVisibleTime = maxFirst();
    draw();
  }

  export function clear() {
    visualHistory.length = 0;
    detectedNotes = [];
    chordSegments = [];
    cleanedSamples = [];
    keyMode = null;
    playhead = null;
    rangeLo = DEFAULT_LO;
    rangeHi = DEFAULT_HI;
    firstVisibleTime = 0;
    lastTime = 0;
    spacerWidth = 0;
    selectedNoteIndex = -1;
    draw();
  }

  // freeze into review mode: store results, size the scrollbar to the take and
  // jump to the end (keyInfo brings the mode for the roman numerals)
  export async function finish(
    _notes: Note[],
    _chordSegments: ChordSegment[],
    _cleanedSamples: Sample[],
    _keyInfo?: KeyInfo | null,
  ) {
    detectedNotes = _notes;
    chordSegments = _chordSegments;
    cleanedSamples = _cleanedSamples.filter((s) => Number.isFinite(s.midi));
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
  <canvas
    class="trace"
    bind:this={canvasEl}
    onclick={handleClick}
    aria-label="Live trace"
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

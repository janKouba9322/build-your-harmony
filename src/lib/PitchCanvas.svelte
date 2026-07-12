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
  import { onMount, onDestroy, tick as domTick, untrack } from "svelte";
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
    midiToYPx,
    timeToXPx,
    computeTargetRange,
    roundRectPath,
    type CanvasPalette,
    type PlotGeometry,
  } from "./canvasHelpers";

  type VisualSample = { time: number; midi: number; confident: boolean };

  // --- layout constants ---
  const VISIBLE_SECONDS = 4;
  const CURSOR_POSITION_RATIO = 0.8; // where the playhead sits in the window while playing

  const CONTROLS_X_OFFSET = 48;

  const DEFAULT_LO = 48; // C3 — starting vertical range before anything is sung
  const DEFAULT_HI = 72; // C5
  const MIN_SPAN = 14; // never zoom tighter than this many semitones

  const GUTTER = 44; // left axis column (must match .scroller margin-left)
  const NOTE_BAR_WIDTH = 12;
  const CHORD_BAND_H = 62; // px reserved for the chord band (review only)
  const PAD_TOP = 10;
  const PAD_BOTTOM = 24; // leaves room for the time ticks

  // horizontal margin, in px, on each side of a selected bar's edges where a
  // drag resizes it (independent of NOTE_BAR_WIDTH, which is vertical thickness)
  const RESIZE_ZONE_WIDTH = 10;
  // floor duration when resizing, mirrors the segmenter's own MIN_NOTE_DURATION
  // so an edited note can't be dragged shorter than a note would ever be kept
  const MIN_NOTE_SECONDS = 0.08;

  // --- viewport / range state ---
  let rangeLo = DEFAULT_LO;
  let rangeHi = DEFAULT_HI;
  let firstVisibleTime = 0; // left edge of the [.., +VISIBLE_SECONDS] window
  let lastTime = 0; // newest sample time seen

  // Running min/max of confident live pitches, updated in push() rather than
  // recomputed from the whole history every draw. Keeps the per-frame cost flat
  // no matter how long the recording gets.
  let liveMinMidi = Infinity;
  let liveMaxMidi = -Infinity;

  // --- data state ---
  const visualHistory: VisualSample[] = []; // raw per-frame samples (live trace)
  let detectedNotes: Note[] = []; // decided notes from the segmenter (grid bars)
  let originalDetectedNotes: Note[] = [];
  let cleanedSamples: Sample[] = []; // cleaned trace shown in review
  let chordSegments: ChordSegment[] = [];
  let keyMode: KeyMode | null = null; // needed to render roman numerals
  let selectedNoteIndex = $state(-1); // clicked note (highlighted teal)
  let playhead: number | null = null;

  let controlsX = $state(-1);
  let controlsY = $state(-1);
  let controlsWidth = $state(0);
  let selectedNoteLabel = $state(""); // shown in the pill, kept in sync with the selected bar

  // which edge of which note is being dragged, if any. Live-updates the note
  // locally on every move; the parent only hears about it once via
  // onNoteResized in handleResizeUp (not on every mousemove).
  type ResizeDrag = { edge: "start" | "end"; noteIndex: number } | null;
  let noteResizing: ResizeDrag = null;
  // the mouseup that ends a drag still fires a trailing click afterwards —
  // this swallows that one click so it doesn't re-run selection logic
  let suppressNextClick = false;

  // --- DOM refs ---
  let canvasEl: HTMLCanvasElement;
  let controlsEl: HTMLDivElement | undefined = $state();
  let scrollerEl: HTMLDivElement;
  let spacerWidth = $state(0); // drives the phantom scrollbar's thumb size

  // --- per-draw scratch (recomputed every frame; shared with handleClick) ---
  let palette: CanvasPalette = {} as CanvasPalette;
  let geo: PlotGeometry = { bandH: 0, plotTop: 0, plotW: 0, plotH: 0 };
  // Coordinate maps as stable functions declared ONCE (not re-created per frame).
  // They read the current geo/range from component scope, so no closures get
  // allocated in the hot draw loop — that per-frame alloc was starving the audio
  // rAF loop and thinning out the live trace.
  function midiToY(midi: number): number {
    return midiToYPx(midi, geo, rangeLo, rangeHi);
  }
  function timeToX(time: number): number {
    return timeToXPx(time, geo, GUTTER, firstVisibleTime, VISIBLE_SECONDS);
  }

  // leftmost time that still keeps the newest sample pinned to the right edge
  function maxFirst(): number {
    return Math.max(0, lastTime - VISIBLE_SECONDS);
  }

  // Ease (live) or snap (review) the vertical range toward the sung pitches.
  // Live uses confident visual samples; review uses the cleaned samples.
  function updateRange() {
    const isRecording = detectedNotes.length === 0;
    if (isRecording) {
      // live: read the running min/max (O(1)) instead of scanning history
      const midis =
        liveMinMidi <= liveMaxMidi ? [liveMinMidi, liveMaxMidi] : [];
      const target = computeTargetRange(
        midis,
        DEFAULT_LO,
        DEFAULT_HI,
        MIN_SPAN,
      );
      // smooth follow while singing, so the axis glides instead of jumping
      rangeLo += (target.lo - rangeLo) * 0.08;
      rangeHi += (target.hi - rangeHi) * 0.08;
    } else {
      // review runs once after "Done", not per-frame — scanning notes is fine
      const midis = detectedNotes.map((s) => Math.round(s.avgMidifloat));
      const target = computeTargetRange(
        midis,
        DEFAULT_LO,
        DEFAULT_HI,
        MIN_SPAN,
      );
      rangeLo = target.lo;
      rangeHi = target.hi;
    }
  }

  // ========================================================================
  //  DRAW — orchestrates the per-frame render out of small named steps
  // ========================================================================
  function draw() {
    if (!canvasEl) return;

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

    drawGutterAndGrid(ctx, w, h);
    drawTimeTicks(ctx, h);
    if (showBand) drawChordBand(ctx, w);
    drawOriginalNoteBars(ctx);
    drawNoteBars(ctx);
    drawTrace(ctx);
    drawEmptyStateHint(ctx);
    drawPlayhead(ctx, h);

    if (selectedNoteIndex >= 0) {
      const note = detectedNotes[selectedNoteIndex];
      const rawX2 = timeToX(note.endTime);
      const rawX1 = timeToX(note.startTime);

      // note has scrolled out of view — deselect, hide the pill
      if (rawX2 <= GUTTER || rawX1 >= w) {
        selectedNoteIndex = -1;
      } else {
        const half = controlsWidth / 2;
        controlsX =
          half > 0
            ? Math.min(
                Math.max(rawX1 + CONTROLS_X_OFFSET, GUTTER + half + 4),
                w - half - 4,
              )
            : rawX1 + CONTROLS_X_OFFSET;
        controlsY = midiToY(Math.round(note.avgMidifloat)) - 10;
        selectedNoteLabel = midiToName(Math.round(note.avgMidifloat));
      }
    }
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

  function drawOriginalNoteBars(ctx: CanvasRenderingContext2D) {
    const review = originalDetectedNotes.length > 0;
    ctx.lineCap = "round";
    ctx.lineWidth = NOTE_BAR_WIDTH;
    if (review) {
      // soft glow makes the "decided melody" read as the hero layer
      ctx.shadowColor = palette.accent;
      ctx.shadowBlur = 7;
    }
    for (let i = 0; i < originalDetectedNotes.length; i++) {
      const note = originalDetectedNotes[i];
      const rawX2 = timeToX(note.endTime);
      if (rawX2 <= GUTTER) continue; // fully scrolled off behind the axis
      const rawX1 = timeToX(note.startTime);
      const x1 = Math.max(rawX1, GUTTER + NOTE_BAR_WIDTH / 2);
      const y = midiToY(Math.round(note.avgMidifloat)); // snap to the grid

      ctx.shadowBlur = 7;
      ctx.shadowColor = palette.accent;
      ctx.strokeStyle = palette.accent;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(rawX2, y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
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
      const selected = i === selectedNoteIndex;

      ctx.shadowBlur = selected ? 20 : 7;
      ctx.shadowColor = selected ? palette.accent3 : palette.accent;
      ctx.strokeStyle = selected ? palette.accent3 : palette.accent;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(rawX2, y);
      ctx.stroke();

      if (selected) drawResizeHandles(ctx, rawX1, rawX2, y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
  }

  // small "<>" chevrons at the edges of the selected bar — the visual
  // affordance marking the drag-to-resize zones (± RESIZE_ZONE_WIDTH around
  // each edge). save()/restore() keeps this from disturbing the bar's own
  // lineWidth/shadow state for the rest of the draw loop.
  function drawResizeHandles(
    ctx: CanvasRenderingContext2D,
    x1: number,
    x2: number,
    y: number,
  ) {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = palette.accent3;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.9;

    if (x1 >= GUTTER) {
      ctx.beginPath();
      ctx.moveTo(x1 + 3, y - 5);
      ctx.lineTo(x1 - 3, y);
      ctx.lineTo(x1 + 3, y + 5);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(x2 - 3, y - 5);
    ctx.lineTo(x2 + 3, y);
    ctx.lineTo(x2 - 3, y + 5);
    ctx.stroke();

    ctx.restore();
  }

  // --- pitch trace: raw per-frame dots live, cleaned dots in review ---
  function drawTrace(ctx: CanvasRenderingContext2D) {
    const live = cleanedSamples.length === 0;
    const dots: { x: number; y: number; confident: boolean }[] = [];

    if (live) {
      // samples are time-ordered, so walk backwards from the newest and stop as
      // soon as one falls off the left edge — everything older is off-screen too.
      // Keeps the trace cost proportional to the visible window, not the whole take.
      for (let i = visualHistory.length - 1; i >= 0; i--) {
        const s = visualHistory[i];
        const x = timeToX(s.time);
        if (x <= GUTTER) break;
        if (!Number.isFinite(s.midi)) continue;
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

  function moveSelectedNote(d: number) {
    const note = detectedNotes[selectedNoteIndex];
    const newMidi = Math.round(note.avgMidifloat) + d;

    // local update for instant redraw
    note.avgMidifloat = newMidi;
    note.anchorMidifloat = newMidi;
    draw();

    // tell the parent so playback/analysis stay in sync
    onNoteEdited?.(selectedNoteIndex, newMidi);
  }

  // remove the selected note entirely — tells the parent so playableNotes,
  // playback and analysis all drop it too, then clears the selection
  function deleteSelectedNote() {
    if (selectedNoteIndex < 0) return;
    const removedIndex = selectedNoteIndex;
    detectedNotes = detectedNotes.filter((_, i) => i !== removedIndex);
    selectedNoteIndex = -1;
    draw();
    onNoteDeleted?.(removedIndex);
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
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const rect = canvasEl.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    if (playhead !== null) {
      return;
    }
    let hit = -1;
    for (let i = 0; i < detectedNotes.length; i++) {
      const note = detectedNotes[i];
      const x2 = timeToX(note.endTime);
      if (x2 < GUTTER) continue;
      if (isMouseInNoteBounds(note, mouseX, mouseY)) {
        hit = i;
        onNoteSelected?.(hit);
        break; // first bar under the cursor wins
      }
    }
    selectedNoteIndex = hit;
    draw();
  }
  function handleKeyDown(event: KeyboardEvent) {
    if (selectedNoteIndex >= 0) {
      if (event.key === "ArrowUp") {
        moveSelectedNote(1);
        event.preventDefault();
      } else if (event.key === "ArrowDown") {
        moveSelectedNote(-1);
        event.preventDefault();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelectedNote();
        event.preventDefault();
      } else if (event.key === "ArrowLeft") {
        if (noteResizing === null) {
          selectedNoteIndex = Math.max(0, selectedNoteIndex - 1);
          onNoteSelected?.(selectedNoteIndex);
          draw();
        }
      } else if (event.key === "ArrowRight") {
        if (noteResizing === null) {
          selectedNoteIndex = Math.min(
            detectedNotes.length - 1,
            selectedNoteIndex + 1,
          );
          onNoteSelected?.(selectedNoteIndex);
          draw();
        }
      }
    }
  }

  // is mouseX within the resize zone around a note edge? The zone shrinks
  // for very short notes so the start/end handles never overlap each other.
  function inResizeZone(
    mouseX: number,
    edgeX: number,
    x1: number,
    x2: number,
  ): boolean {
    const zone = Math.min(RESIZE_ZONE_WIDTH, (x2 - x1) / 2);
    return Math.abs(mouseX - edgeX) <= zone;
  }

  function handleMouseDown(event: MouseEvent) {
    if (selectedNoteIndex < 0) return;
    const note = detectedNotes[selectedNoteIndex];
    const rect = canvasEl.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const startX = timeToX(note.startTime);
    const endX = timeToX(note.endTime);
    const y = midiToY(Math.round(note.avgMidifloat));
    const withinY =
      mouseY >= y - NOTE_BAR_WIDTH / 2 - 4 &&
      mouseY <= y + NOTE_BAR_WIDTH / 2 + 4;
    if (!withinY) return;

    if (inResizeZone(mouseX, startX, startX, endX)) {
      startResize("start", selectedNoteIndex);
    } else if (inResizeZone(mouseX, endX, startX, endX)) {
      startResize("end", selectedNoteIndex);
    }
  }

  function startResize(edge: "start" | "end", noteIndex: number) {
    noteResizing = { edge, noteIndex };
    // window-level (not canvas-level) so the drag keeps tracking even if the
    // cursor leaves the canvas bounds mid-drag
    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", handleResizeUp);
  }

  // live preview while dragging — updates the note locally and redraws, but
  // does NOT call onNoteResized yet (that only fires once, on mouseup)
  function handleResizeMove(event: MouseEvent) {
    if (!noteResizing) return;
    const rect = canvasEl.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const newTime =
      firstVisibleTime + ((mouseX - GUTTER) / geo.plotW) * VISIBLE_SECONDS;
    const note = detectedNotes[noteResizing.noteIndex];

    if (noteResizing.edge === "start") {
      const previousNoteEndTime =
        noteResizing.noteIndex > 0
          ? detectedNotes[noteResizing.noteIndex - 1].endTime
          : -Infinity;
      const candidate = Math.max(
        0,
        previousNoteEndTime + 0.0001,
        Math.min(newTime, note.endTime - MIN_NOTE_SECONDS),
      );
      // final safety net: if the previous note leaves no room at all, don't
      // let startTime jump past endTime — clamp it back below the minimum length
      note.startTime = Math.min(candidate, note.endTime - MIN_NOTE_SECONDS);
    } else {
      const nextNoteStartTime =
        noteResizing.noteIndex + 1 < detectedNotes.length
          ? detectedNotes[noteResizing.noteIndex + 1].startTime
          : Infinity;
      const candidate = Math.min(
        Math.max(newTime, note.startTime + MIN_NOTE_SECONDS),
        nextNoteStartTime - 0.0001,
      );
      // same safety net on the other edge: don't let endTime jump before startTime
      note.endTime = Math.max(candidate, note.startTime + MIN_NOTE_SECONDS);
    }
    note.duration = note.endTime - note.startTime;
    draw();
  }

  // drag finished — this is the ONE place the parent hears about the resize
  function handleResizeUp() {
    if (!noteResizing) return;
    const { noteIndex } = noteResizing;
    const note = detectedNotes[noteIndex];
    window.removeEventListener("mousemove", handleResizeMove);
    window.removeEventListener("mouseup", handleResizeUp);
    noteResizing = null;
    suppressNextClick = true;
    onNoteResized?.(noteIndex, note.startTime, note.endTime);
  }

  // hover feedback (cursor only) when NOT dragging — shows the user where the
  // resize zones are before they click
  function handleCanvasHover(event: MouseEvent) {
    if (noteResizing) return; // actual dragging is handled by the window listeners
    if (selectedNoteIndex < 0) {
      canvasEl.style.cursor = "";
      return;
    }
    const note = detectedNotes[selectedNoteIndex];
    const rect = canvasEl.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const startX = timeToX(note.startTime);
    const endX = timeToX(note.endTime);
    const y = midiToY(Math.round(note.avgMidifloat));
    const withinY =
      mouseY >= y - NOTE_BAR_WIDTH / 2 - 4 &&
      mouseY <= y + NOTE_BAR_WIDTH / 2 + 4;
    const nearEdge =
      withinY &&
      (inResizeZone(mouseX, startX, startX, endX) ||
        inResizeZone(mouseX, endX, startX, endX));
    canvasEl.style.cursor = nearEdge ? "ew-resize" : "";
  }

  onMount(() => {
    palette = readPalette();
    draw(); // show the grid + hint before any recording starts
    // web fonts arrive async — redraw once loaded so canvas text uses them
    document.fonts?.ready.then(() => draw());
    // responsive: re-render crisply whenever the container resizes
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvasEl);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (controlsEl) {
      controlsWidth = controlsEl.offsetWidth;
      untrack(() => draw());
    }
  });

  // safety net: if the component is torn down mid-drag (e.g. "Start over"
  // clicked while resizing), don't leave orphaned window listeners behind
  onDestroy(() => {
    window.removeEventListener("mousemove", handleResizeMove);
    window.removeEventListener("mouseup", handleResizeUp);
  });

  function isMouseInNoteBounds(
    note: Note,
    mouseX: number,
    mouseY: number,
  ): boolean {
    const x_tolerance = 4;
    if (!note) return false;
    const x1 = timeToX(note.startTime);
    const x2 = timeToX(note.endTime);
    const y = midiToY(Math.round(note.avgMidifloat));
    return (
      mouseX >= x1 - x_tolerance &&
      mouseX <= x2 + x_tolerance &&
      mouseY >= y - NOTE_BAR_WIDTH / 2 &&
      mouseY <= y + NOTE_BAR_WIDTH / 2
    );
  }

  // ======================= public API for the parent =======================

  // store a raw sample; drawing is driven by tick(), not here
  export function push(time: number, midi: number, confident: boolean) {
    visualHistory.push({ time, midi, confident });
    // keep the running range current so updateRange stays O(1)
    if (confident && Number.isFinite(midi)) {
      if (midi < liveMinMidi) liveMinMidi = midi;
      if (midi > liveMaxMidi) liveMaxMidi = midi;
    }
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
    originalDetectedNotes = [];
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
    liveMinMidi = Infinity;
    liveMaxMidi = -Infinity;
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
    originalDetectedNotes = _notes.map((n) => ({ ...n }));
    chordSegments = _chordSegments;
    cleanedSamples = _cleanedSamples.filter((s) => Number.isFinite(s.midi));
    keyMode = _keyInfo?.mode ?? null;
    const view = scrollerEl.clientWidth || 1;
    spacerWidth = view * Math.max(1, lastTime / VISIBLE_SECONDS);
    await domTick(); // wait for the spacer to actually widen…
    scrollerEl.scrollLeft = scrollerEl.scrollWidth; // …then pin the thumb right (triggers onScroll → redraw)
    draw();
  }
  export function refreshAfterEdit(
    _chordSegments: ChordSegment[],
    _keyInfo?: KeyInfo | null,
  ) {
    chordSegments = _chordSegments;
    keyMode = _keyInfo?.mode ?? null;
    draw();
  }

  export function setPlayhead(t: number | null) {
    playhead = t;
    if (playhead !== null) {
      selectedNoteIndex = -1;
      const cursorPosition = VISIBLE_SECONDS * CURSOR_POSITION_RATIO;
      const desired = playhead > cursorPosition ? playhead - cursorPosition : 0;
      firstVisibleTime = Math.min(desired, maxFirst()); // clamp at the end
    }
    draw();
  }

  let {
    onNoteEdited,
    onNoteDeleted,
    onNoteResized,
    onNoteSelected,
  }: {
    onNoteEdited?: (index: number, newMidi: number) => void;
    onNoteDeleted?: (index: number) => void;
    onNoteResized?: (
      index: number,
      newStartTime: number,
      newEndTime: number,
    ) => void;
    onNoteSelected?: (index: number) => void;
  } = $props();
</script>

<div class="trace-wrap">
  <canvas
    tabindex="0"
    class="trace"
    bind:this={canvasEl}
    onclick={handleClick}
    onmousedown={handleMouseDown}
    onmousemove={handleCanvasHover}
    onkeydown={handleKeyDown}
    aria-label="Live trace"
  ></canvas>
  {#if selectedNoteIndex >= 0}
    <div
      class="note-controls"
      style:left="{controlsX}px"
      style:top="{controlsY}px"
      bind:this={controlsEl}
    >
      <span class="note-controls__label">{selectedNoteLabel}</span>
      <div class="note-controls__divider" aria-hidden="true"></div>
      <button
        class="note-controls__btn"
        onclick={() => moveSelectedNote(1)}
        aria-label="Shift tone up"
      >
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <path d="M6 2.5 L10 8.5 L2 8.5 Z" fill="currentColor" />
        </svg>
      </button>
      <button
        class="note-controls__btn"
        onclick={() => moveSelectedNote(-1)}
        aria-label="Shift tone down"
      >
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <path d="M6 9.5 L2 3.5 L10 3.5 Z" fill="currentColor" />
        </svg>
      </button>
      <div class="note-controls__divider" aria-hidden="true"></div>
      <button
        class="note-controls__btn note-controls__btn--danger"
        onclick={deleteSelectedNote}
        aria-label="Delete tone"
      >
        <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
          <path
            d="M3 4h8M5.5 4V2.8c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7V4M4 4l.5 8.2c0 .4.4.8.8.8h3.4c.4 0 .8-.4.8-.8L10 4"
            stroke="currentColor"
            stroke-width="1.1"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  {/if}
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
  .trace:focus {
    outline: 2px solid var(--accent-3);
  }
  .trace:focus:not(:focus-visible) {
    outline: none;
  }

  /* floating note-edit pill — positioned above the selected bar via
   controlsX/controlsY (recomputed in draw()), so it rides along with
   scroll, resize, and note edits automatically. Horizontal so it stays
   compact and doesn't cover much of the trace beneath it. */
  .note-controls {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 4px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    box-shadow: 0 10px 24px -8px rgba(0, 0, 0, 0.55);
    transform: translate(-50%, -100%); /* center on X, sit fully above Y */
    z-index: 5;
    animation: note-pill-in 0.14s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes note-pill-in {
    from {
      opacity: 0;
      transform: translate(-50%, -100%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%) scale(1);
    }
  }

  .note-controls__label {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 12px;
    color: var(--accent-3);
    padding: 0 8px;
    min-width: 1.6em;
    text-align: center;
    line-height: 24px;
    user-select: none;
  }

  .note-controls__divider {
    width: 1px;
    height: 16px;
    background: var(--line);
    flex: none;
  }

  .note-controls__btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease,
      transform 0.08s ease;
  }

  .note-controls__btn:hover {
    background: var(--raised);
    color: var(--accent);
  }

  .note-controls__btn:active {
    transform: scale(0.88);
  }

  .note-controls__btn:focus-visible {
    outline: 2px solid var(--accent-3);
    outline-offset: 1px;
  }

  .note-controls__btn--danger:hover {
    background: color-mix(in srgb, var(--accent-2) 16%, transparent);
    color: var(--accent-2);
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

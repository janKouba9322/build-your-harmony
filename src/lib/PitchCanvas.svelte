<script lang="ts">
  // Live pitch-trace canvas. Owns its own drawing, history and range.
  // The parent feeds samples via the exported push()/clear() methods.
  import { midiToName } from "./musicTheory";

  type Sample = { midi: number; confident: boolean };

  const history: Sample[] = [];
  const MAX_SAMPLES = 400;

  // visible vertical range in semitones (MIDI), eases to fit what's sung
  const DEFAULT_LO = 48; // C3
  const DEFAULT_HI = 72; // C5
  const MIN_SPAN = 14;
  let rangeLo = DEFAULT_LO;
  let rangeHi = DEFAULT_HI;

  let canvasEl: HTMLCanvasElement;

  // colors pulled from the design tokens (canvas can't read CSS variables directly)
  let palette: {
    accent: string;
    uncertain: string;
    line: string;
    muted: string;
  } | null = null;
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    palette = {
      accent: cs.getPropertyValue("--accent").trim(),
      uncertain: cs.getPropertyValue("--uncertain").trim(),
      line: "rgba(255,255,255,0.07)",
      muted: cs.getPropertyValue("--muted").trim(),
    };
  }

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

    const GUTTER = 40; // left axis with labels
    const padY = 10;
    const plotW = w - GUTTER;
    const plotH = h - padY * 2;

    const midiToY = (m: number) =>
      padY + plotH - ((m - rangeLo) / (rangeHi - rangeLo)) * plotH;

    // horizontal gridlines + note labels (range axis on the left)
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

    // pitch trace
    for (let i = 0; i < history.length; i++) {
      const s = history[i];
      if (!Number.isFinite(s.midi)) continue;
      const x = GUTTER + (i / MAX_SAMPLES) * plotW;
      const y = midiToY(s.midi);
      ctx.beginPath();
      ctx.arc(x, y, s.confident ? 2.6 : 1.5, 0, Math.PI * 2);
      ctx.fillStyle = s.confident ? palette.accent : palette.uncertain;
      ctx.globalAlpha = s.confident ? 1 : 0.6;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- public API for the parent ---
  export function push(midi: number, confident: boolean) {
    history.push({ midi, confident });
    if (history.length > MAX_SAMPLES) history.shift();
    draw();
  }
  export function clear() {
    history.length = 0;
    rangeLo = DEFAULT_LO;
    rangeHi = DEFAULT_HI;
    draw();
  }
</script>

<canvas class="trace" bind:this={canvasEl} aria-label="Živá stopa výšky hlasu"
></canvas>

<style>
  .trace {
    width: 100%;
    height: 150px;
    display: block;
    border-radius: 12px;
    background: var(--bg);
  }
</style>

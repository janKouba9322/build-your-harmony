// Pure helpers for PitchCanvas. Nothing here touches component state or the
// DOM beyond the palette read — each function takes what it needs as arguments
// and returns a value, so they're easy to reason about and test in isolation.
// The stateful drawing (which reads all of these) stays in the component.

import type { Sample } from "./types";

// --- palette -------------------------------------------------------------

// Colors used by the canvas, resolved from the CSS design tokens. Canvases
// can't read CSS variables natively, so we snapshot them into plain strings.
export type CanvasPalette = {
  accent: string;
  accent2: string;
  accent3: string;
  uncertain: string;
  muted: string;
  text: string;
  line: string;
  raised: string;
};

// Read the current token values off :root. Called on mount
export function readPalette(): CanvasPalette {
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string) => cs.getPropertyValue(name).trim();
  return {
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

// --- geometry ------------------------------------------------------------

// The plot's pixel layout for a given canvas size. Recomputed every draw
// because it depends on the (responsive) canvas dimensions and on whether
// the chord band is currently shown.
export type PlotGeometry = {
  bandH: number; // height reserved for the chord band (0 when hidden)
  plotTop: number; // y where the pitch plot begins
  plotW: number; // plot width (canvas minus the left gutter)
  plotH: number; // plot height
};

export function computeGeometry(
  canvasW: number,
  canvasH: number,
  gutter: number,
  padTop: number,
  padBottom: number,
  chordBandH: number,
  showBand: boolean,
): PlotGeometry {
  const bandH = showBand ? chordBandH : 0;
  const plotTop = bandH + padTop;
  const plotW = canvasW - gutter;
  const plotH = canvasH - plotTop - padBottom;
  return { bandH, plotTop, plotW, plotH };
}

// Map a MIDI pitch to a y pixel within the plot (higher pitch = higher up).
// Takes everything as plain args so it can be called directly in the hot loop
// without allocating a closure every frame.
export function midiToYPx(
  midi: number,
  geo: PlotGeometry,
  rangeLo: number,
  rangeHi: number,
): number {
  return (
    geo.plotTop +
    geo.plotH -
    ((midi - rangeLo) / (rangeHi - rangeLo)) * geo.plotH
  );
}

// Map a time (seconds) to an x pixel, given the current horizontal viewport.
export function timeToXPx(
  time: number,
  geo: PlotGeometry,
  gutter: number,
  firstVisibleTime: number,
  visibleSeconds: number,
): number {
  return gutter + ((time - firstVisibleTime) / visibleSeconds) * geo.plotW;
}

// --- vertical range ------------------------------------------------------

export type Range = { lo: number; hi: number };

// Pick the target vertical range so the sung pitches sit comfortably inside
// the plot, with a little padding and a minimum span so a single flat note
// doesn't fill the whole height.
export function computeTargetRange(
  midis: number[],
  defaultLo: number,
  defaultHi: number,
  minSpan: number,
): Range {
  if (midis.length === 0) return { lo: defaultLo, hi: defaultHi };
  let lo = Math.min(...midis) - 3;
  let hi = Math.max(...midis) + 3;
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  return { lo, hi };
}
// --- shapes --------------------------------------------------------------

// Trace a rounded rectangle path (kept explicit for older canvas engines that
// lack roundRect, and so the radius is always clamped to sane bounds).
export function roundRectPath(
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

import { T_MAJOR, T_MINOR } from "./constants";
import type { KeyInfo, KeyMode, Note } from "./types";

// --- public pipeline: straighten → buildChroma → detectKey ---

// Correct for consistent detuning by shifting every note by one shared offset
// (median deviation from the semitone grid).
// pitch so callers can still see how close each note sat to the grid.
export function snapNotesToGrid(notes: Note[]): Note[] {
  const offset = findTuningOffset(notes);
  return notes.map((n) => ({
    ...n,
    avgMidifloat: Math.round(n.avgMidifloat - offset),
  }));
}

// Weighted pitch-class histogram
export function buildChroma(snappedNotes: Note[]): number[] {
  const chroma = new Array(12).fill(0);
  for (const note of snappedNotes) {
    const pitchClass = ((note.avgMidifloat % 12) + 12) % 12;
    chroma[pitchClass] += note.duration * note.avgClarity;
  }
  return chroma;
}

// Correlate the chroma against all 24 rotated Temperley profiles,
// pick the best. Confidence is the (rough) margin over the runner-up.
export function detectKey(chroma: number[]): KeyInfo {
  let best = { score: -2, tonic: 0, mode: "major" as KeyMode };
  let second = -2;

  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, prof] of [
      ["major", T_MAJOR],
      ["minor", T_MINOR],
    ] as const) {
      const rotated = prof.map((_, i) => prof[(i - tonic + 12) % 12]);
      const score = correlate(chroma, rotated);
      if (score > best.score) {
        second = best.score;
        best = { score, tonic, mode };
      } else if (score > second) {
        second = score;
      }
    }
  }

  const confidence = Math.max(0, Math.min(1, (best.score - second) * 2.2));
  return { ...best, confidence };
}

// --- internal helpers (pure) ---

function correlate(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma,
      y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

function offsetFromGrid(midifloat: number): number {
  return midifloat - Math.round(midifloat);
}

function findTuningOffset(notes: Note[]): number {
  const offsets = notes.map((n) => offsetFromGrid(n.avgMidifloat));
  return median(offsets);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

import { NOTES } from "./constans";
import type { ChordSegment, KeyMode } from "./types";

export function freqToNote(freq: number) {
  const midiFloat: number = 69 + 12 * Math.log2(freq / 440);
  const midi: number = Math.round(midiFloat);

  const name: string = NOTES[((midi % 12) + 12) % 12];
  const octave: number = Math.floor(midi / 12) - 1;
  const cents: number = Math.round((midiFloat - midi) * 100);

  return { name, octave, cents };
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToName(midi: number): string {
  const n = Math.round(midi);
  return NOTES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
}

// pitch class (0–11) → note name, no octave (Czech H for B natural)
export function pitchClassName(pc: number): string {
  return NOTES[((pc % 12) + 12) % 12];
}

// --- presentation helpers shared by AnalysisCard and PitchCanvas ---

// roman numerals per scale degree; casing encodes chord quality within the key
const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

export function degreeNumeral(degree: number, mode: KeyMode): string {
  const table = mode === "major" ? MAJOR_NUMERALS : MINOR_NUMERALS;
  return table[degree - 1] ?? "?";
}

// chord display name = root pitch-class name + quality suffix
// (quality is read from the numeral casing, so it stays consistent)
export function chordLabel(
  chord: { degree: number; pitchClasses: number[] },
  mode: KeyMode,
): string {
  const root = pitchClassName(chord.pitchClasses[0]);
  const num = degreeNumeral(chord.degree, mode);
  const isDim = num.includes("°");
  const isMinor = !isDim && num === num.toLowerCase();
  return isDim ? `${root}dim` : isMinor ? `${root}m` : root;
}

// "C dur" / "a moll" — Czech key label from tonic pitch class + mode
export function keyLabel(tonic: number, mode: KeyMode): string {
  return `${pitchClassName(tonic)} ${mode}`;
}

// a segment counts as uncertain when the runner-up chord scored almost
// as well as the winner — honest-about-uncertainty threshold
export function chordUncertain(seg: ChordSegment): boolean {
  const c = seg.candidates;
  if (c.length < 2) return false;
  return c[0].score - c[1].score < 0.15 && c[1].score > 0.4;
}

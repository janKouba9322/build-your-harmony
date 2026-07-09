export interface Tone {
  note: string;
  octave: number;
  cents: string;
  step: string;
  uncertain: boolean;
}

export type Note = {
  duration: number; // seconds, endTime - startTime
  sampleCount: number; // number of samples that landed in this note
  avgClarity: number;
  avgMidifloat: number;
  anchorMidifloat: number;
  startTime: number; // seconds since recording start
  endTime: number; // seconds since recording start
};

export type ChordSegment = {
  startTime: number;
  endTime: number;
  candidates: ChordCandidate[]; // ranked, [0] is the winner
};

export type ChordCandidate = {
  degree: number; // scale degree 1–7 (I, ii, iii…) — relative to the key
  pitchClasses: number[]; // concrete chord tones, e.g. {0,4,7}
  score: number; // normalized 0–1
};

export type Chord = {
  degree: number;
  pitchClasses: number[];
};

export type KeyInfo = {
  score: number;
  tonic: number;
  mode: KeyMode;
  confidence: number;
};

export type KeyMode = "major" | "minor";

export type Sample = {
  midi: number;
  time: number;
  clarity: number;
};

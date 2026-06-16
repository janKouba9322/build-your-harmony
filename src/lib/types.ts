export interface Tone {
  note: string;
  octave: number;
  cents: string;
  step: string;
  uncertain: boolean;
}

export type Note = {
  duration: number; // seconds, endTime - startTime
  frameLength: number; // number of samples that landed in this note
  avgClarity: number;
  avgMidifloat: number;
  anchorMidifloat: number;
  startTime: number; // seconds since recording start
  endTime: number; // seconds since recording start
};

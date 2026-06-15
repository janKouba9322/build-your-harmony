export interface Tone {
  note: string;
  octave: number;
  cents: string;
  step: string;
  uncertain: boolean;
}
export type Note = {
  sampleCount: number;
  avgClarity: number;
  avgMidifloat: number;
  anchorMidifloat: number;
  startFrame: number;
  endFrame: number;
};


import type { Tone } from "./types";
 

export const sampleTones: Tone[] = [
  { note: "G", octave: 4, cents: "+6",  step: "+2", uncertain: false },
  { note: "A", octave: 4, cents: "−4",  step: "+2", uncertain: false },
  { note: "H", octave: 4, cents: "+11", step: "−2", uncertain: false },
  { note: "A", octave: 4, cents: "+2",  step: "−2", uncertain: true  },
  { note: "G", octave: 4, cents: "−8",  step: "−3", uncertain: false },
  { note: "E", octave: 4, cents: "+5",  step: "",   uncertain: false },
];

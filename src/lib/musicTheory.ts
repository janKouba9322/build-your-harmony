import { NOTES } from "./constans";
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

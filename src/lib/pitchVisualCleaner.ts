const OCTAVE_CLEAN_WINDOW_SIZE = 10;
const SMOOTHING_WINDOW_SIZE = 7;
const RESET_GAP_DURATION = 0.2;

const OCTAVE = 12;
const TOL = 1;
type SampleWithoutClarity = { midi: number; time: number };
export class PitchVisualCleaner {
  private octaveWindow: SampleWithoutClarity[] = [];
  private smoothingWindow: SampleWithoutClarity[] = [];
  feed(midi: number, time: number): number {
    const octaveCleanedMidi = this.cleanOctaves({ time, midi });
    const smoothedMidi = this.smoothMidi(octaveCleanedMidi, time);

    return smoothedMidi;
  }
  private cleanOctaves({ time, midi }: SampleWithoutClarity) {
    if (this.octaveWindow.length === 0) {
      this.addSample(this.octaveWindow, OCTAVE_CLEAN_WINDOW_SIZE, {
        midi,
        time,
      });
      return midi;
    }
    const prev = this.octaveWindow[this.octaveWindow.length - 1];
    if (time - prev.time > RESET_GAP_DURATION) {
      this.octaveWindow = [];
      this.smoothingWindow = [];
      return midi;
    }
    const octaveMedian = this.sampleMedian(this.octaveWindow);
    let finalMidi = midi;
    while (finalMidi - octaveMedian > OCTAVE - TOL) finalMidi -= OCTAVE;
    while (octaveMedian - finalMidi > OCTAVE - TOL) finalMidi += OCTAVE;
    this.addSample(this.octaveWindow, OCTAVE_CLEAN_WINDOW_SIZE, {
      midi: finalMidi,
      time,
    });
    return finalMidi;
  }
  private smoothMidi(midi: number, time: number) {
    this.addSample(this.smoothingWindow, SMOOTHING_WINDOW_SIZE, { midi, time });
    return this.sampleMedian(this.smoothingWindow);
  }
  private addSample(
    window: SampleWithoutClarity[],
    SIZE: number,
    sample: SampleWithoutClarity,
  ) {
    window.push(sample);
    if (window.length > SIZE) {
      window.shift();
    }
  }
  private sampleMedian(samples: SampleWithoutClarity[]) {
    const sorted = [...samples.map((n) => n.midi)].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
  reset() {
    this.octaveWindow = [];
    this.smoothingWindow = [];
  }
}

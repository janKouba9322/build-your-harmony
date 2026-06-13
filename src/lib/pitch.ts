import { PitchDetector } from "pitchy";

export class PitchTracker {
  private detector: PitchDetector<Float32Array>;
  readonly inputLength: number;

  constructor(fftSize: number) {
    this.detector = PitchDetector.forFloat32Array(fftSize);
    this.inputLength = this.detector.inputLength;
  }

  detect(
    buffer: Float32Array,
    sampleRate: number,
  ): { pitch: number; clarity: number } {
    const [pitch, clarity] = this.detector.findPitch(buffer, sampleRate);
    return { pitch, clarity };
  }
}

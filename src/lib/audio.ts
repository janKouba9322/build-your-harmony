import { PitchTracker } from "./pitch";

async function getMicAccess(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error("Není povolen mikrofon:", err);
    return null;
  }
}

export type PitchCallback = (
  freq: number,
  clarity: number,
  currentTime: number,
) => void;

export class RecordHandler {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private tracker: PitchTracker | null = null;
  private recordStartTime: number | null = null;

  async startRecording(onPitch: PitchCallback): Promise<void> {
    const stream = await getMicAccess();
    if (stream === null) return;

    this.stream = stream;
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.recordStartTime = this.ctx.currentTime;
    source.connect(this.analyser);

    this.tracker = new PitchTracker(this.analyser.fftSize);
    const buffer = new Float32Array(this.tracker.inputLength);
    const sampleRate = this.ctx.sampleRate;

    const loop = (): void => {
      this.analyser!.getFloatTimeDomainData(buffer);
      const { pitch, clarity } = this.tracker!.detect(buffer, sampleRate);
      const currentTimeInRecording =
        this.ctx!.currentTime - this.recordStartTime!;
      onPitch(pitch, clarity, currentTimeInRecording);
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  stopRecording(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.rafId = null;
    this.stream = null;
    this.analyser = null;
    this.ctx = null;
    this.tracker = null;
    this.recordStartTime = null;
  }
}

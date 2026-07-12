import * as Tone from "tone";
import type { Note } from "./types";
import { midiToFreq } from "./musicTheory";

export class TonePlayer {
  private synth = new Tone.Synth().toDestination();
  private transport = Tone.getTransport();
  async play(notes: Note[]) {
    if (notes.length === 0) return;
    await Tone.start();
    this.stop();

    const lastEnd = notes[notes.length - 1].endTime;
    this.transport.schedule((time) => {
      this.transport.stop(time);
    }, lastEnd + 0.1);
    for (const note of notes) {
      const freq = midiToFreq(note.avgMidifloat);
      const at = note.startTime;
      this.transport.schedule((time) => {
        this.synth.triggerAttackRelease(freq, note.duration, time);
      }, at);
    }

    this.transport.start();
  }
  stop() {
    this.transport.stop();
    this.transport.position = 0;
    this.transport.cancel();
  }
  playbackTime(): number | null {
    return this.transport.state === "started" ? this.transport.seconds : null;
  }
  async previewNote(midi: number, duration = 0.15) {
    await Tone.start();
    const freq = midiToFreq(midi);
    this.synth.triggerAttackRelease(freq, duration);
  }
}

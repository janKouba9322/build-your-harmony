import type { Note } from "./types";

const MIDI_THRESHOLD = 0.85; // how close a pitch must be (semitones) to count as the same note
const ANCHOR_LOCK_FRAME_LENGTH = 15; // after this many frames the anchor pitch freezes (resists slow drift)
const MIN_NOTE_DURATION = 0.06; // notes shorter than this (seconds) are discarded as blips
const MAX_GAP_DURATION = 0.1; // a return within this gap (seconds) re-joins the previous note
const MIN_NOTE_FRAME_LENGTH = 8; // a real note needs at least this many actual samples

function emptyNote(): Note {
  return {
    duration: 0,
    frameLength: 0,
    avgClarity: 0,
    avgMidifloat: 0,
    anchorMidifloat: 0,
    startTime: 0,
    endTime: 0,
  };
}

export class Segmenter {
  public notes: Note[] = [];
  private currentNote: Note = emptyNote();
  private weightedSum = 0;
  private totalWeight = 0;

  add(time: number, clarity: number, midifloat: number) {
    const isEmpty = this.currentNote.frameLength === 0;

    // does this sample continue the note currently being built?
    const fits =
      !isEmpty &&
      Math.abs(midifloat - this.currentNote.anchorMidifloat) < MIDI_THRESHOLD;

    // or does it return to the previous note after a short dropout?
    const prev = this.notes[this.notes.length - 1];
    const fitsPrev =
      prev !== undefined &&
      time - prev.endTime <= MAX_GAP_DURATION &&
      Math.abs(midifloat - prev.anchorMidifloat) < MIDI_THRESHOLD;

    if (fits) {
      this.extendNote(time, clarity, midifloat);
    } else if (fitsPrev) {
      // pull the previous note back out and keep extending it across the gap
      this.currentNote = this.notes.pop()!;
      this.extendNote(time, clarity, midifloat);
    } else if (isEmpty) {
      this.startNote(time, clarity, midifloat);
    } else {
      // pitch jumped: close what we had and open a fresh note
      this.closeNote();
      this.startNote(time, clarity, midifloat);
    }
  }

  finish(): Note[] {
    this.closeNote();
    return this.notes;
  }

  reset() {
    this.notes = [];
    this.currentNote = emptyNote();
  }

  private startNote(time: number, clarity: number, midifloat: number) {
    this.totalWeight = clarity;
    this.weightedSum = clarity * midifloat;
    this.currentNote = {
      duration: 0,
      frameLength: 1,
      avgClarity: clarity,
      avgMidifloat: midifloat,
      anchorMidifloat: midifloat,
      startTime: time,
      endTime: time,
    };
  }

  private extendNote(time: number, clarity: number, midifloat: number) {
    const prev = this.currentNote.frameLength;
    const n = prev + 1;
    this.currentNote.frameLength = n;
    this.currentNote.endTime = time;
    this.currentNote.duration = time - this.currentNote.startTime;

    this.weightedSum += clarity * midifloat;
    this.totalWeight += clarity;

    // running averages over the whole note
    this.currentNote.avgClarity =
      (this.currentNote.avgClarity * prev + clarity) / n;
    this.currentNote.avgMidifloat = this.weightedSum / this.totalWeight;

    // the anchor only averages the first few frames, then locks
    if (n <= ANCHOR_LOCK_FRAME_LENGTH) {
      this.currentNote.anchorMidifloat = this.weightedSum / this.totalWeight;
    }
  }

  // endTime/duration are already correct from the last extendNote (the last
  // sample that belonged to this note) — don't overwrite them with the closing
  // sample's time, or silence between notes gets glued onto the end.
  private closeNote() {
    const longEnough = this.currentNote.duration >= MIN_NOTE_DURATION;
    const denseEnough = this.currentNote.frameLength >= MIN_NOTE_FRAME_LENGTH;
    this.weightedSum = 0;
    this.totalWeight = 0;
    if (longEnough && denseEnough) {
      this.notes.push({ ...this.currentNote });
    }
    this.currentNote = emptyNote();
  }
}

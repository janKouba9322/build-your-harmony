import type { Note } from "./types";

const MIDI_THRESHOLD = 0.5;
const ANCHOR_LOCK_LENGTH = 4;
const MIN_NOTE_SAMPLE_COUNT = 12;
const MAX_GAP_LENGTH = 5;

function emptyNote(): Note {
  return {
    sampleCount: 0,
    avgClarity: 0,
    avgMidifloat: 0,
    anchorMidifloat: 0,
    startFrame: 0,
    endFrame: 0,
  };
}

export class Segmenter {
  public notes: Note[] = [];
  private currentNote: Note = emptyNote();
  private gapLength = MAX_GAP_LENGTH + 1;

  add(frame: number, clarity: number, midifloat: number) {
    const isEmpty = this.currentNote.sampleCount === 0;
    const fits =
      !isEmpty &&
      Math.abs(midifloat - this.currentNote.anchorMidifloat) < MIDI_THRESHOLD;

    const prev = this.notes[this.notes.length - 1];
    const fitsPrev =
      this.gapLength <= MAX_GAP_LENGTH &&
      prev !== undefined &&
      Math.abs(midifloat - prev.anchorMidifloat) < MIDI_THRESHOLD;

    if (fits) {
      this.extendNote(clarity, midifloat);
    } else if (fitsPrev) {
      console.log("prev");
      this.currentNote = this.notes.pop()!;
      this.extendNote(clarity, midifloat);
    } else if (isEmpty) {
      this.startNote(frame, clarity, midifloat);
    } else {
      this.closeNote(frame);
      this.startGap();
      this.startNote(frame, clarity, midifloat);
    }

    this.gapLength += 1;
  }

  private closeNote(frame: number) {
    this.currentNote.endFrame = frame;
    if (this.currentNote.sampleCount >= MIN_NOTE_SAMPLE_COUNT) {
      this.notes.push({
        sampleCount: this.currentNote.sampleCount,
        avgClarity: this.currentNote.avgClarity,
        avgMidifloat: this.currentNote.avgMidifloat,
        anchorMidifloat: this.currentNote.anchorMidifloat,
        startFrame: this.currentNote.startFrame,
        endFrame: this.currentNote.endFrame,
      });
    }
    this.currentNote = emptyNote();
  }
  private startNote(frame: number, clarity: number, midifloat: number) {
    this.currentNote = {
      sampleCount: 1,
      avgClarity: clarity,
      avgMidifloat: midifloat,
      anchorMidifloat: midifloat,
      startFrame: frame,
      endFrame: frame,
    };
  }

  private extendNote(clarity: number, midifloat: number) {
    const prev = this.currentNote.sampleCount;
    this.currentNote.sampleCount += 1;
    const n = this.currentNote.sampleCount;

    this.currentNote.avgClarity =
      (this.currentNote.avgClarity * prev + clarity) / n;
    this.currentNote.avgMidifloat =
      (this.currentNote.avgMidifloat * prev + midifloat) / n;
    if (n <= ANCHOR_LOCK_LENGTH) {
      this.currentNote.anchorMidifloat =
        (this.currentNote.anchorMidifloat * prev + midifloat) / n;
    }
  }

  private startGap() {
    this.gapLength = 1;
  }

  finish(frame: number): Note[] {
    this.closeNote(frame);
    return this.notes;
  }

  reset() {
    this.notes = [];
    this.currentNote = emptyNote();
  }
}

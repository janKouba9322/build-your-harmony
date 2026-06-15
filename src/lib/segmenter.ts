import type { Note } from "./types";

// All thresholds are in *samples* (rAF frames), not milliseconds — see project TODO.
const MIDI_THRESHOLD = 0.5; // how close a pitch must be to count as the same note
const ANCHOR_LOCK_LENGTH = 4; // after this many samples the anchor pitch is frozen
const MIN_NOTE_SAMPLE_COUNT = 12; // shorter blips get discarded
const MAX_GAP_LENGTH = 5; // a return within this many samples re-joins the previous note

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

    // does this sample continue the note currently being built?
    const fits =
      !isEmpty &&
      Math.abs(midifloat - this.currentNote.anchorMidifloat) < MIDI_THRESHOLD;

    // or does it return to the previous note after a short dropout?
    const prev = this.notes[this.notes.length - 1];
    const fitsPrev =
      this.gapLength <= MAX_GAP_LENGTH &&
      prev !== undefined &&
      Math.abs(midifloat - prev.anchorMidifloat) < MIDI_THRESHOLD;

    if (fits) {
      this.extendNote(clarity, midifloat);
    } else if (fitsPrev) {
      // pull the previous note back out and keep extending it across the gap
      this.currentNote = this.notes.pop()!;
      this.extendNote(clarity, midifloat);
    } else if (isEmpty) {
      this.startNote(frame, clarity, midifloat);
    } else {
      // pitch jumped: close what we had and open a fresh note
      this.closeNote(frame);
      this.startGap();
      this.startNote(frame, clarity, midifloat);
    }

    this.gapLength += 1;
  }

  finish(frame: number): Note[] {
    this.closeNote(frame);
    return this.notes;
  }

  reset() {
    this.notes = [];
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
    const n = prev + 1;
    this.currentNote.sampleCount = n;

    // running averages over the whole note
    this.currentNote.avgClarity =
      (this.currentNote.avgClarity * prev + clarity) / n;
    this.currentNote.avgMidifloat =
      (this.currentNote.avgMidifloat * prev + midifloat) / n;

    // the anchor only averages the first few samples, then locks (resists slow drift)
    if (n <= ANCHOR_LOCK_LENGTH) {
      this.currentNote.anchorMidifloat =
        (this.currentNote.anchorMidifloat * prev + midifloat) / n;
    }
  }

  private closeNote(frame: number) {
    this.currentNote.endFrame = frame;
    if (this.currentNote.sampleCount >= MIN_NOTE_SAMPLE_COUNT) {
      this.notes.push({ ...this.currentNote }); // copy; currentNote is reset right after
    }
    this.currentNote = emptyNote();
  }

  private startGap() {
    this.gapLength = 1;
  }
}

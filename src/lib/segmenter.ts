type Note = {
  sampleCount: number;
  avgClarity: number;
  avgMidifloat: number;
  anchorMidifloat: number;
};

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
  };
}

export class Segmenter {
  public notes: Note[] = [];
  private currentNote: Note = emptyNote();
  private gapLength = MAX_GAP_LENGTH + 1;

  add(clarity: number, midifloat: number) {
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
      this.startNote(clarity, midifloat);
    } else {
      this.closeNote();
      this.startGap();
      this.startNote(clarity, midifloat);
    }

    this.gapLength += 1;
  }

  private closeNote() {
    if (this.currentNote.sampleCount >= MIN_NOTE_SAMPLE_COUNT) {
      this.notes.push({
        sampleCount: this.currentNote.sampleCount,
        avgClarity: this.currentNote.avgClarity,
        avgMidifloat: this.currentNote.avgMidifloat,
        anchorMidifloat: this.currentNote.anchorMidifloat,
      });
    }
    this.currentNote = emptyNote();
  }
  private startNote(clarity: number, midifloat: number) {
    this.currentNote = {
      sampleCount: 1,
      avgClarity: clarity,
      avgMidifloat: midifloat,
      anchorMidifloat: midifloat,
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

  finish(): Note[] {
    this.closeNote();
    return this.notes;
  }

  reset() {
    this.notes = [];
    this.currentNote = emptyNote();
  }
}

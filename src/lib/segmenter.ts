import type { Note, Sample } from "./types";

const MIDI_THRESHOLD = 1; // how close a pitch must be (semitones) to count as the same note
const ANCHOR_LOCK_SAMPLE_COUNT = 15; // after this many frames the anchor pitch freezes (resists slow drift)
const MIN_NOTE_DURATION = 0.08; // notes shorter than this (seconds) are discarded as blips
const MAX_GAP_DURATION = 0.1; // a return within this gap (seconds) re-joins the previous note
const MIN_NOTE_SAMPLE_COUNT = 8; // a real note needs at least this many actual samples

function emptyNote(): Note {
  return {
    duration: 0,
    sampleCount: 0,
    avgClarity: 0,
    avgMidifloat: 0,
    anchorMidifloat: 0,
    startTime: 0,
    endTime: 0,
  };
}

export class Segmenter {
  analyse(samples: Sample[]): Note[] {
    const notes: Note[] = [];
    let currentNote: Note = emptyNote();
    let weightedSum = 0;
    let totalWeight = 0;

    function startNote(time: number, clarity: number, midi: number) {
      totalWeight = clarity;
      weightedSum = clarity * midi;
      currentNote = {
        duration: 0,
        sampleCount: 1,
        avgClarity: clarity,
        avgMidifloat: midi,
        anchorMidifloat: midi,
        startTime: time,
        endTime: time,
      };
    }

    function extendNote(time: number, clarity: number, midi: number) {
      const prev = currentNote.sampleCount;
      const n = prev + 1;
      currentNote.sampleCount = n;
      currentNote.endTime = time;
      currentNote.duration = time - currentNote.startTime;

      weightedSum += clarity * midi;
      totalWeight += clarity;

      // running averages over the whole note
      currentNote.avgClarity = (currentNote.avgClarity * prev + clarity) / n;
      currentNote.avgMidifloat = weightedSum / totalWeight;

      // the anchor only averages the first few frames, then locks
      if (n <= ANCHOR_LOCK_SAMPLE_COUNT) {
        currentNote.anchorMidifloat = weightedSum / totalWeight;
      }
    }

    // endTime/duration are already correct from the last extendNote (the last
    // sample that belonged to this note) — don't overwrite them with the
    // closing sample's time, or silence between notes gets glued onto the end.
    function closeNote() {
      const longEnough = currentNote.duration >= MIN_NOTE_DURATION;
      const denseEnough = currentNote.sampleCount >= MIN_NOTE_SAMPLE_COUNT;
      weightedSum = 0;
      totalWeight = 0;
      if (longEnough && denseEnough) {
        notes.push({ ...currentNote });
      }
      currentNote = emptyNote();
    }

    function add(time: number, clarity: number, midi: number) {
      const isEmpty = currentNote.sampleCount === 0;

      // does this sample continue the note currently being built?
      const fits =
        !isEmpty &&
        Math.abs(midi - currentNote.anchorMidifloat) < MIDI_THRESHOLD;

      // or does it return to the previous note after a short dropout?
      const prev = notes[notes.length - 1];
      const fitsPrev =
        prev !== undefined &&
        time - prev.endTime <= MAX_GAP_DURATION &&
        Math.abs(midi - prev.anchorMidifloat) < MIDI_THRESHOLD;

      if (fits) {
        extendNote(time, clarity, midi);
      } else if (fitsPrev) {
        // pull the previous note back out and keep extending it across the gap
        currentNote = notes.pop()!;
        totalWeight = currentNote.avgClarity * currentNote.sampleCount;
        weightedSum = currentNote.avgMidifloat * totalWeight;
        extendNote(time, clarity, midi);
      } else if (isEmpty) {
        startNote(time, clarity, midi);
      } else {
        // pitch jumped: close what we had and open a fresh note
        closeNote();
        startNote(time, clarity, midi);
      }
    }

    for (const { midi, time, clarity } of samples) {
      if (!Number.isFinite(midi)) continue; // skip silence — gaps inferred from timestamps
      add(time, clarity, midi);
    }
    closeNote();
    return notes;
  }
}

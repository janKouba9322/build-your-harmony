import type { Chord, ChordCandidate, ChordSegment, Note } from "./types";

// diatonic scale patterns as semitone offsets from the tonic
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10]; // natural minor

// a run of notes outside the current chord becomes a boundary once it carries
// at least this much weight AND coheres into a different chord this well —
// otherwise it's treated as ornamentation and folded back in
const PENDING_WEIGHT_MIN = 0.2;
const PENDING_COHERENCE_MIN = 0.3;
const MIN_CHORD_DURATION = 0.5;

export class ChordAnalyser {
  private tonic: number | null = null;
  private scale: number[] | null = null;
  private palette: Chord[] | null = null;

  setTonic(tonic: number, mode: "major" | "minor") {
    this.tonic = tonic;
    this.scale = mode === "major" ? MAJOR : MINOR;
    this.palette = this.buildPalette();
  }

  // split the melody into segments, each carrying a ranked list of chords
  analyseChords(notes: Note[]): ChordSegment[] {
    if (notes.length === 0) return [];

    const segments: ChordSegment[] = [];
    let current: Note[] = [notes[0]];
    let lead = this.bestChord(current);

    // notes that don't fit the lead chord, held back to see whether they're a
    // real harmony change or just passing ornaments
    let pending: Note[] = [];

    for (let i = 1; i < notes.length; i++) {
      const note = notes[i];
      const pitchClass = pitchClassOf(note);

      if (lead.pitchClasses.includes(pitchClass)) {
        // note fits the lead → any pending notes were ornaments, fold them back
        current.push(...pending, note);
        pending = [];
        lead = this.bestChord(current);
      } else {
        // note is outside the lead chord — hold it and see if a change is forming
        pending.push(note);
        const pendingWeight = totalWeight(pending);
        const otherChord = this.bestChord(pending);
        const startTime = current[0].startTime;
        const endTime = current[current.length - 1].endTime;

        const isRealChange =
          pendingWeight >= PENDING_WEIGHT_MIN &&
          scoreChord(otherChord.pitchClasses, pending) >=
            PENDING_COHERENCE_MIN &&
          otherChord.degree !== lead.degree &&
          endTime - startTime > MIN_CHORD_DURATION;

        if (isRealChange) {
          // pending coheres into a different chord → the harmony changed here
          segments.push(this.closeSegment(current));
          current = pending;
          pending = [];
          lead = this.bestChord(current);
        }
      }
    }

    // whatever is still pending belonged to the final segment
    current.push(...pending);
    segments.push(this.closeSegment(current));

    return segments;
  }

  // the highest-scoring palette chord for these notes
  private bestChord(notes: Note[]): Chord {
    let best = this.palette![0];
    let bestScore = -1;
    for (const chord of this.palette!) {
      const s = scoreChord(chord.pitchClasses, notes);
      if (s > bestScore) {
        bestScore = s;
        best = chord;
      }
    }
    return best;
  }

  // freeze a segment: score every palette chord, rank them, take the time span
  private closeSegment(notes: Note[]): ChordSegment {
    const candidates: ChordCandidate[] = this.palette!.map((chord) => ({
      degree: chord.degree,
      pitchClasses: chord.pitchClasses,
      score: scoreChord(chord.pitchClasses, notes),
    })).sort((a, b) => b.score - a.score);
    return {
      startTime: notes[0].startTime,
      endTime: notes[notes.length - 1].endTime,
      candidates,
    };
  }

  // seven diatonic triads of the key, each as absolute pitch classes
  private buildPalette(): Chord[] {
    const chords: Chord[] = [];
    for (let degree = 1; degree <= 7; degree++) {
      const pitchClasses = triadPitchClasses(this.scale!, degree).map(
        (pc) => (pc + this.tonic!) % 12,
      );
      chords.push({ degree, pitchClasses });
    }
    return chords;
  }
}

// --- pure helpers ---

// note's pitch class (0–11), snapped to the grid like the drawn bars
function pitchClassOf(note: Note): number {
  return ((Math.round(note.avgMidifloat) % 12) + 12) % 12;
}

// a note weighs more the longer and more confident it is
function noteWeight(note: Note): number {
  return note.avgClarity * note.duration;
}

function totalWeight(notes: Note[]): number {
  return notes.reduce((sum, n) => sum + noteWeight(n), 0);
}

// build a triad on a scale degree (1-based): root, third, fifth ("skip one")
function triadPitchClasses(scale: number[], degree: number): number[] {
  const root = degree - 1;
  return [scale[root % 7], scale[(root + 2) % 7], scale[(root + 4) % 7]];
}

// normalized coverage: what fraction of the notes' weight lands in the chord
function scoreChord(chord: number[], notes: Note[]): number {
  let covered = 0;
  let total = 0;
  for (const note of notes) {
    const w = noteWeight(note);
    if (chord.includes(pitchClassOf(note))) covered += w;
    total += w;
  }
  return total > 0 ? covered / total : 0;
}

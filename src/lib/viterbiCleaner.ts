import type { Sample } from "./types";

const SILENCE_TRANSITION_COST = 0.5; // cheap, fixed — not a "jump" in pitch terms
const OCTAVE = 12;

export class ViterbiCleaner {
  viterbi(samples: Sample[]): Sample[] {
    const N = samples.length;
    const cands = samples.map((s) => this.candidatesFor(s.midi));

    const cost = cands.map((c) => new Array(c.length).fill(Infinity));
    const back = cands.map((c) => new Array(c.length).fill(-1));

    // frame 0: just the emission cost, no transition yet
    for (let k = 0; k < cands[0].length; k++) {
      cost[0][k] = this.emitCost(cands[0][k], samples[0].midi);
    }

    // frames 1..N-1: best predecessor for each candidate
    for (let i = 1; i < N; i++) {
      for (let k = 0; k < cands[i].length; k++) {
        let bestCost = Infinity,
          bestPrev = -1;
        for (let j = 0; j < cands[i - 1].length; j++) {
          const c =
            cost[i - 1][j] + this.transitionCost(cands[i - 1][j], cands[i][k]);
          if (c < bestCost) {
            bestCost = c;
            bestPrev = j;
          }
        }
        cost[i][k] = bestCost + this.emitCost(cands[i][k], samples[i].midi);
        back[i][k] = bestPrev;
      }
    }

    // backtrack from the cheapest final candidate
    let lastK = 0,
      lastCost = Infinity;
    for (let k = 0; k < cands[N - 1].length; k++) {
      if (cost[N - 1][k] < lastCost) {
        lastCost = cost[N - 1][k];
        lastK = k;
      }
    }
    const path = new Array(N);
    let k = lastK;
    for (let i = N - 1; i >= 0; i--) {
      path[i] = cands[i][k];
      k = back[i][k] >= 0 ? back[i][k] : 0;
    }
    return path.map((midi, i) => ({
      midi,
      time: samples[i].time,
      clarity: samples[i].clarity,
    }));
  }

  private transitionCost(prevCandidate: number, currCandidate: number) {
    const prevSilent = !Number.isFinite(prevCandidate);
    const currSilent = !Number.isFinite(currCandidate);
    if (prevSilent && currSilent) return 0; // silence continues, free
    if (prevSilent || currSilent) return SILENCE_TRANSITION_COST; // entering/leaving silence, cheap flat cost
    return (currCandidate - prevCandidate) ** 2; // pitch-to-pitch: penalize big jumps
  }
  private emitCost(candidate: number, observed: number) {
    if (!Number.isFinite(observed)) return 0; // silence has nothing to match
    return Math.abs(candidate - observed) / 100; // 0 for the raw pitch, >0 for octave alternates
  }

  private candidatesFor(midi: number) {
    if (!Number.isFinite(midi)) return [NaN]; // silence: one candidate, itself
    return [
      midi - 2 * OCTAVE,
      midi - OCTAVE,
      midi,
      midi + OCTAVE,
      midi + 2 * OCTAVE,
    ];
  }
}

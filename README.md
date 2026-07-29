# Build Your Harmony

Sing or hum a melody into your browser. It transcribes the notes, estimates the
key, and derives a chord progression underneath — entirely client-side, with no
audio ever leaving your device.

**[Try it →](https://build-your-harmony.pages.dev)**

<!-- TODO: screenshot or short GIF of the canvas right here.
     This is a visual app — the image does more than any paragraph below. -->

---

## What it does

- **Transcription** — monophonic pitch tracking to a sequence of discrete notes
- **Key detection** — 24-way profile correlation, with a confidence margin
- **Chord suggestion** — diatonic progression with ranked alternatives per segment
- **Editing** — every detected note can be re-pitched, resized, moved or deleted
  on the canvas; the analysis re-runs on each change
- **Playback** — hear the transcription back, synced to a playhead

Planned: second and third vocal parts. That is the actual point of the project —
a rehearsal aid for working out harmonies, not a way to synthesise a finished
sound.

## Design constraints

Deliberate limitations, in the spirit of keeping the tool small and honest:

- **No server.** No backend, no database, no accounts, no analytics. Audio is
  processed in the page and discarded when the tab closes.
- **No music-theory dependencies.** Key profiles, chord fitting, segmentation
  and octave correction are implemented from scratch. The only third-party audio
  code is `pitchy` (pitch detection) and `Tone.js` (playback).
- **No generation.** The app does not compose. It reads what you sang and names
  it; the musical decisions stay with you.
- **Uncertainty is surfaced, not hidden.** Key and chord confidence are computed
  as margins over the runner-up and shown in the UI.

## Getting started

Requires Node.js 18+ and pnpm.

```bash
git clone https://github.com/janKouba9322/build-your-harmony.git   # TODO: real repo URL
cd build-your-harmony
pnpm install
pnpm dev
```

| Command        | Effect                             |
| -------------- | ---------------------------------- |
| `pnpm dev`     | dev server with HMR                |
| `pnpm build`   | production build into `dist/`      |
| `pnpm preview` | serve the production build locally |
| `pnpm check`   | `svelte-check` over the project    |

The build output is fully static — any static host will serve it (Vercel,
Netlify, Cloudflare Pages). No environment variables, no backend.

Microphone access requires a secure context: HTTPS, or `localhost` in
development.

## How it works

### Pipeline

Everything below runs once, synchronously, when recording stops. Nothing is
analysed mid-take.

```
AnalyserNode (fftSize 2048)
   │  requestAnimationFrame loop, one reading per frame (~60 Hz)
   ▼
pitchy · McLeod Pitch Method            → (frequency, clarity)
   │  gate: 70 Hz ≤ f ≤ 1100 Hz, clarity > 0.7
   │  freqToMidi: m = 69 + 12·log₂(f / 440)
   ▼
Sample[]              { midi: number | NaN, time: number, clarity: number }
   │  ViterbiCleaner — global octave correction
   ▼
Sample[]              octave-corrected, same length and timestamps
   │  Segmenter — group into notes
   ▼
Note[]                { avgMidifloat, anchorMidifloat, duration, startTime, … }
   │  snapNotesToGrid — global tuning offset, then round to semitones
   ▼
Note[]                integer MIDI
   │  buildChroma → detectKey
   ▼
KeyInfo               { tonic: 0–11, mode, confidence: 0–1 }
   │  ChordAnalyser.analyseChords
   ▼
ChordSegment[]        { startTime, endTime, candidates: ranked }
```

Failed pitch readings are pushed as `NaN` rather than dropped, so frame indices
stay aligned with wall-clock time and silences remain visible to the segmenter.

### Octave correction (`viterbiCleaner.ts`)

The McLeod method occasionally locks onto a harmonic or subharmonic. On real
singing these are not brief glitches — they are long, stable stretches with
clarity above 0.99. A median filter or local smoother cannot detect them,
because nothing inside the stretch looks wrong. Only a decision made over the
whole take can.

Framed as a hidden Markov model and solved with Viterbi:

- **States per frame** — five octave candidates, `{m−24, m−12, m, m+12, m+24}`.
  Silent frames have a single state, `NaN`.
- **Emission cost** — `|candidate − observed| / 100`. Zero for the raw reading,
  a small constant penalty per octave away. Silence emits at zero cost.
- **Transition cost** — `(cᵢ − cᵢ₋₁)²` between two voiced frames, so an octave
  jump costs 144 while a semitone step costs 1. Entering or leaving silence is a
  flat `0.5`; silence-to-silence is free.
- **Decoding** — forward pass fills a cost and backpointer table, then backtrack
  from the cheapest final state.

The quadratic transition term is what does the work: a wrong octave has to be
paid for twice, once entering and once leaving, so it only survives if it is
consistently cheaper across the whole stretch.

Complexity is `O(N · K²)` with `K = 5`, i.e. linear in frame count. A 60-second
take is roughly 3,600 frames.

### Segmentation (`segmenter.ts`)

A single forward pass that accumulates samples into notes. The mechanism worth
knowing about is the **anchor**: `anchorMidifloat` averages only the first 15
frames of a note and then freezes, while `avgMidifloat` keeps averaging over the
whole note. Membership is tested against the frozen anchor, so a note that
drifts slowly in pitch does not drag its own acceptance window along with it and
swallow the next note.

A sample joins the current note if it is within `MIDI_THRESHOLD` of the anchor.
Otherwise, if the previous note ended within `MAX_GAP_DURATION` and the sample
fits _its_ anchor, that note is popped back off the output and resumed — this is
what stops a brief detection dropout from splitting one sustained note in two.
Failing both, the current note is closed and a new one opened.

| Constant                   | Value      | Purpose                                       |
| -------------------------- | ---------- | --------------------------------------------- |
| `MIDI_THRESHOLD`           | 1 semitone | how close a sample must sit to the anchor     |
| `ANCHOR_LOCK_FRAME_LENGTH` | 15 frames  | anchor freezes after this many samples        |
| `MIN_NOTE_DURATION`        | 0.08 s     | shorter notes are discarded                   |
| `MIN_NOTE_FRAME_LENGTH`    | 8 frames   | guards against sparse, unreliable notes       |
| `MAX_GAP_DURATION`         | 0.1 s      | dropout window for resuming the previous note |

Both minimum thresholds must pass; duration alone would admit a note built from
two samples 90 ms apart.

### Tuning and pitch classes (`detectKey.ts`)

Singers are rarely at A=440. `snapNotesToGrid` computes each note's signed
deviation from the nearest semitone, takes the **median** across the take, and
subtracts that one shared offset before rounding. Median rather than mean so a
few badly-detected notes cannot shift the whole transcription.

`buildChroma` then folds notes into a 12-bin pitch-class histogram weighted by
`duration × avgClarity` — a long, confident note contributes more than a short
uncertain one. Because the histogram is modulo 12, any octave errors that
survived the Viterbi pass affect only the display, never the key or the chords.

### Key detection (`detectKey.ts`)

The chroma vector is Pearson-correlated against all 24 rotations of two key
profiles (12 tonics × major/minor). Best correlation wins.

Profiles are **Temperley (1999)**, derived from the Kostka-Payne corpus, rather
than the more commonly used Krumhansl-Kessler probe-tone data. KK's major and
minor profiles have different means, which biases short or ambiguous melodies
toward minor; the Temperley profiles share a mean and classify noticeably better
on the kind of input this app sees. KK is kept in `constants.ts` for comparison.

Confidence is the margin over the runner-up, `clamp((best − second) × 2.2, 0, 1)`
— deliberately a heuristic rather than a probability, and presented as such.

### Chord analysis (`analyseChords.ts`)

Chords are handled as **scale degrees relative to the tonic**, not absolute
chords. The palette is the seven diatonic triads, each built by stacking thirds
over the scale (`root`, `root+2`, `root+4` by scale index) and mapped into
absolute pitch classes only at the end. Re-labelling a progression after a key
change therefore costs nothing.

A chord scores as the fraction of note weight it covers:

```
score(chord) = Σ weight(n) for n whose pitch class ∈ chord
             ─────────────────────────────────────────────
                        Σ weight(n) for all n
```

with `weight(n) = avgClarity × duration`, the same weighting as the chroma.

Segmentation uses a **pending buffer** to distinguish a real harmonic change
from ornamentation. Notes outside the current chord are held rather than acted
on immediately. They only trigger a boundary if all four hold:

- accumulated weight ≥ `0.2`
- the pending notes cohere into some chord at ≥ `0.3`
- that chord is a different degree from the current one
- the current segment is already longer than `0.5 s`

If a note fitting the current chord arrives first, the pending notes are folded
back in as passing tones. Each closed segment carries every palette chord ranked
by score, so the UI can show alternatives and flag a segment as uncertain when
the runner-up is within `0.15` of the winner.

### Rendering (`PitchCanvas.svelte`)

A single Canvas 2D surface, redrawn imperatively. Two details that came out of
profiling:

- CSS custom properties are read **once on mount**, not per frame.
  `getComputedStyle` in the draw loop cost 0.3–0.7 ms per frame on its own.
- Per-frame closures in the hot path measured ~14× slower than direct function
  calls and were removed.

Live drawing uses a separate cleaner (`pitchVisualCleaner.ts`) — a rolling
median over 10 frames for octave folding plus a 7-frame smoothing median, tuned
for responsiveness. It feeds the on-screen trace only. The Viterbi pass is the
single source of truth for everything downstream, and the raw trace stays
visible as a ghost layer under the edited notes.

## Project structure

```
src/
├── main.ts                    entry point
├── app.css                    design tokens, global styles
├── App.svelte                 page switching (Studio / About)
└── lib/
    ├── audio.ts               getUserMedia, AnalyserNode, rAF loop
    ├── pitch.ts               pitchy wrapper
    ├── viterbiCleaner.ts      HMM octave correction over the whole take
    ├── pitchVisualCleaner.ts  rolling-median cleaner for the live trace
    ├── segmenter.ts           Sample[] → Note[]
    ├── detectKey.ts           tuning offset, chroma, 24-way correlation
    ├── analyseChords.ts       diatonic palette, scoring, segmentation
    ├── musicTheory.ts         conversions, note names, roman numerals
    ├── constants.ts           note names, key profiles, thresholds
    ├── types.ts               shared types
    ├── play.ts                Tone.js transport scheduling
    ├── canvasHelpers.ts       pure drawing helpers
    ├── PitchCanvas.svelte     canvas rendering, note editor, pointer input
    ├── RecorderCard.svelte    recording controls, pipeline orchestration
    ├── AnalysisCard.svelte    key and chord results
    ├── HelpModal.svelte       four-step animated walkthrough
    ├── Masthead.svelte        header
    └── AboutPage.svelte       about
```

## Limitations

- **Monophonic only.** One voice at a time; chords sung or played into the mic
  will not be transcribed.
- **No rhythm quantisation.** Note timings are as sung, not fitted to a metre.
  There is no tempo detection and no bar structure.
- **Diatonic chords only.** Seven triads within the detected key — no sevenths,
  no borrowed chords, no modulation. A melody that changes key mid-take gets one
  key for the whole thing.
- **Frame rate is the time resolution.** Analysis is driven by
  `requestAnimationFrame`, so a throttled background tab produces sparse
  sampling. Recording stops when the tab is hidden.
- **60-second cap** per take, to bound memory.

## Stack

Vite · Svelte 5 (runes) · TypeScript · Canvas 2D · pitchy · Tone.js · Prettier.
No UI framework, no component library, no charting library.

## Credits

Built by [janKouba9322](https://github.com/janKouba9322).

- Pitch detection: McLeod & Wyvill, _A Smarter Way to Find Pitch_ (2005), via
  [pitchy](https://github.com/ianprime0509/pitchy)
- Key profiles: Temperley, _What's Key for Key?_ (1999), Kostka-Payne corpus
- Comparison profiles: Krumhansl & Kessler (1982)

## License

<!-- TODO: add a LICENSE file. MIT is the usual choice for a project like this.
     Note that no license at all means nobody may legally reuse or fork the
     code — which is usually not what people putting a repo on GitHub intend. -->

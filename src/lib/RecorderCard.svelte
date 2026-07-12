<script lang="ts">
  import { onDestroy } from "svelte";
  import { RecordHandler } from "./audio";
  import { freqToMidi, midiToName } from "./musicTheory";
  import PitchCanvas from "./PitchCanvas.svelte";
  import { Segmenter } from "./segmenter";
  import { buildChroma, detectKey, snapNotesToGrid } from "./detectKey";
  import { TonePlayer } from "./play";
  import type { ChordSegment, KeyInfo, Note, Sample } from "./types";
  import { ChordAnalyser } from "./analyseChords";
  import { PitchVisualCleaner } from "./pitchVisualCleaner";
  import { ViterbiCleaner } from "./viterbiCleaner";
  import { CONFIDENCE_CLARITY } from "./constans";

  // pitch-validity gating
  const MIN_FREQ = 70;
  const MAX_FREQ = 1100;
  const ACCEPTABLE_CLARITY = 0.7;

  let recording = $state(false);
  let micError = $state(false); // mic permission denied / unavailable
  let samples: Sample[] = [];
  let currentNote = $state("–"); // large live readout
  let currentConfident = $state(false);
  let hasSamples = $state(false); // enables the "start over" button

  let playableNotes: Note[] = $state([]);
  let playing = $state(false);
  let playbackRaf: number | null = null;

  let {
    onAnalysed,
  }: {
    onAnalysed?: (
      notes: Note[],
      keyInfo: KeyInfo | null,
      segments: ChordSegment[],
    ) => void;
  } = $props();

  const handler = new RecordHandler();
  const segmenter = new Segmenter();
  const tonePlayer = new TonePlayer();

  // background tabs throttle requestAnimationFrame, which starves the pitch
  // loop — finish the take instead of recording silence-with-holes
  $effect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (recording) finish();
        else if (playing) stopPlayback();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  });
  const chordAnalyser = new ChordAnalyser();
  const pitchCleaner = new PitchVisualCleaner();
  const viterbiCleaner = new ViterbiCleaner();
  let canvas: PitchCanvas; // child instance (bind:this) for push()/tick()/finish()

  function isValidPitch(freq: number): boolean {
    return Number.isFinite(freq) && freq > MIN_FREQ && freq < MAX_FREQ;
  }

  function onPitch(freq: number, clarity: number, time: number) {
    const valid = isValidPitch(freq) && clarity > ACCEPTABLE_CLARITY;
    const confident = valid && clarity > CONFIDENCE_CLARITY;
    const midi = valid ? freqToMidi(freq) : NaN;
    samples.push({ midi, time, clarity });

    if (valid) {
      const cleanedMidi = pitchCleaner.feed(midi, time);
      canvas.push(time, cleanedMidi, confident);
      currentConfident = confident;
      if (confident) currentNote = midiToName(midi);
    }
    canvas.tick(time);

    hasSamples = true;
  }

  function toggle() {
    if (!recording) {
      if (playableNotes.length !== 0) {
        reset();
      }
      start();
    } else {
      finish();
    }
  }

  async function start() {
    micError = false;
    const ok = await handler.startRecording(onPitch);
    if (!ok) {
      // permission denied or no input device — tell the user, stay stopped
      micError = true;
      return;
    }
    recording = true;
  }

  function finish() {
    handler.stopRecording();
    const cleanedSamples = viterbiCleaner.viterbi(samples);
    const notes = segmenter.analyse(cleanedSamples);
    const snapped = snapNotesToGrid(notes);
    playableNotes = snapped;
    const keyInfo = detectKey(buildChroma(snapped));

    chordAnalyser.setTonic(keyInfo.tonic, keyInfo.mode);
    const segments = chordAnalyser.analyseChords(snapped);
    canvas.finish(snapped, segments, cleanedSamples, keyInfo);
    onAnalysed?.(snapped, keyInfo, segments);
    recording = false;
    currentConfident = false;
  }

  function reset() {
    stopPlayback(); // notes must fall silent immediately on reset
    handler.stopRecording();
    recording = false;
    currentNote = "–";
    currentConfident = false;
    hasSamples = false;
    playableNotes = []; // hide the play button again
    samples = [];
    canvas.clear();
    onAnalysed?.([], null, []); // clear stale analysis in the parent too
  }

  // one button, two roles: starts playback, or stops it when already playing
  async function togglePlayback() {
    if (playing) {
      stopPlayback();
      return;
    }
    await tonePlayer.play(playableNotes); // grid-snapped notes
    playing = true;
    const loop = () => {
      const t = tonePlayer.playbackTime();
      if (t === null) {
        canvas.setPlayhead(null); // done → cursor gone
        playbackRaf = null;
        playing = false;
        return;
      }
      canvas.setPlayhead(t);
      playbackRaf = requestAnimationFrame(loop);
    };
    loop();
  }

  // halt playback and clean up the cursor/raf — shared by the toggle and reset
  function stopPlayback() {
    tonePlayer.stop();
    if (playbackRaf !== null) cancelAnimationFrame(playbackRaf);
    playbackRaf = null;
    playing = false;
    canvas.setPlayhead(null);
  }

  function recomputeAfterNoteChange() {
    const keyInfo = detectKey(buildChroma(playableNotes));
    chordAnalyser.setTonic(keyInfo.tonic, keyInfo.mode);
    const segments = chordAnalyser.analyseChords(playableNotes);
    canvas.refreshAfterEdit(segments, keyInfo);
    onAnalysed?.(playableNotes, keyInfo, segments);
  }
  onDestroy(() => handler.stopRecording());
</script>

<section class="card" aria-label="Melody recording">
  <div class="live-row">
    <div
      class="note-readout"
      class:dim={!currentConfident}
      class:glow={currentConfident}
    >
      {currentNote}
    </div>
    <div class="live-meta">
      <div class="status">
        {#if recording}
          <span class="rec-dot" aria-hidden="true"></span>
          <span class="rec-label">REC</span>
          listening…
        {:else}
          mic off
        {/if}
      </div>
      <div class="legend">
        <span><i class="swatch swatch--on"></i>confident</span>
        <span><i class="swatch swatch--off"></i>uncertain</span>
      </div>
    </div>
  </div>

  <div class="canvas-wrap">
    <PitchCanvas
      bind:this={canvas}
      onNoteEdited={(index, newMidi) => {
        playableNotes[index] = {
          ...playableNotes[index],
          avgMidifloat: newMidi,
          anchorMidifloat: newMidi,
        };
        tonePlayer.previewNote(newMidi);
        recomputeAfterNoteChange();
      }}
      onNoteDeleted={(index) => {
        playableNotes = playableNotes.filter((_, i) => i !== index);
        recomputeAfterNoteChange();
      }}
      onNoteResized={(index, newStartTime, newEndTime) => {
        playableNotes[index].startTime = newStartTime;
        playableNotes[index].endTime = newEndTime;
        playableNotes[index].duration = newEndTime - newStartTime;
        recomputeAfterNoteChange();
      }}
      onNoteSelected={(index) => {
        tonePlayer.previewNote(playableNotes[index].avgMidifloat);
      }}
    />
  </div>

  <div class="controls">
    <button
      class="btn btn--primary"
      class:is-recording={recording}
      onclick={toggle}
    >
      {recording ? "Done — analyze" : "Start recording"}
    </button>
    <button
      class="btn btn--ghost"
      disabled={!recording && !hasSamples}
      onclick={reset}
    >
      Reset
    </button>
    {#if micError}
      <p class="mic-error" role="alert">
        Microphone unavailable — allow access in your browser and try again.
      </p>
    {/if}
    {#if !recording && playableNotes.length > 0}
      <button class="btn btn--ghost btn--play" onclick={togglePlayback}>
        <span class="play-tri" aria-hidden="true"></span>
        {playing ? "Stop" : "Play"}
      </button>
    {/if}
  </div>

  <p class="hint">
    Sing one note after another, close to the microphone. It’s not about singing
    “cleanly”— it’s enough if the intervals between the notes are accurate.
  </p>
</section>

<style>
  /* card container with a warm hairline on top */
  .card {
    position: relative;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    padding: clamp(18px, 4vw, 30px);
    margin-bottom: 20px;
    animation: rise 0.55s ease 0.08s both;
  }
  .card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent), transparent 65%);
    opacity: 0.7;
  }

  /* top row: big readout + status/legend */
  .live-row {
    display: flex;
    align-items: center;
    gap: clamp(16px, 4vw, 26px);
    flex-wrap: wrap;
  }

  /* large live note readout */
  .note-readout {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(52px, 13vw, 76px);
    line-height: 1;
    letter-spacing: -0.03em;
    width: 118px;
    transition:
      color 0.12s ease,
      text-shadow 0.25s ease;
  }
  .note-readout.dim {
    color: var(--uncertain);
    text-shadow: none;
  }
  .note-readout.glow {
    color: var(--text);
    text-shadow: 0 0 26px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .live-meta {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
  }
  .rec-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent-2);
    animation: pulse-ring 1.6s ease-out infinite;
  }
  .rec-label {
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--accent-2);
    animation: blink 1.6s steps(1) infinite;
  }

  /* confident / uncertain legend */
  .legend {
    display: flex;
    gap: 16px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .swatch--on {
    background: var(--accent-2);
  }
  .swatch--off {
    background: var(--uncertain);
  }

  /* spacing wrapper around the canvas component */
  .canvas-wrap {
    margin-top: 22px;
  }

  /* control buttons */
  .controls {
    display: flex;
    gap: 12px;
    margin-top: 22px;
    flex-wrap: wrap;
  }
  .btn {
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 15px;
    border: none;
    border-radius: var(--r-ctl);
    padding: 13px 22px;
    cursor: pointer;
    transition:
      transform 0.12s ease,
      background 0.18s ease,
      box-shadow 0.25s ease,
      opacity 0.15s ease;
  }
  .btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .btn:active:not(:disabled) {
    transform: translateY(1px);
  }
  .btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .btn--primary {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .btn--primary:hover:not(:disabled) {
    box-shadow: 0 6px 24px -6px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .btn--primary.is-recording {
    background: var(--accent-2);
    color: var(--accent-2-ink);
    animation: pulse-ring 2s ease-out infinite;
  }

  .btn--ghost {
    background: var(--raised);
    color: var(--text);
    border: 1px solid var(--line);
  }
  .btn--ghost:hover:not(:disabled) {
    border-color: var(--line-strong);
  }

  .btn--play {
    display: inline-flex;
    align-items: center;
    gap: 9px;
  }
  .play-tri {
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 6px 0 6px 10px;
    border-color: transparent transparent transparent var(--accent);
  }

  /* helper hint text */
  .hint {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--muted);
    margin-top: 18px;
    line-height: 1.6;
  }

  /* mobile: buttons stretch full width for easy thumbs */
  @media (max-width: 560px) {
    .controls .btn {
      flex: 1 1 auto;
    }
  }
  .mic-error {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--accent-2);
    margin-left: 4px;
    align-self: center;
  }
</style>

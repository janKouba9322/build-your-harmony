<script lang="ts">
  import { onDestroy } from "svelte";
  import { RecordHandler, type PitchCallback } from "./audio";
  import { freqToMidi, midiToName } from "./musicTheory";
  import PitchCanvas from "./PitchCanvas.svelte";
  import { Segmenter } from "./segmenter";
  import { buildChroma, detectKey, snapNotesToGrid } from "./detectKey";
  import { TonePlayer } from "./play";
  import type { ChordSegment, KeyInfo, Note } from "./types";
  import { ChordAnalyser } from "./analyseChords";

  // pitch-validity gating
  const MIN_FREQ = 70;
  const MAX_FREQ = 1100;
  const CONFIDENCE_CLARITY = 0.95; // clarity above this counts as a "confident" sample
  const ACCEPTABLE_CLARITY = 0.8;

  let recording = $state(false);
  let currentNote = $state("–"); // large live readout
  let currentConfident = $state(false);
  let hasSamples = $state(false); // enables the "start over" button

  let playableNotes: Note[] = $state([]);
  let playbackRaf: number | null = null;

  let {
    onAnalysed,
  }: {
    onAnalysed?: (
      notes: Note[],
      keyInfo: KeyInfo,
      segments: ChordSegment[],
    ) => void;
  } = $props();

  const handler = new RecordHandler();
  const segmenter = new Segmenter();
  const tonePlayer = new TonePlayer();
  const chordAnalyser = new ChordAnalyser();
  let canvas: PitchCanvas; // child instance (bind:this) for push()/tick()/finish()

  function isValidPitch(freq: number): boolean {
    return Number.isFinite(freq) && freq > MIN_FREQ && freq < MAX_FREQ;
  }

  function onPitch(freq: number, clarity: number, time: number) {
    const valid = isValidPitch(freq) && clarity > ACCEPTABLE_CLARITY;
    const confident = valid && clarity > CONFIDENCE_CLARITY;
    const midi = valid ? freqToMidi(freq) : NaN;

    if (valid) {
      canvas.push(time, midi, confident);
      segmenter.add(time, clarity, midi);
    }
    canvas.tick(time); // advance the viewport every frame, even on silence
    hasSamples = true;

    currentConfident = confident;
    if (confident) currentNote = midiToName(midi);
  }

  function toggle() {
    if (!recording) {
      handler.startRecording(onPitch);
      recording = true;
    } else {
      handler.stopRecording();
      segmenter.finish();
      const snapped = snapNotesToGrid(segmenter.notes);
      playableNotes = snapped;
      const keyInfo = detectKey(buildChroma(snapped));
      canvas.finish(snapped);
      chordAnalyser.setTonic(keyInfo.tonic, keyInfo.mode);
      const segments = chordAnalyser.analyseChords(snapped);
      onAnalysed?.(snapped, keyInfo, segments);
      recording = false;
      currentConfident = false;
    }
  }

  function reset() {
    tonePlayer.stop();
    if (playbackRaf !== null) cancelAnimationFrame(playbackRaf);
    playbackRaf = null;
    canvas.setPlayhead(null);
    handler.stopRecording();
    recording = false;
    currentNote = "–";
    currentConfident = false;
    hasSamples = false;
    segmenter.reset();
    canvas.clear();
  }

  async function startPlayback() {
    await tonePlayer.play(playableNotes); // straightened/snapped notes
    const loop = () => {
      const t = tonePlayer.playbackTime();
      if (t === null) {
        canvas.setPlayhead(null); // done → cursor gone
        playbackRaf = null;
        return;
      }
      canvas.setPlayhead(t);
      playbackRaf = requestAnimationFrame(loop);
    };
    loop();
  }

  onDestroy(() => handler.stopRecording());
</script>

<section class="card" aria-label="Nahrávání melodie">
  <div class="live-row">
    <div class="note-readout" class:dim={!currentConfident}>{currentNote}</div>
    <div class="live-meta">
      <div class="status">
        {recording ? "poslouchám…" : "mikrofon vypnutý"}
      </div>
      <div class="legend">
        <span><i class="swatch swatch--on"></i>jistý tón</span>
        <span><i class="swatch swatch--off"></i>nejistý</span>
      </div>
    </div>
  </div>

  <div class="canvas-wrap">
    <PitchCanvas bind:this={canvas} />
  </div>

  <div class="controls">
    <button
      class="btn btn--primary"
      class:is-recording={recording}
      onclick={toggle}
    >
      {recording ? "Hotovo — zpracovat" : "Zapnout mikrofon"}
    </button>
    <button
      class="btn btn--ghost"
      disabled={!recording && !hasSamples}
      onclick={reset}
    >
      Začít znovu
    </button>
    {#if !recording && playableNotes.length > 0}
      <button class="btn btn--ghost" onclick={startPlayback}>▶ Přehrát</button>
    {/if}
  </div>

  <p class="hint">
    Zpívej jeden tón po druhém, blízko mikrofonu. Nejde o to zazpívat „čistě“ —
    stačí, když sedí vzdálenosti mezi tóny.
  </p>
</section>

<style>
  /* card container */
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    padding: clamp(18px, 4vw, 28px);
    margin-bottom: 20px;
  }
  /* top row: big readout + status/legend */
  .live-row {
    display: flex;
    align-items: center;
    gap: clamp(16px, 4vw, 24px);
    flex-wrap: wrap;
  }
  /* large live note readout */
  .note-readout {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(56px, 14vw, 76px);
    line-height: 1;
    letter-spacing: -0.03em;
    min-width: 120px;
    transition: color 0.12s ease;
  }
  .note-readout.dim {
    color: var(--uncertain);
  }
  .live-meta {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .status {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
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
    background: var(--accent);
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
    border-radius: 12px;
    padding: 13px 22px;
    cursor: pointer;
    transition:
      transform 0.08s ease,
      background 0.15s ease,
      opacity 0.15s ease;
  }
  .btn:active {
    transform: translateY(1px);
  }
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn--primary {
    background: var(--accent);
    color: #241a00;
  }
  .btn--primary.is-recording {
    background: var(--accent-2);
    color: #2a0d0a;
  }
  .btn--ghost {
    background: var(--raised);
    color: var(--text);
  }
  /* helper hint text */
  .hint {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--muted);
    margin-top: 18px;
    line-height: 1.55;
  }
</style>

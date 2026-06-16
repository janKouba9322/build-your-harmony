<script lang="ts">
  import { onDestroy } from "svelte";
  import { RecordHandler } from "./audio";
  import { freqToMidi, midiToName } from "./musicTheory";
  import PitchCanvas from "./PitchCanvas.svelte";
  import { Segmenter } from "./segmenter";
  import { buildChroma, detectKey, straightenNotes } from "./detectKey";

  // pitch-validity gating
  const MIN_FREQ = 70;
  const MAX_FREQ = 1100;
  const CONFIDENCE_CLARITY = 0.95; // clarity above this counts as a "confident" sample

  let recording = $state(false);
  let currentNote = $state("–"); // large live readout
  let currentConfident = $state(false);
  let hasSamples = $state(false); // enables the "start over" button

  let lastTime = 0; // most recent sample time (seconds), used to close the final note

  const handler = new RecordHandler();
  const segmenter = new Segmenter();
  let canvas: PitchCanvas; // child instance (bind:this) for push()/tick()/finish()

  function isValidPitch(freq: number): boolean {
    return Number.isFinite(freq) && freq > MIN_FREQ && freq < MAX_FREQ;
  }

  function onPitch(freq: number, clarity: number, time: number) {
    lastTime = time;
    const valid = isValidPitch(freq);
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
      segmenter.finish(lastTime);
      const keyInfo = detectKey(buildChroma(segmenter.notes));
      canvas.finish(straightenNotes(segmenter.notes));
      console.log(keyInfo); // TODO: surface key estimate in the UI
      recording = false;
      currentConfident = false;
    }
  }

  function reset() {
    handler.stopRecording();
    recording = false;
    currentNote = "–";
    currentConfident = false;
    hasSamples = false;
    lastTime = 0;
    segmenter.reset();
    canvas.clear();
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

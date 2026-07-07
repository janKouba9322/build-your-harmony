<script lang="ts">
  // App = conductor: holds the analysis results and wires the cards together.
  import Masthead from "./lib/Masthead.svelte";
  import RecorderCard from "./lib/RecorderCard.svelte";
  import AnalysisCard from "./lib/AnalysisCard.svelte";
  import type { Note, ChordSegment, KeyInfo } from "./lib/types";

  let notes: Note[] = $state([]);
  let keyInfo: KeyInfo | null = $state(null);
  let segments: ChordSegment[] = $state([]);
</script>

<main class="wrap">
  <Masthead />
  <RecorderCard
    onAnalysed={(n: Note[], k: KeyInfo | null, s: ChordSegment[]) => {
      notes = n;
      keyInfo = k;
      segments = s;
    }}
  />
  <AnalysisCard {notes} {keyInfo} {segments} />

  <footer class="foot">
    <span class="foot-dot" aria-hidden="true"></span>
    The recording doesn't leave your device—no account, no server, no storage. The
    audio is processed solely by your browser.
  </footer>
</main>

<style>
  .wrap {
    width: 100%;
    max-width: var(--maxw);
    margin: 0 auto;
    padding: clamp(24px, 6vw, 56px) clamp(16px, 4vw, 32px) 48px;
  }

  .foot {
    margin-top: clamp(28px, 6vw, 44px);
    text-align: center;
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.7;
    color: var(--muted);
  }
  .foot-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-3);
    margin-right: 8px;
    vertical-align: 1px;
  }
</style>

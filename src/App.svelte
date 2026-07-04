<script lang="ts">
  import Masthead from "./lib/Masthead.svelte";
  import RecorderCard from "./lib/RecorderCard.svelte";
  import AnalysisCard from "./lib/AnalysisCard.svelte";
  import type { Note, ChordSegment, KeyInfo } from "./lib/types";
  let notes: Note[] = $state([]);
  let keyInfo: KeyInfo | null = $state(null);
  let segments: ChordSegment[] = $state([]);
</script>

<div class="wrap">
  <Masthead />
  <RecorderCard
    onAnalysed={(n: Note[], k: KeyInfo, s: ChordSegment[]) => {
      notes = n;
      keyInfo = k;
      segments = s;
    }}
  />
  <AnalysisCard {notes} {keyInfo} {segments} />
</div>

<style>
  .wrap {
    width: 100%;
    max-width: var(--maxw);
  }
</style>

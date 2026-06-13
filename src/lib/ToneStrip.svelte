<script lang="ts">
  import type { Tone } from "./types";

  // props ve Svelte 5: přijmeme pole tónů zvenčí
  let { tones }: { tones: Tone[] } = $props();
</script>

<div class="tone-strip" role="list" aria-label="Rozpoznané tóny">
  {#each tones as t}
    <div class="tone" class:tone--uncertain={t.uncertain} role="listitem">
      <span class="tone-note">{t.note}<span class="o">{t.octave}</span></span>
      <span class="tone-cents">{t.cents} c</span>
    </div>
    {#if t.step}
      <div class="step">{t.step}</div>
    {/if}
  {/each}
</div>

<style>
  .tone-strip {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    padding-bottom: 8px;
    -webkit-overflow-scrolling: touch;
  }

  .tone {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 64px;
    padding: 12px 8px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .tone--uncertain { opacity: 0.5; }

  .tone-note {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 24px;
  }
  .tone-note .o {
    font-size: 0.55em;
    color: var(--muted);
    vertical-align: super;
  }
  .tone-cents {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }

  .step {
    flex: none;
    align-self: center;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    padding: 0 10px;
    white-space: nowrap;
  }
</style>
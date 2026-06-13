<script lang="ts">
  import type { Tone } from "./types";
  import ToneStrip from "./ToneStrip.svelte";

  let { tones }: { tones: Tone[] } = $props();
</script>

<section class="card analysis" aria-label="Rozbor melodie">
  <div class="analysis-head">
    <h2>Rozbor melodie</h2>
    <span class="badge">ukázková data</span>
  </div>

  <div class="key-row">
    <span class="key-label">nejbližší tónina</span>
    <span class="key-name">G&nbsp;dur</span>
    <span class="key-fit">odchylka 7&nbsp;c</span>
  </div>

  <ToneStrip {tones} />

  <p class="analysis-note">
    Každý tón ukazuje notu a odchylku od přesného ladění (v centech). Čísla mezi nimi
    jsou <b>kroky v půltónech</b> — tvar melodie nezávislý na tom, kde a jak „falešně“ začala.
  </p>
</section>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    padding: clamp(18px, 4vw, 28px);
    margin-bottom: 20px;
  }

  .analysis-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  .analysis-head h2 {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 20px;
  }
  .badge {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.05em;
    color: var(--muted);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    padding: 4px 11px;
    margin-left: auto;
  }

  .key-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    padding: 14px 16px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 14px;
    margin-bottom: 20px;
  }
  .key-label {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .key-name {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 22px;
  }
  .key-fit {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--accent-3);
    margin-left: auto;
  }

  .analysis-note {
    margin-top: 18px;
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1.6;
  }
  .analysis-note b { color: var(--text); font-weight: 600; }

  @media (max-width: 480px) {
    .key-fit { margin-left: 0; width: 100%; }
  }
</style>
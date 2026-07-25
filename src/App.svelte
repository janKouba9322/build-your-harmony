<script lang="ts">
  // App = conductor: holds the analysis results and wires the cards together.
  // Also owns the (tiny) page switch — no router needed for two pages.
  import Masthead from "./lib/Masthead.svelte";
  import RecorderCard from "./lib/RecorderCard.svelte";
  import AnalysisCard from "./lib/AnalysisCard.svelte";
  import AboutPage from "./lib/AboutPage.svelte";
  import type { Note, ChordSegment, KeyInfo } from "./lib/types";

  let notes: Note[] = $state([]);
  let keyInfo: KeyInfo | null = $state(null);
  let segments: ChordSegment[] = $state([]);
  let page: "app" | "about" = $state("app");
</script>

<main class="wrap">
  <Masthead />

  <nav class="pagenav" aria-label="Pages">
    <button
      class="pagenav-btn"
      class:active={page === "app"}
      onclick={() => (page = "app")}
    >
      Studio
    </button>
    <button
      class="pagenav-btn"
      class:active={page === "about"}
      onclick={() => (page = "about")}
    >
      About
    </button>
  </nav>

  {#if page === "app"}
    <RecorderCard
      onAnalysed={(n: Note[], k: KeyInfo | null, s: ChordSegment[]) => {
        notes = n;
        keyInfo = k;
        segments = s;
      }}
    />
    <AnalysisCard {notes} {keyInfo} {segments} />
  {:else}
    <AboutPage />
  {/if}

  <footer class="foot">
    <span class="foot-dot" aria-hidden="true"></span>
    Built between rehearsals.
  </footer>
</main>

<style>
  .wrap {
    width: 100%;
    max-width: var(--maxw);
    margin: 0 auto;
    padding: clamp(24px, 6vw, 56px) clamp(16px, 4vw, 32px) 48px;
  }

  /* --- page switch: two quiet mono tabs under the masthead --- */
  .pagenav {
    display: flex;
    gap: 6px;
    margin-bottom: clamp(18px, 4vw, 28px);
  }

  .pagenav-btn {
    font-family: var(--font-mono);
    font-size: 12.5px;
    letter-spacing: 0.04em;
    color: var(--muted);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 999px;
    padding: 6px 14px;
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .pagenav-btn:hover {
    color: var(--text);
  }

  .pagenav-btn.active {
    color: var(--accent);
    border-color: var(--line-strong);
    background: var(--surface);
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

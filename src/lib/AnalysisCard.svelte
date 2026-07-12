<script lang="ts">
  // Read-only analysis view: key, overview stats, chord progression, notes.
  // Pure display — App feeds it the results RecorderCard produced.
  import type { ChordSegment, KeyInfo, Note } from "./types";
  import {
    midiToName,
    keyLabel,
    degreeNumeral,
    chordLabel,
    chordUncertain,
  } from "./musicTheory";

  let {
    notes = [],
    keyInfo = null,
    segments = [],
  }: {
    notes: Note[];
    keyInfo: KeyInfo | null;
    segments: ChordSegment[];
  } = $props();

  // confidence 0–1 → level key (safe for CSS classes) + Czech label.
  // Levels map to the voice colors: certain=teal, maybe=amber, unsure=coral.
  type ConfLevel = "high" | "mid" | "low";
  function confidenceLevel(c: number): ConfLevel {
    if (c >= 0.66) return "high";
    if (c >= 0.33) return "mid";
    return "low";
  }
  const CONF_LABEL: Record<ConfLevel, string> = {
    high: "likely",
    mid: "maybe",
    low: "unsure",
  };

  function secs(t: number): string {
    return `${t.toFixed(1)} s`;
  }

  // derived summaries
  const hasResults = $derived(notes.length > 0 || segments.length > 0);
  const totalDuration = $derived(
    notes.length > 0 ? notes[notes.length - 1].endTime : 0,
  );
  const rangeText = $derived.by(() => {
    if (notes.length === 0) return "–";
    const midis = notes.map((n) => Math.round(n.avgMidifloat));
    return `${midiToName(Math.min(...midis))}–${midiToName(Math.max(...midis))}`;
  });
</script>

<section class="card" aria-label="Melody analysis">
  {#if !hasResults}
    <div class="empty">
      <span class="empty-mark" aria-hidden="true">♪</span>
      <p class="empty-title">No analysis yet</p>
      <p class="empty-sub">
        Record the melody and click "Done — analyze." The key, suggested chords,
        and recognized notes will then appear here.
      </p>
    </div>
  {:else}
    <!-- KEY -->
    {#if keyInfo}
      {@const level = confidenceLevel(keyInfo.confidence)}
      <div class="block">
        <div class="block-head">Key</div>
        <div class="key-row">
          <span class="key-name">{keyLabel(keyInfo.tonic, keyInfo.mode)}</span>
          <span class="conf conf--{level}">{CONF_LABEL[level]}</span>
        </div>
        <div class="conf-bar" aria-hidden="true">
          <div
            class="conf-fill conf-fill--{level}"
            style:width="{Math.round(keyInfo.confidence * 100)}%"
          ></div>
        </div>
      </div>
    {/if}

    <!-- OVERVIEW -->
    <div class="block">
      <div class="block-head">OVERVIEW</div>
      <div class="stats">
        <div class="stat">
          <span class="stat-val">{notes.length}</span>
          <span class="stat-key">notes</span>
        </div>
        <div class="stat">
          <span class="stat-val">{rangeText}</span>
          <span class="stat-key">range</span>
        </div>
        <div class="stat">
          <span class="stat-val">{secs(totalDuration)}</span>
          <span class="stat-key">length</span>
        </div>
        <div class="stat">
          <span class="stat-val">{segments.length}</span>
          <span class="stat-key">chords</span>
        </div>
      </div>
    </div>

    <!-- CHORD PROGRESSION -->
    {#if segments.length > 0 && keyInfo}
      <div class="block">
        <div class="block-head">Chord suggestion</div>
        <div class="chords">
          {#each segments as seg, i}
            {@const best = seg.candidates[0]}
            {@const uncertain = chordUncertain(seg)}
            <div class="chord" class:chord--uncertain={uncertain}>
              <div class="chord-num">
                {chordLabel(best, keyInfo.mode)}{#if uncertain}<span class="q"
                    >?</span
                  >{/if}
              </div>
              <div class="chord-name">
                {degreeNumeral(best.degree, keyInfo.mode)}
              </div>
              <div class="chord-time">{secs(seg.startTime)}</div>
              {#if uncertain && seg.candidates[1]}
                <div class="chord-alt">
                  or {chordLabel(seg.candidates[1], keyInfo.mode)} ({degreeNumeral(
                    seg.candidates[1].degree,
                    keyInfo.mode,
                  )})
                </div>
              {/if}
            </div>
            {#if i < segments.length - 1}
              <span class="arrow" aria-hidden="true">→</span>
            {/if}
          {/each}
        </div>
        <p class="block-hint">
          The chords are an estimate—a question mark and "or" indicate that
          multiple options fit equally well.
        </p>
      </div>
    {/if}

  {/if}
</section>

<style>
  /* card with a teal hairline — analysis is the "certainty" card */
  .card {
    position: relative;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    padding: clamp(18px, 4vw, 30px);
    margin-bottom: 20px;
    animation: rise 0.55s ease 0.16s both;
  }
  .card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent-3), transparent 65%);
    opacity: 0.7;
  }

  /* --- empty state --- */
  .empty {
    text-align: center;
    padding: clamp(10px, 3vw, 22px) 8px;
  }
  .empty-mark {
    display: block;
    font-family: var(--font-display);
    font-size: 40px;
    color: var(--uncertain);
    margin-bottom: 8px;
  }
  .empty-title {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 18px;
  }
  .empty-sub {
    margin: 8px auto 0;
    max-width: 44ch;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.7;
    color: var(--muted);
  }

  /* --- blocks with a staggered entrance --- */
  .block {
    margin-bottom: 28px;
    animation: rise 0.45s ease both;
  }
  .block:nth-of-type(2) {
    animation-delay: 0.07s;
  }
  .block:nth-of-type(3) {
    animation-delay: 0.14s;
  }
  .block:nth-of-type(4) {
    animation-delay: 0.21s;
  }
  .block:last-child {
    margin-bottom: 0;
  }
  .block-head {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 12px;
  }
  .block-hint {
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--muted);
    margin-top: 12px;
    line-height: 1.6;
  }

  /* --- key --- */
  .key-row {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .key-name {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(34px, 8vw, 46px);
    line-height: 1;
    color: var(--accent);
    letter-spacing: -0.02em;
  }
  .conf {
    font-family: var(--font-mono);
    font-size: 12.5px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .conf--high {
    color: var(--accent-3);
    background: color-mix(in srgb, var(--accent-3) 12%, transparent);
    border-color: color-mix(in srgb, var(--accent-3) 35%, transparent);
  }
  .conf--mid {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .conf--low {
    color: var(--accent-2);
    background: color-mix(in srgb, var(--accent-2) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent-2) 30%, transparent);
  }
  .conf-bar {
    margin-top: 14px;
    height: 5px;
    background: var(--raised);
    border-radius: 3px;
    overflow: hidden;
  }
  .conf-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .conf-fill--high {
    background: var(--accent-3);
  }
  .conf-fill--mid {
    background: var(--accent);
  }
  .conf-fill--low {
    background: var(--accent-2);
  }

  /* --- overview stats: raised metric tiles --- */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--r-ctl);
    padding: 12px 14px;
  }
  .stat-val {
    font-family: var(--font-mono);
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }
  .stat-key {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }

  /* --- chord progression flow --- */
  .chords {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chord {
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--r-ctl);
    padding: 12px 16px;
    min-width: 76px;
    transition:
      transform 0.15s ease,
      border-color 0.2s ease;
    text-align: center;
  }
  .chord:hover {
    transform: translateY(-2px);
    border-color: var(--line-strong);
  }
  .chord--uncertain {
    border-style: dashed;
  }
  .chord-num {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 22px;
    color: var(--accent);
    line-height: 1;
  }
  .chord--uncertain .chord-num {
    opacity: 0.7;
  }
  .q {
    font-size: 14px;
    color: var(--muted);
    margin-left: 3px;
  }
  .chord-name {
    font-family: var(--font-mono);
    font-size: 13.5px;
    color: var(--text);
    margin-top: 5px;
  }
  .chord-time {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
    margin-top: 6px;
  }
  .chord-alt {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--accent-2);
    margin-top: 5px;
  }
  .arrow {
    color: var(--uncertain);
    font-size: 15px;
    flex: none;
  }

</style>

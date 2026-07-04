<script lang="ts">
  // Read-only analysis view: key, notes overview, and chord progression.
  // Pure display — App feeds it the results RecorderCard produced.
  import type { KeyMode, Note } from "./types";
  import { pitchClassName, midiToName } from "./musicTheory";

  type ChordCandidate = {
    degree: number;
    pitchClasses: number[];
    score: number;
  };
  type Segment = {
    startTime: number;
    endTime: number;
    candidates: ChordCandidate[];
  };
  type KeyInfo = { tonic: number; mode: "major" | "minor"; confidence: number };

  let {
    notes = [],
    keyInfo = null,
    segments = [],
  }: {
    notes: Note[];
    keyInfo: KeyInfo | null;
    segments: Segment[];
  } = $props();

  // roman numerals per scale degree, case by chord quality within the key
  const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

  function numeral(degree: number, mode: KeyMode): string {
    const table = mode === "major" ? MAJOR_NUMERALS : MINOR_NUMERALS;
    return table[degree - 1] ?? "?";
  }

  // confidence 0–1 → human phrase (honest about uncertainty)
  function confidenceLabel(c: number): string {
    if (c >= 0.66) return "spíš jistě";
    if (c >= 0.33) return "možná";
    return "nejistě";
  }

  // key name from tonic pitch class + mode
  function keyName(k: KeyInfo): string {
    const mode = k.mode === "major" ? "dur" : "moll";
    return `${pitchClassName(k.tonic)} ${mode}`;
  }

  // chord name = root pitch-class name + quality suffix (rough, from the triad)
  function chordName(cand: ChordCandidate, mode: KeyMode): string {
    const root = pitchClassName(cand.pitchClasses[0]);
    const num = numeral(cand.degree, mode);
    // quality read from the numeral casing
    const isMinor = num === num.toLowerCase() && !num.includes("°");
    const isDim = num.includes("°");
    const suffix = isDim ? "dim" : isMinor ? "mi" : "";
    return `${root}${suffix ? " " + suffix : ""}`;
  }

  // seconds → "1.2 s"
  function secs(t: number): string {
    return `${t.toFixed(1)} s`;
  }

  // derived summaries
  const hasResults = $derived(notes.length > 0 || segments.length > 0);
  const noteCount = $derived(notes.length);
  const totalDuration = $derived(
    notes.length > 0 ? notes[notes.length - 1].endTime : 0,
  );
  // pitch range across the take
  const rangeText = $derived.by(() => {
    if (notes.length === 0) return "–";
    const midis = notes.map((n) => Math.round(n.avgMidifloat));
    const lo = Math.min(...midis);
    const hi = Math.max(...midis);
    return `${midiToName(lo)} – ${midiToName(hi)}`;
  });

  // is an alternative worth showing? (close second in the ranking)
  function altWorthShowing(seg: Segment): boolean {
    const c = seg.candidates;
    if (c.length < 2) return false;
    return c[0].score - c[1].score < 0.15 && c[1].score > 0.4;
  }
</script>

<section class="card" aria-label="Analýza melodie">
  {#if !hasResults}
    <p class="empty">Zatím nic k analýze — nahraj melodii a dej „Hotovo“.</p>
  {:else}
    <!-- KEY -->
    {#if keyInfo}
      <div class="block">
        <div class="block-head">Tónina</div>
        <div class="key-row">
          <span class="key-name">{keyName(keyInfo)}</span>
          <span class="conf conf--{confidenceLabel(keyInfo.confidence)}">
            {confidenceLabel(keyInfo.confidence)}
          </span>
        </div>
        <div class="conf-bar" aria-hidden="true">
          <div
            class="conf-fill"
            style:width="{Math.round(keyInfo.confidence * 100)}%"
          ></div>
        </div>
      </div>
    {/if}

    <!-- OVERVIEW -->
    <div class="block">
      <div class="block-head">Přehled</div>
      <div class="stats">
        <div class="stat">
          <span class="stat-val">{noteCount}</span>
          <span class="stat-key">tónů</span>
        </div>
        <div class="stat">
          <span class="stat-val">{rangeText}</span>
          <span class="stat-key">rozsah</span>
        </div>
        <div class="stat">
          <span class="stat-val">{secs(totalDuration)}</span>
          <span class="stat-key">délka</span>
        </div>
        <div class="stat">
          <span class="stat-val">{segments.length}</span>
          <span class="stat-key">úseků</span>
        </div>
      </div>
    </div>

    <!-- CHORD PROGRESSION -->
    {#if segments.length > 0 && keyInfo}
      <div class="block">
        <div class="block-head">Akordy</div>
        <div class="chords">
          {#each segments as seg}
            {@const best = seg.candidates[0]}
            <div class="chord">
              <div class="chord-num">{numeral(best.degree, keyInfo.mode)}</div>
              <div class="chord-name">{chordName(best, keyInfo.mode)}</div>
              <div class="chord-time">{secs(seg.startTime)}</div>
              {#if altWorthShowing(seg)}
                {@const alt = seg.candidates[1]}
                <div class="chord-alt">
                  nebo {chordName(alt, keyInfo.mode)}
                </div>
              {/if}
            </div>
          {/each}
        </div>
        <p class="chords-hint">
          Akordy jsou odhad — kde je „nebo“, sedělo víc možností podobně.
        </p>
      </div>
    {/if}

    <!-- NOTE LIST -->
    <div class="block">
      <div class="block-head">Tóny</div>
      <div class="note-list">
        {#each notes as note}
          <span
            class="note-chip"
            class:note-chip--faint={note.avgClarity < 0.8}
            title="{secs(note.startTime)} · {note.duration.toFixed(
              2,
            )} s · jistota {Math.round(note.avgClarity * 100)}%"
          >
            {midiToName(Math.round(note.avgMidifloat))}
          </span>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    padding: clamp(18px, 4vw, 28px);
    margin-bottom: 20px;
  }

  .empty {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
    text-align: center;
    margin: 8px 0;
  }

  .block {
    margin-bottom: 26px;
  }
  .block:last-child {
    margin-bottom: 0;
  }
  .block-head {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 12px;
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
    font-size: clamp(32px, 8vw, 44px);
    line-height: 1;
    color: var(--accent);
    letter-spacing: -0.02em;
  }
  .conf {
    font-family: var(--font-mono);
    font-size: 13px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .conf--spíš.jistě,
  .conf--spíš {
    color: var(--accent-3);
  }
  .conf-bar {
    margin-top: 12px;
    height: 4px;
    background: var(--raised, rgba(255, 255, 255, 0.06));
    border-radius: 2px;
    overflow: hidden;
  }
  .conf-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* --- overview stats --- */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 14px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stat-val {
    font-family: var(--font-mono);
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
  }
  .stat-key {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }

  /* --- chords --- */
  .chords {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .chord {
    background: var(--raised, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 16px;
    min-width: 72px;
  }
  .chord-num {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 22px;
    color: var(--accent);
    line-height: 1;
  }
  .chord-name {
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--text);
    margin-top: 4px;
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
    margin-top: 6px;
  }
  .chords-hint {
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--muted);
    margin-top: 12px;
    line-height: 1.5;
  }

  /* --- note list --- */
  .note-list {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .note-chip {
    font-family: var(--font-mono);
    font-size: 13px;
    padding: 4px 9px;
    border-radius: 8px;
    background: var(--raised, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--line);
    color: var(--text);
    cursor: default;
  }
  .note-chip--faint {
    color: var(--muted);
    opacity: 0.7;
  }
</style>

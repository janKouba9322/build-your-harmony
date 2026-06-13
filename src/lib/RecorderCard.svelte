<script lang="ts">
  // Lokální vizuální stav tlačítka — zatím jen přepíná popisek.
  // Skutečný mikrofon sem přijde později.
  let recording = $state(false);

  function toggle() {
    recording = !recording;
  }
</script>

<section class="card" aria-label="Nahrávání melodie">
  <div class="live-row">
    <div class="note-readout dim">–</div>
    <div class="live-meta">
      <div class="status">{recording ? "poslouchám… (zatím nezapojeno)" : "mikrofon vypnutý"}</div>
      <div class="legend">
        <span><i class="swatch swatch--on"></i>jistý tón</span>
        <span><i class="swatch swatch--off"></i>nejistý</span>
      </div>
    </div>
  </div>

  <canvas class="trace" aria-label="Živá stopa výšky hlasu"></canvas>

  <div class="controls">
    <button class="btn btn--primary" class:is-recording={recording} onclick={toggle}>
      {recording ? "Hotovo — zpracovat" : "Zapnout mikrofon"}
    </button>
    <button class="btn btn--ghost" disabled={!recording}>Začít znovu</button>
  </div>

  <p class="hint">
    Zpívej jeden tón po druhém, blízko mikrofonu. Nejde o to zazpívat „čistě“ —
    stačí, když sedí vzdálenosti mezi tóny.
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

  .live-row {
    display: flex;
    align-items: center;
    gap: clamp(16px, 4vw, 24px);
    flex-wrap: wrap;
  }

  .note-readout {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(56px, 14vw, 76px);
    line-height: 1;
    letter-spacing: -0.03em;
    min-width: 120px;
    transition: color 0.12s ease;
  }
  .note-readout.dim { color: var(--uncertain); }

  .live-meta { display: flex; flex-direction: column; gap: 10px; }

  .status {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
  }

  .legend {
    display: flex;
    gap: 16px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .legend span { display: inline-flex; align-items: center; gap: 7px; }
  .swatch { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .swatch--on { background: var(--accent); }
  .swatch--off { background: var(--uncertain); }

  .trace {
    width: 100%;
    height: 120px;
    display: block;
    margin-top: 22px;
    border-radius: 12px;
    background: var(--bg);
  }

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
    transition: transform 0.08s ease, background 0.15s ease, opacity 0.15s ease;
  }
  .btn:active { transform: translateY(1px); }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn--primary { background: var(--accent); color: #241a00; }
  .btn--primary.is-recording { background: var(--accent-2); color: #2a0d0a; }
  .btn--ghost { background: var(--raised); color: var(--text); }

  .hint {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--muted);
    margin-top: 18px;
    line-height: 1.55;
  }
</style>
<script lang="ts">
  // Fullscreen help overlay. Four steps, each with a small looping SVG demo
  // built from the app's own visual language (pitch trace, note bars, editing
  // cursor) rather than generic icons — so the help *shows* the app, not tells.
  // Closes via the ✕, the Escape key, or a click on the dim backdrop.
  let { open = false, onClose }: { open?: boolean; onClose: () => void } =
    $props();

  // Escape-to-close, wired only while the modal is open.
  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

{#if open}
  <div class="help-backdrop">
    <button class="help-backdrop-btn" aria-label="Close help" onclick={onClose}
    ></button>
    <div
      class="help-panel"
      role="dialog"
      aria-modal="true"
      aria-label="How to use Melody Finder"
    >
      <button class="help-close" aria-label="Close" onclick={onClose}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path
            d="M5 5 L15 15 M15 5 L5 15"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      </button>

      <div class="help-scroll">
        <header class="help-head">
          <span class="help-eyebrow">How it works</span>
          <h2 class="help-title">Four steps to harmony</h2>
          <p class="help-sub">
            Sing a line, let it be read back to you, shape it, and hear it.
            Short phrases work best — break a long melody into a few takes
            rather than singing it all at once. The app is honest about how sure
            it is — low-confidence guesses say so.
          </p>
        </header>

        <ol class="help-steps">
          <!-- STEP 1 — SING -->
          <li class="help-step">
            <div class="help-demo">
              <svg viewBox="0 0 120 64" aria-hidden="true" class="demo-svg">
                <line class="demo-grid" x1="0" y1="32" x2="120" y2="32" />
                <path
                  class="trace-draw"
                  d="M4 40 Q22 12 40 30 T78 24 T116 34"
                  fill="none"
                />
              </svg>
            </div>
            <div class="help-copy">
              <span class="help-num">01</span>
              <h3>Sing or hum</h3>
              <p>
                Turn on the mic and give it a melody, one note after another.
                Clean singing helps, but honest intervals matter more than a
                perfect tone.
              </p>
            </div>
          </li>

          <!-- STEP 2 — READ BACK -->
          <li class="help-step">
            <div class="help-demo">
              <svg viewBox="0 0 120 64" aria-hidden="true" class="demo-svg">
                <line class="demo-grid" x1="0" y1="32" x2="120" y2="32" />
                <g class="bars-rise">
                  <rect x="10" y="34" width="20" height="6" rx="3" />
                  <rect x="38" y="22" width="24" height="6" rx="3" />
                  <rect x="70" y="40" width="18" height="6" rx="3" />
                  <rect x="96" y="28" width="18" height="6" rx="3" />
                </g>
                <g class="chord-pop">
                  <rect x="10" y="6" width="25" height="13" rx="6" />
                  <rect x="38" y="6" width="55" height="13" rx="6" />
                  <rect x="96" y="6" width="55" height="13" rx="6" />
                </g>
              </svg>
            </div>
            <div class="help-copy">
              <span class="help-num">02</span>
              <h3>See it read back</h3>
              <p>
                Your line becomes notes on the grid. The app guesses the key and
                suggests chords — with a confidence it won't hide from you.
              </p>
            </div>
          </li>

          <!-- STEP 3 — EDIT -->
          <li class="help-step">
            <div class="help-demo">
              <svg viewBox="0 0 120 64" aria-hidden="true" class="demo-svg">
                <line class="demo-grid" x1="0" y1="32" x2="120" y2="32" />
                <rect
                  class="edit-bar"
                  x="40"
                  y="34"
                  width="34"
                  height="6"
                  rx="3"
                />
                <path
                  class="edit-cursor"
                  d="M0 0 L0 14 L4 10 L7 16 L9 15 L6 9 L11 9 Z"
                  transform="translate(52 35)"
                />
              </svg>
            </div>
            <div class="help-copy">
              <span class="help-num">03</span>
              <h3>Nudge it into shape</h3>
              <p>
                Tap a note to select it. Move its pitch with the arrows, drag
                its edges to retime it, or delete it — whatever the detection
                missed.
              </p>
            </div>
          </li>

          <!-- STEP 4 — PLAY -->
          <li class="help-step">
            <div class="help-demo">
              <svg viewBox="0 0 120 64" aria-hidden="true" class="demo-svg">
                <line class="demo-grid" x1="0" y1="32" x2="120" y2="32" />
                <g>
                  <rect
                    x="10"
                    y="34"
                    width="20"
                    height="6"
                    rx="3"
                    class="pb-bar"
                  />
                  <rect
                    x="38"
                    y="22"
                    width="24"
                    height="6"
                    rx="3"
                    class="pb-bar"
                  />
                  <rect
                    x="70"
                    y="40"
                    width="18"
                    height="6"
                    rx="3"
                    class="pb-bar"
                  />
                  <rect
                    x="96"
                    y="28"
                    width="18"
                    height="6"
                    rx="3"
                    class="pb-bar"
                  />
                </g>
                <line class="playhead" x1="0" y1="6" x2="0" y2="58" />
              </svg>
            </div>
            <div class="help-copy">
              <span class="help-num">04</span>
              <h3>Hear it back</h3>
              <p>
                Press play to hear your shaped melody. The same button stops it
                — loop until the line sits the way you want it.
              </p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  </div>
{/if}

<style>
  .help-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(12px, 4vw, 40px);
    background: rgba(8, 7, 14, 0.72);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    animation: help-fade 0.22s ease both;
  }

  @keyframes help-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* full-bleed invisible close target sitting behind the panel — a real
     <button> so it's keyboard-accessible with no a11y warnings to suppress */
  .help-backdrop-btn {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    cursor: default;
  }

  .help-panel {
    position: relative;
    z-index: 1; /* above the backdrop button, so clicks on the panel don't close */
    width: min(680px, 100%);
    max-height: 90vh;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--r-card);
    box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.7);
    animation: help-rise 0.34s cubic-bezier(0.2, 0.85, 0.25, 1) both;
  }

  /* the scrolling layer — padding lives here so content clears the edges, and
     its scrollbar is clipped by the rounded .help-panel wrapper above */
  .help-scroll {
    max-height: 90vh;
    overflow-y: auto;
    padding: clamp(20px, 5vw, 40px);
  }
  /* thin, inset scrollbar that stays clear of the rounded corners */
  .help-scroll::-webkit-scrollbar-track {
    margin: 16px 0;
  }

  @keyframes help-rise {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .help-close {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--raised);
    color: var(--muted);
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
    z-index: 3;
  }
  .help-close:hover {
    color: var(--accent);
    border-color: var(--accent);
    transform: rotate(90deg);
  }

  /* --- header --- */
  .help-head {
    margin-bottom: 26px;
    padding-right: 40px;
  }
  .help-eyebrow {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent-3);
  }
  .help-title {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(22px, 4vw, 30px);
    letter-spacing: -0.02em;
    margin: 6px 0 10px;
  }
  .help-sub {
    color: var(--muted);
    line-height: 1.6;
  }

  /* --- steps --- */
  .help-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .help-step {
    display: grid;
    grid-template-columns: 132px 1fr;
    gap: 18px;
    align-items: center;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--r-ctl);
    background: var(--well);
    opacity: 0;
    animation: help-rise 0.4s ease both;
  }
  /* staggered entrance so the steps cascade in */
  .help-step:nth-child(1) {
    animation-delay: 0.06s;
  }
  .help-step:nth-child(2) {
    animation-delay: 0.13s;
  }
  .help-step:nth-child(3) {
    animation-delay: 0.2s;
  }
  .help-step:nth-child(4) {
    animation-delay: 0.27s;
  }

  .help-demo {
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .demo-svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .demo-grid {
    stroke: var(--line-strong);
    stroke-width: 1;
    stroke-dasharray: 3 4;
  }

  .help-copy {
    position: relative;
  }
  .help-num {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--uncertain);
    letter-spacing: 0.1em;
  }
  .help-copy h3 {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 16px;
    margin: 2px 0 5px;
  }
  .help-copy p {
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1.55;
  }

  /* ============================================================
     Step demo animations — built from the app's own visuals.
     ============================================================ */

  /* 01 — pitch trace draws itself while the mic dot pulses */
  .trace-draw {
    stroke: var(--accent-2);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-dasharray: 200;
    stroke-dashoffset: 200;
    animation: trace-in 2.6s ease-in-out infinite;
  }
  @keyframes trace-in {
    0% {
      stroke-dashoffset: 200;
    }
    55% {
      stroke-dashoffset: 0;
    }
    85% {
      stroke-dashoffset: 0;
      opacity: 1;
    }
    100% {
      stroke-dashoffset: 0;
      opacity: 0;
    }
  }

  @keyframes mic-throb {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.9;
    }
    50% {
      transform: scale(1.5);
      opacity: 0.4;
    }
  }

  /* 02 — bars rise into place, then the chord chip pops above them */
  .bars-rise rect {
    fill: var(--accent);
    transform-box: fill-box;
    transform-origin: center;
    animation: bar-rise 3s ease-in-out infinite;
  }
  .bars-rise rect:nth-child(2) {
    animation-delay: 0.1s;
  }
  .bars-rise rect:nth-child(3) {
    animation-delay: 0.2s;
  }
  .bars-rise rect:nth-child(4) {
    animation-delay: 0.3s;
  }
  @keyframes bar-rise {
    0%,
    12% {
      transform: scaleX(0);
      opacity: 0;
    }
    30%,
    88% {
      transform: scaleX(1);
      opacity: 1;
    }
    100% {
      transform: scaleX(1);
      opacity: 0.15;
    }
  }
  .chord-pop rect {
    fill: color-mix(in srgb, var(--accent) 22%, transparent);
    stroke: var(--accent);
    stroke-width: 1;
    animation: chord-pop 3s ease-in-out infinite;
  }
  @keyframes chord-pop {
    0%,
    40% {
      opacity: 0;
      transform: translateY(4px);
    }
    55%,
    88% {
      opacity: 1;
      transform: none;
    }
    100% {
      opacity: 0;
    }
  }

  /* 03 — cursor drops onto a bar, it lights teal, then nudges up */
  .edit-bar {
    fill: var(--accent);
    transform-box: fill-box;
    transform-origin: center;
    animation: edit-bar 3.2s ease-in-out infinite;
  }
  @keyframes edit-bar {
    0%,
    30% {
      fill: var(--accent);
      transform: translateY(0);
    }
    45%,
    70% {
      fill: var(--accent-3);
      transform: translateY(0);
    }
    80%,
    100% {
      fill: var(--accent-3);
      transform: translateY(-8px);
    }
  }
  .edit-cursor {
    fill: var(--text);
    stroke: var(--bg);
    stroke-width: 0.5;
    animation: edit-cursor 3.2s ease-in-out infinite;
  }
  @keyframes edit-cursor {
    0% {
      transform: translate(70px 12px);
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    40% {
      transform: translate(52px 30px);
      opacity: 1;
    }
    75% {
      transform: translate(52px 30px);
    }
    80%,
    100% {
      transform: translate(52px 22px);
      opacity: 1;
    }
  }

  /* 04 — playhead sweeps across; each bar lights as it passes */
  .playhead {
    stroke: var(--accent);
    stroke-width: 2;
    animation: playhead-sweep 2.8s linear infinite;
  }
  @keyframes playhead-sweep {
    0% {
      transform: translateX(4px);
      opacity: 0;
    }
    8% {
      opacity: 1;
    }
    92% {
      opacity: 1;
    }
    100% {
      transform: translateX(116px);
      opacity: 0;
    }
  }
  .pb-bar {
    fill: var(--accent);
    animation: pb-bar 2.8s linear infinite;
  }
  .pb-bar:nth-child(1) {
    animation-delay: 0.15s;
  }
  .pb-bar:nth-child(2) {
    animation-delay: 0.75s;
  }
  .pb-bar:nth-child(3) {
    animation-delay: 1.5s;
  }
  .pb-bar:nth-child(4) {
    animation-delay: 2.1s;
  }
  @keyframes pb-bar {
    0%,
    100% {
      fill: var(--accent);
    }
    50% {
      fill: var(--accent-3);
    }
  }

  /* mobile: stack demo above copy */
  @media (max-width: 520px) {
    .help-step {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .help-demo {
      max-width: 180px;
    }
  }

  /* honor reduced-motion: freeze the demos in their resting state */
  @media (prefers-reduced-motion: reduce) {
    .trace-draw,
    .bars-rise rect,
    .chord-pop rect,
    .edit-bar,
    .edit-cursor,
    .playhead,
    .pb-bar {
      animation: none;
    }
    .trace-draw {
      stroke-dashoffset: 0;
    }
    .edit-cursor {
      opacity: 0;
    }
  }
</style>

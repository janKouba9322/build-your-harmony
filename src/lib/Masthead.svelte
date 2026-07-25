<header class="masthead">
  <span class="eyebrow">Voice → key → chords</span>

  <h1>Build Your Harmony<span class="dot">.</span></h1>

  <p class="lede">
    Sing a few notes of whatever's stuck in your head — the app helps you shape
    it into a song: <em class="hl hl--lead">a key</em>,
    <em class="hl hl--second">some chords</em>,
    <em class="hl hl--third">a harmony to grow from</em>.
  </p>

  <ul class="badges">
    <li>No AI</li>
    <li>No servers</li>
    <li>Nothing leaves your device</li>
  </ul>
</header>

<style>
  .masthead {
    margin-bottom: clamp(24px, 5vw, 40px);
    animation: rise 0.55s ease both;
  }

  /* small mono kicker — sets the app's "what it does" before the name lands */
  .eyebrow {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent-3);
    margin-bottom: 12px;
    opacity: 0;
    animation: rise 0.5s ease 0.1s both;
  }

  h1 {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(36px, 7.5vw, 58px);
    line-height: 0.98;
    letter-spacing: -0.03em;
    max-width: 12ch; /* forces a two-line break — reads as a wordmark, not a sentence */
  }

  .dot {
    display: inline-block;
    color: var(--accent);
    animation: dot-bounce 3.2s ease-in-out infinite;
  }
  @keyframes dot-bounce {
    0%,
    88%,
    100% {
      transform: none;
    }
    92% {
      transform: translateY(-0.09em) scale(1.06);
    }
    96% {
      transform: translateY(0.02em);
    }
  }

  /* primary line: brighter and larger than the rest so it carries the pitch */
  .lede {
    margin-top: 18px;
    max-width: 52ch;
    font-size: clamp(15px, 2.2vw, 17px);
    line-height: 1.6;
    color: var(--text);
    opacity: 0.9;
  }

  /* the three deliverables, tinted with the three voice colors */
  .hl {
    font-style: normal;
    font-weight: 600;
    white-space: nowrap;
  }
  .hl--lead {
    color: var(--accent);
  }
  .hl--second {
    color: var(--accent-2);
  }
  .hl--third {
    color: var(--accent-3);
  }

  /* privacy facts as compact mono chips — scannable, not buried in prose */
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 16px 0 0;
    padding: 0;
  }
  .badges li {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 11px;
    background: var(--surface);
  }
  .badges li::before {
    content: "·";
    color: var(--accent-3);
    margin-right: 6px;
  }

  @media (max-width: 560px) {
    h1 {
      max-width: none;
    }
  }
</style>

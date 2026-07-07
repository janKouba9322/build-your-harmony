<header class="masthead">
  <h1>Melody&nbsp;Finder<span class="dot">.</span></h1>
  <p class="tag">
    Sing a few notes — the app finds the melody, guesses the key, and suggests
    chords.
  </p>
</header>

<style>
  .masthead {
    margin-bottom: clamp(24px, 5vw, 40px);
    animation: rise 0.55s ease both;
  }

  h1 {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(38px, 8vw, 60px);
    line-height: 0.95;
    letter-spacing: -0.02em;
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

  .tag {
    margin-top: 14px;
    max-width: 46ch;
    font-size: 15px;
    line-height: 1.6;
    color: var(--muted);
  }
</style>

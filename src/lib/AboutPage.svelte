<script lang="ts">
  // About page: what the app is, who built it, where to find/support the dev.
  // Rendered instead of the recorder/analysis when the user switches pages.
  // Update the links below with your real profiles before deploying.
  const links = [
    { label: "GitHub", url: "https://github.com/your-username" },
    { label: "Instagram", url: "https://instagram.com/your-username" },
    { label: "Buy me a coffee", url: "https://buymeacoffee.com/your-username" },
  ];
</script>

<section class="card about">
  <h2>About the app</h2>
  <p>
    Melody Finder is a small tool for singers and bands. Hum or sing a melody
    and it detects the notes, guesses the key, and suggests chord progressions
    you can build on — a practice companion, not a finished-sound machine.
  </p>
  <p>
    Everything runs in your browser. The recording never leaves your device:
    no account, no server, no storage. The music-theory logic is written from
    scratch; pitch detection uses the McLeod method via the
    <code>pitchy</code> library.
  </p>

  <h2>About the developer</h2>
  <p>
    Built by a musician-developer who wanted a honest practice tool — one that
    admits how sure (or unsure) it is about what it heard, instead of
    pretending to be perfect.
  </p>

  <div class="links">
    {#each links as link}
      <a class="link-pill" href={link.url} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
    {/each}
  </div>
</section>

<style>
  .about {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: clamp(20px, 4vw, 32px);
    animation: rise 0.45s ease both;
  }

  h2 {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(19px, 3vw, 24px);
    margin-bottom: 10px;
  }

  h2 + p,
  p + p {
    margin-bottom: 18px;
  }

  p {
    line-height: 1.65;
    color: var(--text);
    max-width: 64ch;
  }

  p + h2 {
    margin-top: 26px;
  }

  code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--raised);
    padding: 1px 6px;
    border-radius: 6px;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 22px;
  }

  .link-pill {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--accent);
    text-decoration: none;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 7px 16px;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .link-pill:hover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
</style>

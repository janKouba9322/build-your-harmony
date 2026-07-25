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
    Build Your Harmony is a small tool for anyone who hums melodies they can't
    quite write down. There's no AI in here. When you sing, what happens is
    arithmetic: your voice vibrates at a certain speed, the app counts it to
    find a pitch, then measures how far each note sits from the one before — and
    reads those distances against patterns music has used for a very long time.
  </p>
  <p>
    Sometimes it hears wrong. Sometimes you'll sing a note that wasn't the one
    you meant either. Neither is a failure; it's just where the work starts. You
    shift a note, it re-reads the harmony, and between the two of you the melody
    turns up.
  </p>
  <h2>Why this exists</h2>
  <p>
    I'm a high-school student, I write code, and I play drums in a band — which
    lot of the time means being there when an idea turns up and nobody can quite
    put it into words, let alone pass it on to the others. This is my attempt at
    that problem.
  </p>
  <p>
    It's for people who hear music clearly but were never taught to write it
    down — who know a chord is right without knowing its name. Plenty of apps
    offer to close that gap by generating the whole song for you. This one won't
    do the work for you. It takes the idea you already had and turns it into
    notes and chords you can read — the creativity stays yours.
  </p>

  <div class="links">
    {#each links as link}
      <a
        class="link-pill"
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
      >
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

<script lang="ts">
  // App = "dirigent": jen poskládá komponenty dohromady.
  import Masthead from "./lib/Masthead.svelte";
  import RecorderCard from "./lib/RecorderCard.svelte";
  import AnalysisCard from "./lib/AnalysisCard.svelte";
  import { sampleTones } from "./lib/sampleData";
</script>

<div class="wrap">
  <Masthead />
  <RecorderCard />

  <footer class="foot">
    Nahrávka nikam neodchází · žádný účet, žádný server, žádné ukládání
  </footer>
</div>

<style>
  .wrap { width: 100%; max-width: var(--maxw); }

  .foot {
    margin-top: 36px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--muted);
  }
</style>
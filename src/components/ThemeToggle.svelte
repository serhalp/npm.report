<script lang="ts">
  import { Monitor, Moon, Sun } from "@lucide/svelte";
  import { initTheme, setThemeMode, themeState, type ThemeMode } from "#client/theme.svelte";

  const MODES: { mode: ThemeMode; label: string }[] = [
    { mode: "system", label: "System" },
    { mode: "light", label: "Light" },
    { mode: "dark", label: "Dark" },
  ];

  initTheme();
</script>

<div class="theme-toggle" role="group" aria-label="Theme">
  {#each MODES as option (option.mode)}
    <button
      class="theme-toggle__button"
      type="button"
      aria-label={`Use ${option.label.toLowerCase()} theme`}
      aria-pressed={themeState.mode === option.mode}
      title={`${option.label} theme`}
      onclick={() => setThemeMode(option.mode)}
    >
      {#if option.mode === "system"}
        <Monitor aria-hidden="true" size={16} strokeWidth={2} />
      {:else if option.mode === "light"}
        <Sun aria-hidden="true" size={16} strokeWidth={2} />
      {:else}
        <Moon aria-hidden="true" size={16} strokeWidth={2} />
      {/if}
    </button>
  {/each}
</div>

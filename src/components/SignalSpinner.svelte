<script lang="ts">
  interface Props {
    terminal?: boolean;
  }

  let { terminal = false }: Props = $props();
</script>

<span class="signal-spinner" class:signal-spinner--terminal={terminal} aria-hidden="true">
  <span class="signal-spinner__dot">•</span>
  <span class="signal-spinner__arc signal-spinner__arc--inner">)</span>
  <span class="signal-spinner__arc signal-spinner__arc--middle">)</span>
  <span class="signal-spinner__arc signal-spinner__arc--outer">)</span>
</span>

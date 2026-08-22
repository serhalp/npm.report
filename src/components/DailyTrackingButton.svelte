<script lang="ts">
  import { CalendarClock } from "@lucide/svelte";
  import type { ReportRerunScheduleStatus } from "../lib/reportHistory";
  import { parseOrNull, ReportRerunScheduleStatusSchema } from "../lib/schemas";

  interface Props {
    reportId: string | null;
    enabled?: boolean;
    alreadyTracked?: boolean;
    nextRunAt?: string | null;
    onToast?: (message: string) => void;
  }

  let {
    reportId,
    enabled = true,
    alreadyTracked = false,
    nextRunAt = null,
    onToast = () => {},
  }: Props = $props();

  let status = $state<"idle" | "saving" | "done" | "error">("idle");
  let message = $state("Package trust only.");
  let scheduledFor = $state<string | null>(null);
  let isTracking = $derived(alreadyTracked || status === "done");
  let effectiveNextRunAt = $derived(scheduledFor ?? nextRunAt);
  let compactNextRun = $derived(formatNextRun(effectiveNextRunAt));

  function formatNextRun(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.toISOString().slice(0, 16).replace("T", " ")}Z`;
  }

  async function trackDaily() {
    if (!reportId) return;
    status = "saving";
    message = "Enabling daily tracking…";
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/schedule-daily`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`Tracking failed (${response.status})`);
      const data = await response.json();
      if (!parseOrNull(ReportRerunScheduleStatusSchema, data)) {
        throw new Error("Tracking failed (unexpected response)");
      }
      const body = data as ReportRerunScheduleStatus;
      scheduledFor = body.nextRunAt;
      status = "done";
      onToast("Daily tracking enabled");
    } catch (reason) {
      status = "error";
      message = reason instanceof Error ? reason.message : "Tracking failed";
    }
  }
</script>

{#if enabled && reportId}
  {#if isTracking}
    <div
      class="tracking-status"
      role="status"
      aria-label={compactNextRun ? `Tracking daily, next run ${compactNextRun}` : "Tracking daily"}
    >
      <CalendarClock aria-hidden="true" size={15} strokeWidth={2} />
      <span class="tracking-status__label">Tracking daily</span>
      {#if compactNextRun && effectiveNextRunAt}
        <span class="tracking-status__separator" aria-hidden="true">·</span>
        <span class="tracking-status__next">
          next <time datetime={effectiveNextRunAt}>{compactNextRun}</time>
        </span>
      {/if}
    </div>
  {:else}
    <div class="schedule-cta">
      <button
        class="btn btn--ghost"
        type="button"
        onclick={trackDaily}
        disabled={status === "saving"}
      >
        <CalendarClock aria-hidden="true" size={15} strokeWidth={2} />
        Track daily
      </button>
      <span class:error={status === "error"}>{message}</span>
    </div>
  {/if}
{/if}

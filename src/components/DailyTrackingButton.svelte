<script lang="ts">
  import { CalendarClock } from "@lucide/svelte";
  import { formatCompactDateTime, formatDateTime } from "#client/dateFormatting";
  import type { ReportRerunScheduleStatus } from "#shared/reportHistory";
  import { parseOrNull, ReportRerunScheduleStatusSchema } from "#shared/schemas";

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
  let compactNextRun = $derived.by(() => {
    if (!effectiveNextRunAt || Number.isNaN(Date.parse(effectiveNextRunAt))) return null;
    return formatCompactDateTime(effectiveNextRunAt);
  });

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
      window.dispatchEvent(new Event("npm.report:tracked-orgs-changed"));
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
          next <time datetime={effectiveNextRunAt} title={formatDateTime(effectiveNextRunAt)}
            >{compactNextRun}</time
          >
        </span>
      {/if}
    </div>
  {:else}
    <div class="schedule-cta" aria-busy={status === "saving"}>
      <button
        class="btn btn--ghost"
        type="button"
        onclick={trackDaily}
        disabled={status === "saving"}
      >
        <CalendarClock aria-hidden="true" size={15} strokeWidth={2} />
        Track daily
      </button>
      <span
        class:error={status === "error"}
        role={status === "error" ? "alert" : "status"}
        aria-live={status === "error" ? "assertive" : "polite"}
        aria-atomic="true">{message}</span
      >
    </div>
  {/if}
{/if}

<script lang="ts">
  import { CalendarClock } from "@lucide/svelte";
  import type { ReportRerunScheduleStatus } from "../lib/reportHistory";

  interface Props {
    reportId: string | null;
    enabled?: boolean;
    onToast?: (message: string) => void;
  }

  let { reportId, enabled = true, onToast = () => {} }: Props = $props();

  let status = $state<"idle" | "saving" | "done" | "error">("idle");
  let message = $state("Package trust only.");

  async function trackDaily() {
    if (!reportId) return;
    status = "saving";
    message = "Enabling daily tracking…";
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/schedule-daily`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`Tracking failed (${response.status})`);
      const body = (await response.json()) as ReportRerunScheduleStatus;
      status = "done";
      message = `Next run ${new Date(body.nextRunAt).toISOString().slice(0, 10)}.`;
      onToast("Daily tracking enabled");
    } catch (reason) {
      status = "error";
      message = reason instanceof Error ? reason.message : "Tracking failed";
    }
  }
</script>

{#if enabled && reportId}
  <div class="schedule-cta">
    <button
      class="btn btn--ghost"
      type="button"
      onclick={trackDaily}
      disabled={status === "saving" || status === "done"}
    >
      <CalendarClock aria-hidden="true" size={15} strokeWidth={2} />
      {status === "done" ? "Tracking daily" : "Track daily"}
    </button>
    <span class:error={status === "error"}>{message}</span>
  </div>
{/if}

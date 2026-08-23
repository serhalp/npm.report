import type { ReportSocialRow } from "#db/schema";
import { OG_LOGICAL_HEIGHT, OG_LOGICAL_WIDTH } from "#server/og-image";

export const OG_LOGO_SOURCE = "app-logo";

export const OG_CARD_STYLES = `
  * { box-sizing: border-box; }
  .card {
    position: relative;
    display: flex;
    width: ${OG_LOGICAL_WIDTH}px;
    height: ${OG_LOGICAL_HEIGHT}px;
    overflow: hidden;
    background: #0d1117;
    color: #d7dde5;
    font-family: "IBM Plex Sans";
  }
  .wordmark {
    display: flex;
    align-items: center;
    color: #d7dde5;
    font-family: "IBM Plex Mono";
    font-size: 31px;
    font-weight: 600;
    letter-spacing: -0.7px;
    line-height: 1;
  }
  .wordmark img {
    width: 31px;
    height: 31px;
    margin: 2px 5px 0 8px;
  }
  .home-card {
    flex-direction: column;
    padding: 58px 64px 52px;
  }
  .home-rule {
    position: absolute;
    top: 119px;
    left: 64px;
    width: 1072px;
    height: 1px;
    background: #2b3543;
  }
  .home-copy {
    position: absolute;
    top: 184px;
    left: 64px;
    display: flex;
    width: 720px;
    flex-direction: column;
    gap: 21px;
  }
  .home-title {
    font-size: 61px;
    font-weight: 600;
    letter-spacing: -1.8px;
    line-height: 1.06;
  }
  .home-subtitle {
    display: flex;
    align-items: baseline;
    gap: 11px;
    color: #95a1b0;
    font-family: "IBM Plex Mono";
    font-size: 25px;
    letter-spacing: -0.3px;
    line-height: 1.35;
  }
  .home-caret {
    flex: 0 0 auto;
    color: #d7dde5;
  }
  .home-mark {
    position: absolute;
    top: 165px;
    right: 52px;
    width: 310px;
    height: 310px;
  }
  .home-spectrum {
    position: absolute;
    right: 64px;
    bottom: 52px;
    left: 64px;
    display: flex;
    height: 13px;
    overflow: hidden;
    border: 1px solid #2b3543;
    border-radius: 3px;
    background: #151b24;
  }
  .home-spectrum span:nth-child(1) { width: 16%; background: #c9a0dc; }
  .home-spectrum span:nth-child(2) { width: 24%; background: #d8a657; }
  .home-spectrum span:nth-child(3) { width: 28%; background: #5fb3b3; }
  .home-spectrum span:nth-child(4) { width: 32%; background: #e07a5f; }
  .report-card {
    flex-direction: column;
    padding: 50px 56px 48px;
  }
  .report-card::after {
    position: absolute;
    inset: 18px;
    border: 1px solid #20272f;
    border-radius: 4px;
    content: "";
  }
  .report-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .snapshot {
    display: flex;
    align-items: baseline;
    gap: 7px;
    color: #a08049;
    font-family: "IBM Plex Mono";
    font-size: 18px;
    font-weight: 400;
    letter-spacing: 0.3px;
    line-height: 1;
    white-space: nowrap;
  }
  .snapshot-packages {
    color: #d8a657;
    font-weight: 600;
  }
  .audit-title {
    display: flex;
    width: 100%;
    min-width: 0;
    margin-top: 8px;
    align-items: center;
    gap: 16px;
    font-family: "IBM Plex Mono";
    font-size: 50px;
    line-height: 1;
  }
  .audit-caret {
    flex: 0 0 auto;
    color: #95a1b0;
    font-weight: 400;
  }
  .audit-org {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    color: #d7dde5;
    font-size: inherit;
    font-weight: 600;
    letter-spacing: -0.5px;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .trend {
    position: absolute;
    top: 204px;
    right: 56px;
    left: 56px;
    display: flex;
    height: 203px;
    flex-direction: column;
    gap: 5px;
  }
  .trend-head,
  .trend-legend,
  .trend-key,
  .trend-dates {
    display: flex;
    align-items: center;
  }
  .trend-head {
    justify-content: space-between;
  }
  .trend-title,
  .trend-legend,
  .trend-dates {
    color: #758296;
    font-family: "IBM Plex Mono";
    font-size: 12px;
    line-height: 1;
  }
  .trend-title {
    color: #95a1b0;
  }
  .trend-legend {
    gap: 17px;
  }
  .trend-key {
    gap: 6px;
  }
  .trend-key-line {
    width: 18px;
    border-top: 2px solid;
  }
  .trend-key-line--strong { border-color: #8fbf7f; }
  .trend-key-line--any { border-color: #5fb3b3; border-top-style: dashed; }
  .trend-key-line--none { border-color: #e07a5f; border-top-style: dotted; }
  .trend svg {
    display: block;
    width: 100%;
    height: 162px;
  }
  .trend-dates {
    justify-content: space-between;
  }
  .trust-block {
    position: absolute;
    right: 56px;
    bottom: 48px;
    left: 56px;
    display: flex;
    flex-direction: column;
  }
  .strong-summary {
    display: flex;
    width: 530px;
    height: 16px;
    align-items: center;
    justify-content: center;
    gap: 9px;
    color: #8fbf7f;
    font-family: "IBM Plex Mono";
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  }
  .strong-summary-line {
    display: flex;
    width: 100%;
    justify-content: center;
    padding-bottom: 3px;
    border-bottom: 1px solid #8fbf7f;
  }
  .distribution {
    display: flex;
    height: 14px;
    margin-top: 12px;
    overflow: hidden;
    border: 1px solid #2b3543;
    border-radius: 3px;
    background: #151b24;
  }
  .metrics {
    display: flex;
    margin-top: 7px;
    gap: 12px;
  }
  .metric {
    display: flex;
    width: 259px;
    height: 111px;
    padding: 14px 18px 13px;
    border: 1px solid #2b3543;
    border-radius: 4px;
    background: #11161e;
    flex-direction: column;
    justify-content: space-between;
  }
  .metric-label {
    color: #95a1b0;
    font-family: "IBM Plex Mono";
    font-size: 15px;
    font-weight: 400;
    letter-spacing: 1.2px;
    line-height: 1.25;
    text-transform: uppercase;
  }
  .metric-values {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 24px;
    color: #d7dde5;
  }
  .metric-count {
    color: inherit;
    font-family: "IBM Plex Mono";
    font-size: 42px;
    font-weight: 600;
    line-height: 1;
  }
  .metric-percent {
    color: inherit;
    font-family: "IBM Plex Mono";
    font-size: 28px;
    font-weight: 400;
    line-height: 1;
  }
  .metric--staged .metric-values { color: #c9a0dc; }
  .metric--trusted .metric-values { color: #d8a657; }
  .metric--provenance .metric-values { color: #5fb3b3; }
  .metric--risk { border-color: rgba(224, 122, 95, 0.4); }
  .metric--risk .metric-values { color: #e07a5f; }
  .plain-mark {
    position: absolute;
    right: 56px;
    bottom: 48px;
    width: 190px;
    height: 190px;
  }
  .plain-rule {
    position: absolute;
    right: 285px;
    bottom: 62px;
    left: 56px;
    height: 2px;
    background: #d8a657;
  }
`;

const TRUST_LEVELS = [
  {
    key: "stagedPublish",
    label: "Staged publish",
    color: "#c9a0dc",
    variant: "staged",
  },
  {
    key: "trustedPublisher",
    label: "Trusted publisher",
    color: "#d8a657",
    variant: "trusted",
  },
  {
    key: "provenance",
    label: "Provenance only",
    color: "#5fb3b3",
    variant: "provenance",
  },
  { key: "none", label: "No trust signal", color: "#e07a5f", variant: "risk" },
] as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function wordmark(): string {
  return `<div class="wordmark"><span>npm</span><img src="${OG_LOGO_SOURCE}" /><span>report</span></div>`;
}

function percentage(count: number, total: number): string {
  const value = total > 0 ? (count / total) * 100 : 0;
  return `${value.toFixed(Number.isInteger(value) ? 0 : 1)}%`;
}

function widthPercentage(count: number, total: number): string {
  return total > 0 ? `${(count / total) * 100}%` : "0%";
}

function shortDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function auditedOn(date: Date | null): string {
  if (!date) return "audited";
  const iso = date.toISOString();
  return `audited on ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function snapshotHtml(report: ReportSocialRow): string {
  const packages = report.trust
    ? `<span class="snapshot-packages">${report.trust.total.toLocaleString("en-US")} packages</span>`
    : "";
  return `${packages}<span>${auditedOn(report.createdAt)}</span>`;
}

function trendHtml(history: ReportSocialRow["history"]): string {
  if (history.length <= 1) return "";

  const width = 1088;
  const plotTop = 3;
  const plotBottom = 61;
  const firstTime = history[0].capturedAt.getTime();
  const lastTime = history.at(-1)!.capturedAt.getTime();
  const xAt = (index: number): number => {
    if (lastTime <= firstTime) return (index / (history.length - 1)) * width;
    return ((history[index].capturedAt.getTime() - firstTime) / (lastTime - firstTime)) * width;
  };
  const yAt = (value: number): number => plotTop + (1 - value / 100) * (plotBottom - plotTop);
  const line = (count: (point: ReportSocialRow["history"][number]) => number): string =>
    history
      .map((point, index) => {
        const value = point.total > 0 ? (count(point) / point.total) * 100 : 0;
        return `${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`;
      })
      .join(" ");

  const strong = line((point) => point.byLevel.stagedPublish + point.byLevel.trustedPublisher);
  const any = line((point) => point.total - point.byLevel.none);
  const none = line((point) => point.byLevel.none);
  const grid = [0, 50, 100]
    .map(
      (value) =>
        `<line x1="0" x2="${width}" y1="${yAt(value)}" y2="${yAt(value)}" stroke="#20272f" stroke-width="1" />`,
    )
    .join("");

  return `<div class="trend">
    <div class="trend-head">
      <span class="trend-title">Progress over time</span>
      <div class="trend-legend">
        <span class="trend-key"><span class="trend-key-line trend-key-line--strong"></span>Strong trust</span>
        <span class="trend-key"><span class="trend-key-line trend-key-line--any"></span>Any trust</span>
        <span class="trend-key"><span class="trend-key-line trend-key-line--none"></span>No trust signal</span>
      </div>
    </div>
    <svg viewBox="0 0 ${width} 64">${grid}
      <polyline points="${strong}" fill="none" stroke="#8fbf7f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
      <polyline points="${any}" fill="none" stroke="#5fb3b3" stroke-width="2.2" stroke-dasharray="7 4" stroke-linejoin="round" stroke-linecap="round" />
      <polyline points="${none}" fill="none" stroke="#e07a5f" stroke-width="2.2" stroke-dasharray="1 5" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
    <div class="trend-dates"><span>${shortDate(history[0].capturedAt)}</span><span>${shortDate(history.at(-1)!.capturedAt)}</span></div>
  </div>`;
}

export function homeCardHtml(): string {
  return `<div class="card home-card">
    ${wordmark()}
    <div class="home-rule"></div>
    <div class="home-copy">
      <div class="home-title">Supply-chain trust signals<br />for npm orgs.</div>
      <div class="home-subtitle"><span class="home-caret">&gt;</span><span>Audit, visualize, share, track over time.</span></div>
    </div>
    <img class="home-mark" src="${OG_LOGO_SOURCE}" />
    <div class="home-spectrum"><span></span><span></span><span></span><span></span></div>
  </div>`;
}

export function reportCardHtml(report: ReportSocialRow): string {
  const orgLabel = report.orgs.length > 96 ? `${report.orgs.slice(0, 95)}…` : report.orgs;
  const safeOrgs = escapeHtml(orgLabel);
  const titleSize = orgLabel.length > 36 ? 30 : orgLabel.length > 20 ? 40 : 50;
  const title = `<div class="audit-title" style="font-size:${titleSize}px">
    <span class="audit-caret">&gt;</span><span class="audit-org">${safeOrgs}</span>
  </div>`;

  if (!report.trust) {
    return `<div class="card report-card">
      <div class="report-top">${wordmark()}<div class="snapshot">${snapshotHtml(report)}</div></div>
      ${title}
      <div class="plain-rule"></div><img class="plain-mark" src="${OG_LOGO_SOURCE}" />
    </div>`;
  }

  const { total, byLevel } = report.trust;
  const distribution = TRUST_LEVELS.map(
    (level) =>
      `<span style="width:${widthPercentage(byLevel[level.key], total)};background:${level.color}"></span>`,
  ).join("");
  const strongTrust = byLevel.stagedPublish + byLevel.trustedPublisher;
  const strongSummary = `<div class="strong-summary"><span class="strong-summary-line">Strong trust · ${strongTrust.toLocaleString("en-US")} · ${percentage(strongTrust, total)}</span></div>`;
  const metrics = TRUST_LEVELS.map((level) => {
    const count = byLevel[level.key];
    return `<div class="metric metric--${level.variant}">
      <div class="metric-label">${level.label}</div>
      <div class="metric-values"><span class="metric-count">${count.toLocaleString("en-US")}</span><span class="metric-percent">${percentage(count, total)}</span></div>
    </div>`;
  }).join("");

  return `<div class="card report-card">
    <div class="report-top">${wordmark()}<div class="snapshot">${snapshotHtml(report)}</div></div>
    ${title}
    ${trendHtml(report.history)}
    <div class="trust-block">${strongSummary}<div class="metrics">${metrics}</div><div class="distribution">${distribution}</div></div>
  </div>`;
}

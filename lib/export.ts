import { toPng } from "html-to-image";
import { formatTokens, formatRequests } from "./format";

// ─── CSV Export ────────────────────────────────────

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

interface CSVExportOptions {
  models: Array<{
    display_name: string;
    brand: string;
    provider?: string;
    is_own?: boolean;
    permaslug: string;
  }>;
  dates: string[];
  data: Record<string, Record<string, number | null>>;
  events: Array<{
    permaslug: string;
    event_date: string;
    label: string;
    event_type?: string;
  }>;
  metric: "tokens" | "requests";
}

export function exportTableCSV(opts: CSVExportOptions, filename: string): void {
  const { models, dates, data, events, metric } = opts;
  const fmt = metric === "tokens" ? formatTokens : formatRequests;

  const dateCols = dates.map((d) => d.slice(5)); // MM-DD
  const headers = ["模型", "公司", "Provider", "累计", "备注", ...dateCols];

  const rows = models.map((m) => {
    const rowData = data[m.permaslug] ?? {};
    let cumulative = 0;
    for (const d of dates) {
      const v = rowData[d];
      if (v != null) cumulative += v;
    }

    const modelEvents = events.filter((e) => e.permaslug === m.permaslug);
    const start = dates[0] ?? "";
    const end = dates[dates.length - 1] ?? "";
    const remark = modelEvents
      .filter(
        (e) =>
          (e.event_type === "free_to_paid" || e.event_type === "new_release") &&
          e.event_date >= start &&
          e.event_date <= end
      )
      .map((e) => `${e.event_date.slice(5)} ${e.label}`)
      .join(" / ");

    return [
      m.is_own ? `⭐ ${m.display_name}` : m.display_name,
      m.brand,
      m.provider ?? "—",
      cumulative > 0 ? fmt(cumulative) : "—",
      remark || "—",
      ...dates.map((d) => {
        const v = rowData[d];
        return v != null ? fmt(v) : "";
      }),
    ];
  });

  const csv = [headers, ...rows]
    .map((r) => r.map((cell) => escapeCSV(String(cell))).join(","))
    .join("\n");

  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  triggerDownload(blob, filename);
}

// ─── PNG Export ────────────────────────────────────

export async function exportElementPNG(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const dataUrl = await toPng(element, {
    backgroundColor: "#FFFFFF",
    pixelRatio: 2,
  });
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

// ─── Helpers ───────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildExportFilename(
  page: string,
  startDate: string,
  endDate: string,
  ext: string
): string {
  return `model_tracker_${page}_${startDate}_to_${endDate}.${ext}`;
}

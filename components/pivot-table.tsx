"use client";

import { useState, useMemo } from "react";
import { formatTokens, formatRequests } from "@/lib/format";
import { t } from "@/lib/i18n";

// ─── Types ─────────────────────────────────────────

export interface PivotModel {
  id: number;
  permaslug: string;
  display_name: string;
  brand: string;
  provider?: string;
  is_own?: boolean;
  current_status?: string;
  color_hex?: string;
}

export interface PivotEvent {
  permaslug: string;
  event_date: string;
  label: string;
  event_type?: string;
}

export interface PivotTableProps {
  models: PivotModel[];
  dates: string[];               // sorted YYYY-MM-DD
  metric: "tokens" | "requests";
  /** permaslug → date → value (null = missing) */
  data: Record<string, Record<string, number | null>>;
  events: PivotEvent[];
  /** model id → data-source platforms (e.g. ["anyint","zenmux"]) */
  platforms?: Record<number, string[]>;
}

// ─── Helpers ───────────────────────────────────────

function fmtDate(d: string): string {
  return d.slice(5); // 'YYYY-MM-DD' → 'MM-DD'
}

// data-source key → display name
const PLATFORM_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  anyint: "AnyInt",
  zenmux: "ZenMux",
};

function formatPlatforms(sources: string[] | undefined): string {
  if (!sources || sources.length === 0) return "—";
  return sources.map((s) => PLATFORM_LABELS[s] ?? s).join(", ");
}

function generateRemark(events: PivotEvent[], dates: string[]): string {
  const start = dates[0] ?? "";
  const end = dates[dates.length - 1] ?? "";
  const relevant = events
    .filter(
      (e) =>
        (e.event_type === "free_to_paid" || e.event_type === "new_release") &&
        e.event_date >= start &&
        e.event_date <= end
    )
    .map((e) => `${e.event_date.slice(5)} ${e.label}`);
  return relevant.join(" / ");
}

type SortKey = "cumulative" | string;
type SortDir = "asc" | "desc";

// ─── Component ─────────────────────────────────────

export function PivotTable({
  models,
  dates,
  metric,
  data,
  events,
  platforms,
}: PivotTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("cumulative");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showDaily, setShowDaily] = useState(false);

  const fmt = metric === "tokens" ? formatTokens : formatRequests;

  // Cumulative per model
  const cumulativeMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of models) {
      const vals = data[m.permaslug] ?? {};
      let sum = 0;
      for (const d of dates) {
        const v = vals[d];
        if (v != null) sum += v;
      }
      map[m.permaslug] = sum;
    }
    return map;
  }, [models, data, dates]);

  // Remark per model
  const remarkMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of models) {
      const modelEvents = events.filter((e) => e.permaslug === m.permaslug);
      map[m.permaslug] = generateRemark(modelEvents, dates);
    }
    return map;
  }, [models, events, dates]);

  // Sort rows (is_own always on top)
  const sortedModels = useMemo(() => {
    const ownModels = models.filter((m) => m.is_own);
    const otherModels = models.filter((m) => !m.is_own);

    const sorted = [...otherModels].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "cumulative") {
        cmp = (cumulativeMap[a.permaslug] ?? 0) - (cumulativeMap[b.permaslug] ?? 0);
      } else {
        const va = data[a.permaslug]?.[sortKey] ?? -Infinity;
        const vb = data[b.permaslug]?.[sortKey] ?? -Infinity;
        cmp = (va as number) - (vb as number);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return [...ownModels, ...sorted];
  }, [models, sortKey, sortDir, cumulativeMap, data]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  if (models.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-[#6B7785]">
        {t.common.noData}
      </div>
    );
  }

  const dateRangeLabel =
    dates.length > 0
      ? `${fmtDate(dates[0])} ~ ${fmtDate(dates[dates.length - 1])}`
      : "";

  return (
    <div className="overflow-x-auto rounded-xl">
      <table className="text-sm w-max min-w-full border-collapse">
        {/* Header */}
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-[#E8EEF7]">
            {/* Model — sticky */}
            <th className="text-left py-3 px-4 font-medium text-[#6B7785] w-[200px] min-w-[200px] bg-white sticky left-0 z-20 border-r border-[#E8EEF7]">
              {t.table.model}
            </th>
            <th className="text-left py-3 px-4 font-medium text-[#6B7785] w-[80px] min-w-[80px]">
              {t.table.brand}
            </th>
            <th className="text-left py-3 px-4 font-medium text-[#6B7785] w-[100px] min-w-[100px]">
              {t.table.provider}
            </th>

            {/* Platform — data source(s) */}
            <th className="text-left py-3 px-4 font-medium text-[#6B7785] w-[120px] min-w-[120px]">
              {t.table.platform}
            </th>

            {/* Cumulative — right after fixed cols */}
            <th
              className="text-right py-3 px-4 font-medium text-[#6B7785] w-[100px] min-w-[100px] cursor-pointer select-none hover:text-[#5B8DEF] transition-colors"
              onClick={() => toggleSort("cumulative")}
            >
              {t.table.cumulative}{sortArrow("cumulative")}
            </th>

            {/* Remark */}
            <th className="text-left py-3 px-4 font-medium text-[#6B7785] w-[200px] min-w-[200px]">
              {t.table.remark}
            </th>

            {/* Daily toggle header */}
            <th
              className="text-left py-3 px-4 font-medium text-[#5B8DEF] cursor-pointer select-none whitespace-nowrap"
              onClick={() => setShowDaily((v) => !v)}
            >
              <span className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className={`transition-transform ${showDaily ? "rotate-90" : ""}`}
                >
                  <path
                    d="M5 3L9 7L5 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {showDaily
                  ? `逐日明细 ${dateRangeLabel}`
                  : `展开逐日明细 (${dates.length}天)`}
              </span>
            </th>

            {/* Date columns — only when expanded */}
            {showDaily &&
              dates.map((d) => (
                <th
                  key={d}
                  className="text-right py-3 px-3 font-medium text-[#6B7785] w-[80px] min-w-[80px] cursor-pointer select-none hover:text-[#5B8DEF] transition-colors"
                  onClick={() => toggleSort(d)}
                >
                  {fmtDate(d)}{sortArrow(d)}
                </th>
              ))}
          </tr>
        </thead>

        <tbody>
          {sortedModels.map((m) => {
            const rowData = data[m.permaslug] ?? {};
            const cumulative = cumulativeMap[m.permaslug] ?? 0;
            const remark = remarkMap[m.permaslug] ?? "";

            return (
              <tr
                key={m.permaslug}
                className={`border-b border-[#E8EEF7] transition-colors ${
                  m.is_own
                    ? "bg-[#FFF8E1] hover:bg-[#FFF3CC]"
                    : "bg-white hover:bg-[#F0F4F8]"
                }`}
              >
                {/* Model name — sticky left */}
                <td
                  className={`py-3 px-4 font-medium text-[#1A2332] sticky left-0 z-10 border-r border-[#E8EEF7] ${
                    m.is_own ? "bg-[#FFF8E1]" : "bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: m.color_hex ?? "#94A0AE" }}
                    />
                    <span className="truncate">
                      {m.is_own && "⭐ "}
                      {m.display_name}
                    </span>
                  </div>
                </td>

                {/* Brand */}
                <td className="py-3 px-4 text-[#6B7785]">{m.brand}</td>

                {/* Provider */}
                <td className="py-3 px-4 text-[#6B7785] max-w-[140px]">
                  {(() => {
                    if (!m.provider) return "—";
                    const parts = m.provider.split(",").map((s) => s.trim());
                    if (parts.length === 1) return parts[0];
                    return (
                      <span title={m.provider} className="cursor-default">
                        {parts[0]} 等{parts.length}家
                      </span>
                    );
                  })()}
                </td>

                {/* Platform — data source(s) */}
                <td className="py-3 px-4 text-[#6B7785] whitespace-nowrap">
                  {formatPlatforms(platforms?.[m.id])}
                </td>

                {/* Cumulative */}
                <td className="py-3 px-4 text-right font-mono font-semibold text-[#1A2332]">
                  {cumulative > 0 ? fmt(cumulative) : (
                    <span className="text-[#94A0AE]">—</span>
                  )}
                </td>

                {/* Remark */}
                <td className="py-3 px-4 text-[#6B7785] text-xs">
                  {remark || "—"}
                </td>

                {/* Toggle column spacer — shows mini sparkline-style summary when collapsed */}
                <td className="py-3 px-4 text-[#94A0AE] text-xs whitespace-nowrap">
                  {!showDaily && dates.length > 0 && (
                    <MiniSparkText
                      values={dates.map((d) => rowData[d])}
                      fmt={fmt}
                    />
                  )}
                </td>

                {/* Date cells — only when expanded */}
                {showDaily &&
                  dates.map((d) => {
                    const val = rowData[d];
                    return (
                      <td
                        key={d}
                        className="py-3 px-3 text-right font-mono text-[#1A2332]"
                      >
                        {val != null ? fmt(val) : (
                          <span className="text-[#94A0AE]">—</span>
                        )}
                      </td>
                    );
                  })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mini spark summary (collapsed state) ──────────

function MiniSparkText({
  values,
  fmt,
}: {
  values: (number | null | undefined)[];
  fmt: (n: number) => string;
}) {
  const nums = values.filter((v): v is number => v != null && v > 0);
  if (nums.length === 0) return <span>—</span>;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const latest = nums[nums.length - 1];

  return (
    <span className="text-[#6B7785]">
      最低 {fmt(min)} · 最高 {fmt(max)} · 最近 {fmt(latest)}
    </span>
  );
}

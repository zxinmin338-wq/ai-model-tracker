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
}

// ─── Helpers ───────────────────────────────────────

function fmtDate(d: string): string {
  // 'YYYY-MM-DD' → 'MM-DD'
  return d.slice(5);
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

type SortKey = "cumulative" | string; // 'cumulative' or a date string
type SortDir = "asc" | "desc";

// ─── Component ─────────────────────────────────────

export function PivotTable({
  models,
  dates,
  metric,
  data,
  events,
}: PivotTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("cumulative");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
        // Sort by a specific date column
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

  return (
    <div className="overflow-x-auto border border-[#E8EEF7] rounded-xl">
      <table className="text-sm w-max min-w-full border-collapse">
        {/* Sticky header */}
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-[#E8EEF7]">
            {/* Fixed columns */}
            <th className="text-left py-3 px-4 font-medium text-[#6B7785] w-[200px] min-w-[200px] bg-white sticky left-0 z-20 border-r border-[#E8EEF7]">
              {t.table.model}
            </th>
            <th className="text-left py-3 px-4 font-medium text-[#6B7785] w-[80px] min-w-[80px]">
              {t.table.brand}
            </th>
            <th className="text-left py-3 px-4 font-medium text-[#6B7785] w-[100px] min-w-[100px]">
              {t.table.provider}
            </th>

            {/* Date columns */}
            {dates.map((d) => (
              <th
                key={d}
                className="text-right py-3 px-3 font-medium text-[#6B7785] w-[80px] min-w-[80px] cursor-pointer select-none hover:text-[#5B8DEF] transition-colors"
                onClick={() => toggleSort(d)}
              >
                {fmtDate(d)}{sortArrow(d)}
              </th>
            ))}

            {/* Cumulative */}
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
                    {m.current_status && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-md shrink-0 ${
                          m.current_status === "free"
                            ? "bg-[#E8EEF7] text-[#5B8DEF]"
                            : m.current_status === "paid"
                            ? "bg-[#F0F4F8] text-[#6B7785]"
                            : m.current_status === "transitioning"
                            ? "bg-[#FFF3E0] text-[#F0A856]"
                            : "bg-[#FDECEA] text-[#E85B81]"
                        }`}
                      >
                        {t.status[m.current_status] ?? m.current_status}
                      </span>
                    )}
                  </div>
                </td>

                {/* Brand */}
                <td className="py-3 px-4 text-[#6B7785]">{m.brand}</td>

                {/* Provider */}
                <td className="py-3 px-4 text-[#6B7785]">
                  {m.provider || "—"}
                </td>

                {/* Date cells */}
                {dates.map((d) => {
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

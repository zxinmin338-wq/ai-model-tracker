"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatTokens, formatRequests } from "@/lib/format";
import type { ModelWithUsage, EventRecord } from "@/lib/queries";

type SortKey = "tokens_7d" | "growth";
type SortDir = "asc" | "desc";

export function HomeClient({
  models,
  recentEvents,
}: {
  models: ModelWithUsage[];
  recentEvents: EventRecord[];
}) {
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("tokens_7d");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const brands = useMemo(
    () => Array.from(new Set(models.map((m) => m.brand))).sort(),
    [models]
  );

  // KPI calculations
  const trackedCount = models.length;
  const newThisWeek = models.filter((m) => {
    if (!m.discovered_at) return false;
    const diff = Date.now() - new Date(m.discovered_at).getTime();
    return diff < 7 * 86400000;
  }).length;
  const freeToPaidThisWeek = recentEvents.filter(
    (e) => e.event_type === "free_to_paid"
  ).length;
  const totalTokens7d = models.reduce((sum, m) => sum + m.tokens_7d, 0);

  // Growth % calc
  function growthPct(m: ModelWithUsage): number | null {
    if (!m.tokens_prev_7d || m.tokens_prev_7d === 0) return null;
    return ((m.tokens_7d - m.tokens_prev_7d) / m.tokens_prev_7d) * 100;
  }

  // Filter
  const filtered = models.filter((m) => {
    if (brandFilter !== "all" && m.brand !== brandFilter) return false;
    if (statusFilter !== "all" && m.current_status !== statusFilter) return false;
    if (regionFilter !== "all" && m.region !== regionFilter) return false;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "tokens_7d") {
      cmp = a.tokens_7d - b.tokens_7d;
    } else {
      const ga = growthPct(a) ?? -Infinity;
      const gb = growthPct(b) ?? -Infinity;
      cmp = ga - gb;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

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

  // Status badge
  const statusColors: Record<string, string> = {
    free: "bg-[#E8EEF7] text-[#5B8DEF]",
    paid: "bg-[#F0F4F8] text-[#6B7785]",
    transitioning: "bg-[#FFF3E0] text-[#F0A856]",
    deprecated: "bg-[#FDECEA] text-[#E85B81]",
  };
  const statusLabels: Record<string, string> = {
    free: "FREE",
    paid: "PAID",
    transitioning: "TRANSITIONING",
    deprecated: "DEPRECATED",
  };

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332]">
          AI Model Tracker
        </h1>
        <p className="text-base text-[#6B7785] mt-1">
          Free model lifecycle monitoring
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <KPICard label="TRACKED MODELS" value={String(trackedCount)} />
        <KPICard label="NEW FREE THIS WEEK" value={String(newThisWeek)} />
        <KPICard label="FREE→PAID THIS WEEK" value={String(freeToPaidThisWeek)} />
        <KPICard label="TOTAL 7D TOKENS" value={formatTokens(totalTokens7d)} />
      </div>

      {/* Model Rankings */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 mb-6">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          Rankings
        </div>
        <h2 className="text-xl font-semibold text-[#1A2332] mt-1">
          模型排行榜
        </h2>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mt-6 mb-4">
          <FilterSelect
            label="Brand"
            value={brandFilter}
            onChange={setBrandFilter}
            options={[{ value: "all", label: "All" }, ...brands.map((b) => ({ value: b, label: b }))]}
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All" },
              { value: "free", label: "Free" },
              { value: "paid", label: "Paid" },
              { value: "transitioning", label: "Transitioning" },
            ]}
          />
          <FilterSelect
            label="Region"
            value={regionFilter}
            onChange={setRegionFilter}
            options={[
              { value: "all", label: "All" },
              { value: "china", label: "China" },
              { value: "us", label: "US" },
              { value: "europe", label: "Europe" },
            ]}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EEF7]">
                <th className="text-left py-3 px-2 font-medium text-[#6B7785] w-12">
                  #
                </th>
                <th className="text-left py-3 px-2 font-medium text-[#6B7785]">
                  Model
                </th>
                <th className="text-left py-3 px-2 font-medium text-[#6B7785]">
                  Brand
                </th>
                <th className="text-left py-3 px-2 font-medium text-[#6B7785]">
                  Status
                </th>
                <th
                  className="text-right py-3 px-2 font-medium text-[#6B7785] cursor-pointer select-none"
                  onClick={() => toggleSort("tokens_7d")}
                >
                  7d Tokens{sortArrow("tokens_7d")}
                </th>
                <th className="text-right py-3 px-2 font-medium text-[#6B7785]">
                  7d Requests
                </th>
                <th
                  className="text-right py-3 px-2 font-medium text-[#6B7785] cursor-pointer select-none"
                  onClick={() => toggleSort("growth")}
                >
                  7d Growth{sortArrow("growth")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => {
                const growth = growthPct(m);
                const isNew =
                  m.discovered_at &&
                  Date.now() - new Date(m.discovered_at).getTime() < 7 * 86400000;

                return (
                  <tr
                    key={m.id}
                    className="border-b border-[#E8EEF7] hover:bg-[#F0F4F8] transition-colors"
                  >
                    <td className="py-3 px-2 text-[#94A0AE] font-medium">
                      {i + 1}
                    </td>
                    <td className="py-3 px-2">
                      <Link
                        href={`/model/${encodeURIComponent(m.permaslug)}`}
                        className="flex items-center gap-2 font-medium text-[#1A2332] hover:text-[#5B8DEF] transition-colors"
                      >
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: m.color_hex }}
                        />
                        {m.display_name}
                        {isNew && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-[#E8EEF7] text-[#5B8DEF]">
                            NEW
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="py-3 px-2 text-[#6B7785]">{m.brand}</td>
                    <td className="py-3 px-2">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                          statusColors[m.current_status ?? "free"] ?? statusColors.free
                        }`}
                      >
                        {statusLabels[m.current_status ?? "free"] ?? "FREE"}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-[#1A2332]">
                      {formatTokens(m.tokens_7d)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-[#1A2332]">
                      {formatRequests(m.requests_7d)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono">
                      {growth !== null ? (
                        <span
                          className={
                            growth >= 0 ? "text-[#54B584]" : "text-[#E85B81]"
                          }
                        >
                          {growth >= 0 ? "↑" : "↓"}
                          {Math.abs(growth).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[#94A0AE]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-[#6B7785] py-8"
                  >
                    No data yet. Trigger a fetch first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* This Week's Events */}
      {recentEvents.length > 0 && (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 mb-6">
          <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
            Events
          </div>
          <h2 className="text-xl font-semibold text-[#1A2332] mt-1 mb-6">
            本周事件
          </h2>
          <div className="space-y-3">
            {recentEvents.map((evt) => (
              <div key={evt.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-[#5B8DEF] shrink-0" />
                <div>
                  <span className="text-sm text-[#94A0AE] mr-2">
                    {evt.event_date}
                  </span>
                  <span className="text-sm font-medium text-[#1A2332]">
                    {evt.label}
                  </span>
                  {evt.display_name && (
                    <span className="text-sm text-[#6B7785] ml-1">
                      ({evt.brand})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────

function KPICard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <div className="text-xs font-medium uppercase tracking-wider text-[#6B7785]">
        {label}
      </div>
      <div className="text-2xl font-semibold text-[#1A2332] mt-2">{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-[#E8EEF7] rounded-lg px-3 py-1.5 bg-white text-[#1A2332] focus:outline-none focus:border-[#5B8DEF] focus:ring-1 focus:ring-[#5B8DEF]/50"
      aria-label={label}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {label}: {o.label}
        </option>
      ))}
    </select>
  );
}

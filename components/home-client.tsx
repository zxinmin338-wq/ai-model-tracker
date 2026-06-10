"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatTokens, formatRequests } from "@/lib/format";
import { t } from "@/lib/i18n";
import { logicalModelKey } from "@/lib/queries";
import type { ModelWithUsage, EventRecord, RankingBreakdownRow } from "@/lib/queries";

type SortKey = "tokens_7d" | "growth";
type SortDir = "asc" | "desc";

const SOURCE_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  anyint: "AnyInt",
  zenmux: "ZenMux",
};

function formatProvider(provider: string | undefined | null): {
  short: string;
  full: string;
} {
  if (!provider) return { short: "—", full: "" };
  const parts = provider.split(",").map((s) => s.trim());
  if (parts.length === 1) return { short: parts[0], full: provider };
  return { short: `${parts[0]} 等${parts.length}家`, full: provider };
}

function formatPlatforms(sources: string[]): string {
  return sources.map((s) => SOURCE_LABELS[s] ?? s).join(", ") || "—";
}

type PlatformFilter = "all" | "openrouter" | "anyint" | "zenmux";
type ChannelFilter = "all" | "free" | "paid";

interface LogicalModel {
  key: string;
  rep: ModelWithUsage; // representative underlying row (top volume)
  modelIds: number[];
  tokens_7d: number;
  tokens_prev_7d: number;
  requests_7d: number;
  sources: Set<string>;
}

export function HomeClient({
  models,
  recentEvents,
  platforms,
  breakdown,
}: {
  models: ModelWithUsage[];
  recentEvents: EventRecord[];
  platforms: Record<number, string[]>;
  breakdown: RankingBreakdownRow[];
}) {
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("tokens_7d");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Group breakdown rows by model for fast lookup
  const breakdownByModel = useMemo(() => {
    const map: Record<number, RankingBreakdownRow[]> = {};
    for (const r of breakdown) {
      (map[r.model_id] ??= []).push(r);
    }
    return map;
  }, [breakdown]);

  const filterActive = platformFilter !== "all" || channelFilter !== "all";

  // ─── Merge into logical models (cross-platform + version-split de-dup) ───
  // Display-layer only: DB rows untouched. Rows sharing a logicalModelKey become
  // ONE ranking entry; tokens/requests are summed across the underlying rows.
  // The detail page shows the per-platform split.
  const logicalModels = useMemo(() => {
    const byKey = new Map<string, LogicalModel>();
    for (const m of models) {
      const key = logicalModelKey(m.permaslug);
      let g = byKey.get(key);
      if (!g) {
        g = {
          key,
          rep: m,
          modelIds: [],
          tokens_7d: 0,
          tokens_prev_7d: 0,
          requests_7d: 0,
          sources: new Set<string>(),
        };
        byKey.set(key, g);
      }
      g.modelIds.push(m.id);
      g.tokens_7d += m.tokens_7d;
      g.tokens_prev_7d += m.tokens_prev_7d;
      g.requests_7d += m.requests_7d;
      if (m.tokens_7d > g.rep.tokens_7d) g.rep = m; // representative = top volume
      for (const s of platforms[m.id] ?? []) g.sources.add(s);
    }
    return [...byKey.values()];
  }, [models, platforms]);

  // Does the logical model have any request-bearing source under the current
  // filter? ZenMux exposes tokens only (no request counts) → show "—".
  const hasRequestSource = (g: LogicalModel): boolean => {
    if (platformFilter === "zenmux") return false;
    if (platformFilter === "openrouter" || platformFilter === "anyint") return true;
    return g.sources.has("openrouter") || g.sources.has("anyint");
  };

  // Displayed metrics for a logical model, re-scoped to the active filter.
  const metricsFor = (g: LogicalModel) => {
    if (!filterActive) {
      return { tokens: g.tokens_7d, prev: g.tokens_prev_7d, requests: g.requests_7d };
    }
    let tokens = 0;
    let prev = 0;
    let requests = 0;
    for (const id of g.modelIds) {
      for (const r of breakdownByModel[id] ?? []) {
        if (platformFilter !== "all" && r.source !== platformFilter) continue;
        if (channelFilter === "free" && r.is_free !== true) continue;
        if (channelFilter === "paid" && r.is_free !== false) continue;
        tokens += r.tokens_7d;
        prev += r.tokens_prev_7d;
        requests += r.requests_7d;
      }
    }
    return { tokens, prev, requests };
  };

  const brands = useMemo(
    () => Array.from(new Set(logicalModels.map((g) => g.rep.brand))).sort(),
    [logicalModels]
  );

  // KPI calculations (over logical models)
  // "Tracked models" = logical models with data (7d tokens > 0), excluding
  // zero-activity rows kept in the DB. Global (all/all) scope.
  const trackedCount = logicalModels.filter((g) => g.tokens_7d > 0).length;
  const newThisWeek = logicalModels.filter((g) => {
    const rel = g.rep.released_at;
    if (!rel) return false;
    return Date.now() - new Date(rel).getTime() < 7 * 86400000;
  }).length;
  const freeToPaidThisWeek = recentEvents.filter(
    (e) => e.event_type === "free_to_paid"
  ).length;
  const totalTokens7d = logicalModels.reduce((sum, g) => sum + g.tokens_7d, 0);

  // Growth % from a (tokens, prev) pair
  function growthPct(tokens: number, prev: number): number | null {
    if (!prev || prev === 0) return null;
    return ((tokens - prev) / prev) * 100;
  }

  // Decorate each logical model with its (possibly re-scoped) metrics
  const decorated = logicalModels.map((g) => {
    const mm = metricsFor(g);
    return {
      g,
      rep: g.rep,
      ...mm,
      growth: growthPct(mm.tokens, mm.prev),
      showReq: hasRequestSource(g),
    };
  });

  // Filter (brand/region on the representative row; tokens>0 under current scope)
  const filtered = decorated.filter(({ rep, tokens }) => {
    if (brandFilter !== "all" && rep.brand !== brandFilter) return false;
    if (regionFilter !== "all" && rep.region !== regionFilter) return false;
    if (tokens <= 0) return false;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "tokens_7d") {
      cmp = a.tokens - b.tokens;
    } else {
      const ga = a.growth ?? -Infinity;
      const gb = b.growth ?? -Infinity;
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

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332]">
          {t.home.title}
        </h1>
        <p className="text-base text-[#6B7785] mt-1">
          {t.home.subtitle}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <KPICard label={t.kpi.trackedModels} value={String(trackedCount)} />
        <KPICard label={t.kpi.newFreeThisWeek} value={String(newThisWeek)} />
        <KPICard label={t.kpi.freeToPaidThisWeek} value={String(freeToPaidThisWeek)} />
        <KPICard label={t.kpi.total7dTokens} value={formatTokens(totalTokens7d)} />
      </div>

      {/* Model Rankings */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 mb-6">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          Rankings
        </div>
        <h2 className="text-xl font-semibold text-[#1A2332] mt-1">
          {t.home.rankings}
        </h2>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mt-6 mb-4">
          <FilterSelect
            label={t.filter.brand}
            value={brandFilter}
            onChange={setBrandFilter}
            options={[{ value: "all", label: t.common.all }, ...brands.map((b) => ({ value: b, label: b }))]}
          />
          <FilterSelect
            label={t.filter.region}
            value={regionFilter}
            onChange={setRegionFilter}
            options={[
              { value: "all", label: t.common.all },
              { value: "china", label: t.filter.china },
              { value: "us", label: t.filter.us },
              { value: "europe", label: t.filter.europe },
            ]}
          />
          <FilterSelect
            label={t.filter.platform}
            value={platformFilter}
            onChange={(v) => setPlatformFilter(v as PlatformFilter)}
            options={[
              { value: "all", label: t.common.all },
              { value: "openrouter", label: "OpenRouter" },
              { value: "anyint", label: "AnyInt" },
              { value: "zenmux", label: "ZenMux" },
            ]}
          />
          <FilterSelect
            label={t.filter.channel}
            value={channelFilter}
            onChange={(v) => setChannelFilter(v as ChannelFilter)}
            options={[
              { value: "all", label: t.common.all },
              { value: "free", label: t.status.free },
              { value: "paid", label: t.status.paid },
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
                  {t.table.model}
                </th>
                <th className="text-left py-3 px-2 font-medium text-[#6B7785]">
                  {t.table.brand}
                </th>
                <th className="text-left py-3 px-2 font-medium text-[#6B7785]">
                  {t.table.provider}
                </th>
                <th className="text-left py-3 px-2 font-medium text-[#6B7785]">
                  平台
                </th>
                <th
                  className="text-right py-3 px-2 font-medium text-[#6B7785] cursor-pointer select-none"
                  onClick={() => toggleSort("tokens_7d")}
                >
                  {t.table.tokens7d}{sortArrow("tokens_7d")}
                </th>
                <th className="text-right py-3 px-2 font-medium text-[#6B7785]">
                  {t.table.requests7d}
                </th>
                <th
                  className="text-right py-3 px-2 font-medium text-[#6B7785] cursor-pointer select-none"
                  onClick={() => toggleSort("growth")}
                >
                  {t.table.growth7d}{sortArrow("growth")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ g, rep, tokens, requests, growth, showReq }, i) => {
                const isNew =
                  rep.released_at &&
                  Date.now() - new Date(rep.released_at).getTime() < 7 * 86400000;

                return (
                  <tr
                    key={g.key}
                    className="border-b border-[#E8EEF7] hover:bg-[#F0F4F8] transition-colors"
                  >
                    <td className="py-3 px-2 text-[#94A0AE] font-medium">
                      {i + 1}
                    </td>
                    <td className="py-3 px-2">
                      <Link
                        href={`/model/${encodeURIComponent(rep.permaslug)}`}
                        className="flex items-center gap-2 font-medium text-[#1A2332] hover:text-[#5B8DEF] transition-colors"
                      >
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: rep.color_hex }}
                        />
                        {rep.display_name}
                        {isNew && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-[#E8EEF7] text-[#5B8DEF]">
                            {t.common.new}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="py-3 px-2 text-[#6B7785]">{rep.brand}</td>
                    <td className="py-3 px-2 text-[#6B7785] max-w-[180px]">
                      {(() => {
                        const p = formatProvider(rep.provider);
                        return p.full ? (
                          <span title={p.full} className="cursor-default">
                            {p.short}
                          </span>
                        ) : (
                          <span>{p.short}</span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-2 text-[#6B7785] whitespace-nowrap">
                      {formatPlatforms([...g.sources].sort())}
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-[#1A2332]">
                      {formatTokens(tokens)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-[#1A2332]">
                      {showReq ? (
                        formatRequests(requests)
                      ) : (
                        <span className="text-[#94A0AE]">—</span>
                      )}
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
                    colSpan={8}
                    className="text-center text-[#6B7785] py-8"
                  >
                    {t.common.noData}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* This Week's Events */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 mb-6">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          Events
        </div>
        <h2 className="text-xl font-semibold text-[#1A2332] mt-1 mb-6">
          {t.home.thisWeekEvents}
        </h2>
        {recentEvents.length > 0 ? (
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
        ) : (
          <p className="text-sm text-[#94A0AE]">{t.home.noEvents}</p>
        )}
      </div>
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

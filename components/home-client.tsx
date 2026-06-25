"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatTokens, formatRequests } from "@/lib/format";
import { InfoTooltip } from "@/components/info-tooltip";
import { t } from "@/lib/i18n";
import { logicalModelKey } from "@/lib/queries";
import type { ModelWithUsage, RankingBreakdownRow } from "@/lib/queries";

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
  platforms,
  breakdown,
}: {
  models: ModelWithUsage[];
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
      {/* Homepage-only aurora wash (scoped pilot). Faint mint→cyan→sky glow
          bleeding from the top corners over a near-white base; large empty
          space stays light. Fixed full-bleed; other pages keep their bg. */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55rem 34rem at 78% -12%, rgba(168,230,207,0.45), transparent 62%), radial-gradient(48rem 32rem at 12% -6%, rgba(198,226,240,0.40), transparent 58%), radial-gradient(40rem 30rem at 95% 8%, rgba(184,231,225,0.30), transparent 60%), linear-gradient(180deg, #F7FBFA 0%, #F3F8F7 55%, #EFF6F4 100%)",
        }}
      />

      {/* Editorial masthead — title + inline figure, hairline rule below */}
      <header className="mb-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-[var(--border-cool)] pb-7">
        <div className="relative max-w-xl">
          {/* soft aurora glow behind the title */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-10 -top-8 h-40 w-[28rem] -z-10 blur-3xl opacity-70"
            style={{
              background:
                "radial-gradient(50% 60% at 30% 50%, rgba(168,230,207,0.55), transparent 70%), radial-gradient(45% 55% at 70% 40%, rgba(198,226,240,0.5), transparent 72%)",
            }}
          />
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--accent-aurora)]">
            Market Intelligence
          </div>
          <h1 className="font-serif-heading text-[2.9rem] leading-[1.05] font-medium tracking-[-0.015em] text-[#16302B] mt-2">
            {t.home.title}
          </h1>
          <p className="text-[15px] text-[#5C726E] mt-2 tracking-tight">
            {t.home.subtitle}
          </p>
        </div>
        <div className="text-right">
          <div className="font-serif-heading text-[3.25rem] leading-none font-medium text-[#16302B] tabular-nums">
            {trackedCount}
          </div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8BA39E] mt-1.5">
            {t.kpi.trackedModels}
          </div>
        </div>
      </header>

      {/* Model Rankings */}
      <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft px-8 pt-7 pb-3 mb-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent-aurora)]">
          Rankings
        </div>
        <h2 className="font-serif-heading text-[1.7rem] font-medium tracking-[-0.01em] text-[#16302B] mt-1.5">
          {t.home.rankings}
        </h2>
        <p className="text-sm text-[#5C726E] mt-1.5">
          {t.home.rankingsDesc}
          <span className="text-[#8BA39E]"> · 点击模型名查看各平台调用详情 →</span>
        </p>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mt-6 mb-3">
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
              <tr className="border-b border-[var(--border-cool)]">
                <th className="text-left py-3 px-2 text-xs font-medium uppercase tracking-[0.06em] text-[#8BA39E] w-12">
                  #
                </th>
                <th className="text-left py-3 px-2 text-xs font-medium uppercase tracking-[0.06em] text-[#8BA39E]">
                  {t.table.model}
                </th>
                <th className="text-left py-3 px-2 text-xs font-medium uppercase tracking-[0.06em] text-[#8BA39E]">
                  {t.table.brand}
                </th>
                <th className="text-left py-3 px-2 text-xs font-medium uppercase tracking-[0.06em] text-[#8BA39E]">
                  {t.table.provider}
                </th>
                <th className="text-left py-3 px-2 text-xs font-medium uppercase tracking-[0.06em] text-[#8BA39E]">
                  <span className="inline-flex items-center gap-1">
                    平台
                    <InfoTooltip label="平台说明">该模型有调用数据的平台</InfoTooltip>
                  </span>
                </th>
                <th
                  className="text-right py-3 px-2 text-xs font-medium uppercase tracking-[0.06em] text-[#8BA39E] cursor-pointer select-none"
                  onClick={() => toggleSort("tokens_7d")}
                >
                  {t.table.tokens7d}{sortArrow("tokens_7d")}
                </th>
                <th className="text-right py-3 px-2 text-xs font-medium uppercase tracking-[0.06em] text-[#8BA39E]">
                  <span className="inline-flex items-center gap-1">
                    {t.table.requests7d}
                    <InfoTooltip label="符号说明">
                      “—” 表示该平台不提供此项数据（如 ZenMux 不统计请求数）
                    </InfoTooltip>
                  </span>
                </th>
                <th
                  className="text-right py-3 px-2 text-xs font-medium uppercase tracking-[0.06em] text-[#8BA39E] cursor-pointer select-none"
                  onClick={() => toggleSort("growth")}
                >
                  <span className="inline-flex items-center gap-1">
                    {t.table.growth7d}{sortArrow("growth")}
                    <InfoTooltip label="周环比说明">本周调用量相比上周的变化幅度</InfoTooltip>
                  </span>
                </th>
                <th className="w-6" aria-hidden />
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
                    className="group border-b border-[#EBF1EF] hover:bg-[#EEF7F4] transition-colors"
                  >
                    <td className="py-3 px-2 text-[#94A0AE] font-medium">
                      {i + 1}
                    </td>
                    <td className="py-3 px-2">
                      <Link
                        href={`/model/${encodeURIComponent(rep.permaslug)}`}
                        className="flex items-center gap-2 font-medium text-[#16302B] hover:text-[var(--accent-aurora)] transition-colors"
                      >
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: rep.color_hex }}
                        />
                        {rep.display_name}
                        {isNew && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-[var(--accent-aurora-soft)] text-[var(--accent-aurora-hover)]">
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
                            growth >= 0
                              ? "text-[var(--trend-up)]"
                              : "text-[var(--trend-down)]"
                          }
                        >
                          {growth >= 0 ? "↑" : "↓"}
                          {Math.abs(growth).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[#94A0AE]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right w-6">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 12 12"
                        fill="none"
                        className="inline-block text-[#94A0AE] opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-hidden
                      >
                        <path
                          d="M4.5 3L7.5 6L4.5 9"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
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

    </div>
  );
}

// ─── Sub-components ─────────────────────────────────

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
      className="text-sm border border-[var(--border-cool)] rounded-lg px-3 py-1.5 bg-white/70 text-[#16302B] focus:outline-none focus:border-[var(--accent-aurora)] focus:ring-1 focus:ring-[#4FB5A8]/35"
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

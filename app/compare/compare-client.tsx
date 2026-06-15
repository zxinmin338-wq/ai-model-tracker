"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendChart } from "@/components/trend-chart";
import { PivotTable } from "@/components/pivot-table";
import { formatTokens, formatRequests } from "@/lib/format";
import { exportTableCSV, exportElementPNG, buildExportFilename } from "@/lib/export";
import { t } from "@/lib/i18n";
import type { ModelWithUsage, DailyUsagePoint } from "@/lib/queries";

type Metric = "tokens" | "requests";
type TimeRange = 7 | 14 | 30;
type ViewMode = "table" | "chart";
type Channel = "all" | "free" | "standard";

interface EventData {
  permaslug: string;
  event_date: string;
  label: string;
  color_hex: string;
  event_type?: string;
}

// ─── Platform labels ───────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  anyint: "AnyInt",
  zenmux: "ZenMux",
};

function platformLabel(sources: string[]): string {
  return sources.map((s) => PLATFORM_LABELS[s] ?? s).join(", ");
}

// ─── Component ─────────────────────────────────────

export function CompareClient({
  models,
  platforms,
}: {
  models: ModelWithUsage[];
  platforms: Record<number, string[]>;
}) {
  const ownModels = useMemo(() => models.filter((m) => m.is_own), [models]);
  const otherModels = useMemo(() => models.filter((m) => !m.is_own), [models]);

  // Default selection: own models only (smart recommendation removed)
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    ownModels.forEach((m) => initial.add(m.permaslug));
    return initial;
  });

  const [metric, setMetric] = useState<Metric>("tokens");
  const [days, setDays] = useState<TimeRange>(7);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [channel, setChannel] = useState<Channel>("all");
  const [series, setSeries] = useState<DailyUsagePoint[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  // AI analysis
  const [analysisContent, setAnalysisContent] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisDate, setAnalysisDate] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    const slugs = Array.from(selected);
    if (slugs.length === 0) {
      setSeries([]);
      setEvents([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      slugs.forEach((s) => params.append("slugs", s));
      params.set("days", String(days));
      params.set("channel", channel);
      const res = await fetch(`/api/compare?${params.toString()}`);
      const json = await res.json();
      setSeries(json.series ?? []);
      setEvents(json.events ?? []);
    } catch (e) {
      console.error("Failed to fetch compare data:", e);
    } finally {
      setLoading(false);
    }
  }, [selected, days, channel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate AI analysis for the currently selected models
  const generateAnalysis = useCallback(async () => {
    const slugs = Array.from(selected);
    if (slugs.length === 0) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permaslugs: slugs }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setAnalysisContent(null);
        setAnalysisError(json.error || `生成失败 (HTTP ${res.status})`);
      } else {
        setAnalysisContent(json.content ?? "");
        setAnalysisDate((json.created_at || new Date().toISOString()).slice(0, 10));
      }
    } catch {
      setAnalysisContent(null);
      setAnalysisError("生成失败，请重试");
    } finally {
      setAnalysisLoading(false);
    }
  }, [selected]);

  // Toggle non-own models only
  const toggleModel = (slug: string) => {
    // Own models are always selected
    const isOwn = ownModels.some((m) => m.permaslug === slug);
    if (isOwn) return;

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const selectedModels = models.filter((m) => selected.has(m.permaslug));
  const ownSlugs = new Set(ownModels.map((m) => m.permaslug));

  // ─── Chart view data ──────────────────────────────

  const chartSeries = selectedModels.map((m) => ({
    key: metric === "tokens" ? m.permaslug : `${m.permaslug}_requests`,
    name: m.is_own ? `${m.display_name}（${t.common.own}）` : m.display_name,
    color: m.color_hex,
    strokeWidth: m.is_own ? 3 : 2,
  }));

  const chartEvents = events
    .filter((e) => selected.has(e.permaslug))
    .map((e) => ({
      date: e.event_date,
      label: e.label,
      color: e.color_hex,
    }));

  // ─── Pivot table data transform ───────────────────

  const pivotDates = useMemo(
    () => series.map((row) => row.date as string).sort(),
    [series]
  );

  const pivotData = useMemo(() => {
    const result: Record<string, Record<string, number | null>> = {};
    for (const m of selectedModels) {
      result[m.permaslug] = {};
    }
    for (const row of series) {
      const date = row.date as string;
      for (const m of selectedModels) {
        const key =
          metric === "tokens" ? m.permaslug : `${m.permaslug}_requests`;
        const val = row[key];
        if (!result[m.permaslug]) result[m.permaslug] = {};
        result[m.permaslug][date] =
          val != null && val !== "" ? Number(val) : null;
      }
    }
    return result;
  }, [series, selectedModels, metric]);

  const pivotEvents = useMemo(
    () =>
      events
        .filter((e) => selected.has(e.permaslug))
        .map((e) => ({
          permaslug: e.permaslug,
          event_date: e.event_date,
          label: e.label,
          event_type: e.event_type,
        })),
    [events, selected]
  );

  // ─── Export handlers ───────────────────────────────

  const startDate = pivotDates[0] ?? "";
  const endDate = pivotDates[pivotDates.length - 1] ?? "";

  function handleExportCSV() {
    setShowExportMenu(false);
    exportTableCSV(
      {
        models: selectedModels,
        dates: pivotDates,
        data: pivotData,
        events: pivotEvents,
        metric,
      },
      buildExportFilename("compare", startDate, endDate, "csv")
    );
  }

  async function handleExportPNG() {
    setShowExportMenu(false);
    if (!contentRef.current) return;
    await exportElementPNG(
      contentRef.current,
      buildExportFilename("compare", startDate, endDate, "png")
    );
  }

  // Candidate pool: non-own models with data in the last 7 days
  const candidates = useMemo(
    () => otherModels.filter((m) => m.tokens_7d > 0),
    [otherModels]
  );

  // Front-end search over the already-loaded candidates (name / brand / slug)
  const q = search.trim().toLowerCase();
  const filteredCandidates = q
    ? candidates.filter(
        (m) =>
          m.display_name.toLowerCase().includes(q) ||
          m.brand.toLowerCase().includes(q) ||
          m.permaslug.toLowerCase().includes(q)
      )
    : candidates;

  // Group candidates by brand; sort within group by tokens_7d desc, groups by
  // total tokens desc. Platform granularity preserved (no logical-model merge):
  // glm-4.6 and glm-4.6@zenmux remain distinct options.
  const brandGroups = (() => {
    const map = new Map<string, ModelWithUsage[]>();
    for (const m of filteredCandidates) {
      if (!map.has(m.brand)) map.set(m.brand, []);
      map.get(m.brand)!.push(m);
    }
    const groups = [...map.entries()].map(([brand, list]) => ({
      brand,
      list: [...list].sort((a, b) => b.tokens_7d - a.tokens_7d),
      total: list.reduce((s, m) => s + m.tokens_7d, 0),
    }));
    groups.sort((a, b) => b.total - a.total);
    return groups;
  })();

  const toggleBrand = (brand: string) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* ─── Model Selector ─── */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 space-y-5">
        {/* Own models */}
        {ownModels.length > 0 ? (
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-[#94A0AE] mb-2">
              {t.common.own}模型（必选）
            </div>
            <div className="flex flex-wrap gap-3">
              {ownModels.map((m) => (
                <label
                  key={m.permaslug}
                  className="flex items-center gap-2 bg-[#FFF8E1] rounded-lg px-3 py-2"
                >
                  <Checkbox checked disabled className="opacity-60" />
                  <span
                    className="inline-block h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: m.color_hex }}
                  />
                  <span className="text-sm font-medium text-[#1A2332]">
                    ⭐ {m.display_name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          /* No own model prompt */
          <div className="flex items-center gap-3 bg-[#FFF8E1] rounded-lg px-4 py-3">
            <span className="text-sm text-[#6B7785]">
              尚未标记我方模型。前往{" "}
              <Link
                href="/settings"
                className="text-[#5B8DEF] hover:underline font-medium"
              >
                设置
              </Link>
              {" "}标记后，对比体验将以你方模型为中心。
            </span>
          </div>
        )}

        {/* Candidate models: search + brand groups */}
        <div className="space-y-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模型 / 公司…"
            className="w-full text-sm border border-[#E8EEF7] rounded-lg px-3 py-2 bg-white text-[#1A2332] focus:outline-none focus:border-[#5B8DEF] focus:ring-1 focus:ring-[#5B8DEF]/50"
          />

          {brandGroups.length === 0 ? (
            <div className="text-sm text-[#94A0AE] py-2">无匹配模型</div>
          ) : (
            <div className="space-y-2">
              {brandGroups.map(({ brand, list }) => {
                const isExpanded = q !== "" || expandedBrands.has(brand);
                const selectedCount = list.filter((m) =>
                  selected.has(m.permaslug)
                ).length;
                return (
                  <div
                    key={brand}
                    className="border border-[#E8EEF7] rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleBrand(brand)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F0F4F8] transition-colors"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className={`transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                      >
                        <path
                          d="M5 3L9 7L5 11"
                          stroke="#6B7785"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-sm font-medium text-[#1A2332]">
                        {brand}
                      </span>
                      <span className="text-xs text-[#94A0AE]">
                        {list.length}
                        {selectedCount > 0 ? ` · 已选 ${selectedCount}` : ""}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="flex flex-wrap gap-3 px-3 pb-3 pt-1">
                        {list.map((m) => (
                          <ModelCheckbox
                            key={m.permaslug}
                            model={m}
                            sources={platforms[m.id] ?? []}
                            checked={selected.has(m.permaslug)}
                            onToggle={() => toggleModel(m.permaslug)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Controls ─── */}
      <div className="flex items-center gap-5 flex-wrap">
        <ControlGroup label="视图">
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
          >
            <TabsList>
              <TabsTrigger value="table">{t.view.table}</TabsTrigger>
              <TabsTrigger value="chart">{t.view.chart}</TabsTrigger>
            </TabsList>
          </Tabs>
        </ControlGroup>

        <ControlGroup label="指标">
          <Tabs
            value={metric}
            onValueChange={(v) => setMetric(v as Metric)}
          >
            <TabsList>
              <TabsTrigger value="tokens">{t.metric.tokens}</TabsTrigger>
              <TabsTrigger value="requests">{t.metric.requests}</TabsTrigger>
            </TabsList>
          </Tabs>
        </ControlGroup>

        <ControlGroup label="时间">
          <Tabs
            value={String(days)}
            onValueChange={(v) => setDays(Number(v) as TimeRange)}
          >
            <TabsList>
              <TabsTrigger value="7">{t.range.days7}</TabsTrigger>
              <TabsTrigger value="14">{t.range.days14}</TabsTrigger>
              <TabsTrigger value="30">{t.range.days30}</TabsTrigger>
            </TabsList>
          </Tabs>
        </ControlGroup>

        <ControlGroup label="通道">
          <Tabs
            value={channel}
            onValueChange={(v) => setChannel(v as Channel)}
          >
            <TabsList>
              <TabsTrigger value="all">合计</TabsTrigger>
              <TabsTrigger value="free">Free</TabsTrigger>
              <TabsTrigger value="standard">Paid</TabsTrigger>
            </TabsList>
          </Tabs>
        </ControlGroup>

        {/* Export dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-[#6B7785] hover:text-[#5B8DEF] border border-[#E8EEF7] rounded-lg px-3 py-1.5 bg-white transition-colors"
          >
            {t.common.export}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showExportMenu && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShowExportMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-[#E8EEF7] rounded-lg shadow-lg py-1 min-w-[180px]">
                {viewMode === "table" ? (
                  <ExportMenuItem
                    label="导出表格 (CSV)"
                    onClick={handleExportCSV}
                  />
                ) : (
                  <ExportMenuItem
                    label="导出图表 (PNG)"
                    onClick={handleExportPNG}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── AI Analysis ─── */}
      {selectedModels.length > 0 && (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
                AI Analysis
              </div>
              <h3 className="text-lg font-semibold text-[#1A2332] mt-1">
                AI 身位分析
              </h3>
            </div>
            <button
              onClick={generateAnalysis}
              disabled={analysisLoading}
              className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg bg-[#5B8DEF] text-white hover:bg-[#4A7DDF] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {analysisLoading ? "分析生成中…" : "生成 AI 分析"}
            </button>
          </div>

          {analysisLoading && (
            <div className="flex items-center gap-2 text-sm text-[#6B7785] mt-4">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-[#E8EEF7] border-t-[#5B8DEF] animate-spin" />
              分析生成中
            </div>
          )}

          {analysisError && !analysisLoading && (
            <div className="text-sm text-[#E85B81] mt-4">{analysisError}</div>
          )}

          {analysisContent && !analysisLoading && (
            <div className="mt-4">
              <div className="space-y-1.5 text-sm text-[#1A2332] leading-relaxed">
                {renderAnalysis(analysisContent)}
              </div>
              <p className="text-xs text-[#94A0AE] mt-4 pt-3 border-t border-[#E8EEF7]">
                本判断由 AI 基于截至 {analysisDate} 数据生成，可能有误，请结合原始数据核对。
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Content area ─── */}
      <div ref={contentRef}>
      {loading ? (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
          <div className="flex items-center justify-center h-[300px] text-[#6B7785]">
            {t.common.loading}
          </div>
        </div>
      ) : selectedModels.length === 0 ? (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
          <div className="flex items-center justify-center h-[200px] text-[#94A0AE]">
            请勾选至少一个模型
          </div>
        </div>
      ) : viewMode === "table" ? (
        /* ─── Pivot Table View ─── */
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <PivotTable
            models={selectedModels.map((m) => ({
              id: m.id,
              permaslug: m.permaslug,
              display_name: m.display_name,
              brand: m.brand,
              provider: m.provider,
              is_own: m.is_own,
              current_status: m.current_status,
              color_hex: m.color_hex,
            }))}
            dates={pivotDates}
            metric={metric}
            data={pivotData}
            events={pivotEvents}
            platforms={platforms}
          />
        </div>
      ) : (
        /* ─── Chart View ─── */
        <>
          <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
            <TrendChart
              data={series}
              series={chartSeries}
              events={chartEvents}
              yFormatter={metric === "tokens" ? formatTokens : formatRequests}
            />
          </div>

          {/* Legend table */}
          {selectedModels.length > 0 && series.length > 0 && (
            <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
              <h3 className="text-sm font-medium mb-3 text-[#6B7785]">
                {t.compare.totalInRange}（{days}天）
              </h3>
              <div className="space-y-2">
                {selectedModels.map((m) => {
                  const key =
                    metric === "tokens"
                      ? m.permaslug
                      : `${m.permaslug}_requests`;
                  const total = series.reduce(
                    (sum, row) => sum + (Number(row[key]) || 0),
                    0
                  );
                  return (
                    <div key={m.permaslug} className="flex items-center gap-3">
                      <span
                        className="inline-block h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: m.color_hex }}
                      />
                      <span className="text-sm flex-1">
                        {m.is_own && "⭐ "}
                        {m.display_name}
                        {m.is_own && (
                          <span className="text-[#94A0AE] ml-1">
                            （{t.common.own}）
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-mono">
                        {metric === "tokens"
                          ? formatTokens(total)
                          : formatRequests(total)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────

function ModelCheckbox({
  model,
  sources,
  checked,
  onToggle,
}: {
  model: ModelWithUsage;
  sources: string[];
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span
        className="inline-block h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: model.color_hex }}
      />
      <span className="text-sm text-[#1A2332]">{model.display_name}</span>
      {sources.length > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F0F4F8] text-[#6B7785] shrink-0">
          {platformLabel(sources)}
        </span>
      )}
      <span className="text-xs text-[#94A0AE]">
        {formatTokens(model.tokens_7d)}
      </span>
    </label>
  );
}

function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-[#94A0AE] shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}

function ExportMenuItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full text-left px-3 py-2 text-sm text-[#1A2332] hover:bg-[#F0F4F8] transition-colors"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// Light renderer for the LLM analysis: preserves line breaks and **bold**.
function renderAnalysis(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.trim() === "") return <div key={i} className="h-1.5" />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i}>
        {parts.map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={j} className="font-semibold">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <span key={j}>{p}</span>
          )
        )}
      </p>
    );
  });
}

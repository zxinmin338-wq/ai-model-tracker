"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // Two-model comparison: subject (required) + reference (optional).
  const [subject, setSubject] = useState<string>(() => {
    const ernie = models.find((m) => m.permaslug === "ernie-5.1");
    if (ernie) return ernie.permaslug;
    return (models.find((m) => m.tokens_7d > 0) ?? models[0])?.permaslug ?? "";
  });
  const [reference, setReference] = useState<string>(() => {
    const ds = models.find(
      (m) => /(^|\/)deepseek/i.test(m.permaslug) && m.tokens_7d > 0
    );
    return ds?.permaslug ?? "";
  });

  const [metric, setMetric] = useState<Metric>("tokens");
  const [days, setDays] = useState<TimeRange>(7);
  const [viewMode, setViewMode] = useState<ViewMode>("chart");
  const [channel, setChannel] = useState<Channel>("all");
  const [series, setSeries] = useState<DailyUsagePoint[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  // AI analysis
  const [analysisContent, setAnalysisContent] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisDate, setAnalysisDate] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);

  const subjectModel = models.find((m) => m.permaslug === subject) ?? null;
  const referenceModel = reference
    ? models.find((m) => m.permaslug === reference) ?? null
    : null;
  const selectedModels = useMemo(
    () => [subjectModel, referenceModel].filter((m): m is ModelWithUsage => !!m),
    [subjectModel, referenceModel]
  );
  const selectedSlugs = useMemo(
    () => new Set(selectedModels.map((m) => m.permaslug)),
    [selectedModels]
  );

  // Fetch trend data for the (one or two) selected models
  const fetchData = useCallback(async () => {
    const slugs = [subject, reference].filter(Boolean);
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
  }, [subject, reference, days, channel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate AI analysis (subject vs optional reference)
  const generateAnalysis = useCallback(async () => {
    if (!subject) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, reference: reference || undefined }),
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
  }, [subject, reference]);

  // ─── Chart / table data ──────────────────────────
  const chartSeries = selectedModels.map((m) => ({
    key: metric === "tokens" ? m.permaslug : `${m.permaslug}_requests`,
    name: m.display_name,
    color: m.color_hex,
    strokeWidth: 2,
  }));

  const chartEvents = events
    .filter((e) => selectedSlugs.has(e.permaslug))
    .map((e) => ({ date: e.event_date, label: e.label, color: e.color_hex }));

  const pivotDates = useMemo(
    () => series.map((row) => row.date as string).sort(),
    [series]
  );

  const pivotData = useMemo(() => {
    const result: Record<string, Record<string, number | null>> = {};
    for (const m of selectedModels) result[m.permaslug] = {};
    for (const row of series) {
      const date = row.date as string;
      for (const m of selectedModels) {
        const key = metric === "tokens" ? m.permaslug : `${m.permaslug}_requests`;
        const val = row[key];
        result[m.permaslug][date] = val != null && val !== "" ? Number(val) : null;
      }
    }
    return result;
  }, [series, selectedModels, metric]);

  const pivotEvents = useMemo(
    () =>
      events
        .filter((e) => selectedSlugs.has(e.permaslug))
        .map((e) => ({
          permaslug: e.permaslug,
          event_date: e.event_date,
          label: e.label,
          event_type: e.event_type,
        })),
    [events, selectedSlugs]
  );

  // ─── Export ───
  const startDate = pivotDates[0] ?? "";
  const endDate = pivotDates[pivotDates.length - 1] ?? "";
  function handleExportCSV() {
    setShowExportMenu(false);
    exportTableCSV(
      { models: selectedModels, dates: pivotDates, data: pivotData, events: pivotEvents, metric },
      buildExportFilename("compare", startDate, endDate, "csv")
    );
  }
  async function handleExportPNG() {
    setShowExportMenu(false);
    if (!contentRef.current) return;
    await exportElementPNG(contentRef.current, buildExportFilename("compare", startDate, endDate, "png"));
  }

  return (
    <div className="space-y-6">
      {/* ─── Model pickers: 对比模型 + 参照模型 ─── */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex flex-wrap gap-5">
          <ModelSearchSelect
            label="对比模型"
            value={subject}
            onChange={setSubject}
            models={models}
            platforms={platforms}
            placeholder="选择对比模型…"
          />
          <ModelSearchSelect
            label="参照模型（可选）"
            value={reference}
            onChange={setReference}
            models={models}
            platforms={platforms}
            allowClear
            placeholder="选择参照模型…"
          />
        </div>
      </div>

      {/* ─── Controls ─── */}
      <div className="flex items-center gap-5 flex-wrap">
        <ControlGroup label="视图">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="chart">{t.view.chart}</TabsTrigger>
              <TabsTrigger value="table">{t.view.table}</TabsTrigger>
            </TabsList>
          </Tabs>
        </ControlGroup>

        <ControlGroup label="指标">
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList>
              <TabsTrigger value="tokens">{t.metric.tokens}</TabsTrigger>
              <TabsTrigger value="requests">{t.metric.requests}</TabsTrigger>
            </TabsList>
          </Tabs>
        </ControlGroup>

        <ControlGroup label="时间">
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as TimeRange)}>
            <TabsList>
              <TabsTrigger value="7">{t.range.days7}</TabsTrigger>
              <TabsTrigger value="14">{t.range.days14}</TabsTrigger>
              <TabsTrigger value="30">{t.range.days30}</TabsTrigger>
            </TabsList>
          </Tabs>
        </ControlGroup>

        <ControlGroup label="通道">
          <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <TabsList>
              <TabsTrigger value="all">合计</TabsTrigger>
              <TabsTrigger value="free">Free</TabsTrigger>
              <TabsTrigger value="standard">Paid</TabsTrigger>
            </TabsList>
          </Tabs>
        </ControlGroup>

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
              <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-[#E8EEF7] rounded-lg shadow-lg py-1 min-w-[180px]">
                {viewMode === "table" ? (
                  <ExportMenuItem label="导出表格 (CSV)" onClick={handleExportCSV} />
                ) : (
                  <ExportMenuItem label="导出图表 (PNG)" onClick={handleExportPNG} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── AI Analysis ─── */}
      {subjectModel && (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
                AI Analysis
              </div>
              <h3 className="text-lg font-semibold text-[#1A2332] mt-1">AI 身位分析</h3>
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
              请选择对比模型
            </div>
          </div>
        ) : viewMode === "table" ? (
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
          <>
            <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
              <TrendChart
                data={series}
                series={chartSeries}
                events={chartEvents}
                yFormatter={metric === "tokens" ? formatTokens : formatRequests}
              />
            </div>

            {selectedModels.length > 0 && series.length > 0 && (
              <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
                <h3 className="text-sm font-medium mb-3 text-[#6B7785]">
                  {t.compare.totalInRange}（{days}天）
                </h3>
                <div className="space-y-2">
                  {selectedModels.map((m) => {
                    const key = metric === "tokens" ? m.permaslug : `${m.permaslug}_requests`;
                    const total = series.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
                    return (
                      <div key={m.permaslug} className="flex items-center gap-3">
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: m.color_hex }}
                        />
                        <span className="text-sm flex-1">{m.display_name}</span>
                        <span className="text-sm font-mono">
                          {metric === "tokens" ? formatTokens(total) : formatRequests(total)}
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

function ModelSearchSelect({
  label,
  value,
  onChange,
  models,
  platforms,
  allowClear,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (slug: string) => void;
  models: ModelWithUsage[];
  platforms: Record<number, string[]>;
  allowClear?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = models.find((m) => m.permaslug === value) ?? null;
  const query = q.trim().toLowerCase();
  const filtered = (
    query
      ? models.filter(
          (m) =>
            m.display_name.toLowerCase().includes(query) ||
            m.brand.toLowerCase().includes(query) ||
            m.permaslug.toLowerCase().includes(query)
        )
      : models
  ).slice(0, 60);

  return (
    <div className="flex-1 min-w-[260px]">
      <div className="text-xs font-medium uppercase tracking-wider text-[#94A0AE] mb-1.5">
        {label}
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 text-sm border border-[#E8EEF7] rounded-lg px-3 py-2 bg-white text-left hover:border-[#5B8DEF] transition-colors"
        >
          {selected ? (
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="inline-block h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: selected.color_hex }}
              />
              <span className="truncate text-[#1A2332]">{selected.display_name}</span>
              {platforms[selected.id]?.length ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F0F4F8] text-[#6B7785] shrink-0">
                  {platformLabel(platforms[selected.id])}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-[#94A0AE]">{placeholder ?? "选择模型…"}</span>
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
            <path d="M3 5L6 8L9 5" stroke="#6B7785" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-[#E8EEF7] rounded-lg shadow-lg p-2 max-h-[340px] overflow-auto">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索模型 / 公司…"
                className="w-full text-sm border border-[#E8EEF7] rounded-md px-2 py-1.5 mb-2 focus:outline-none focus:border-[#5B8DEF]"
              />
              {allowClear && (
                <button
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                    setQ("");
                  }}
                  className="w-full text-left px-2 py-1.5 text-sm text-[#94A0AE] hover:bg-[#F0F4F8] rounded"
                >
                  （不选 / 清除）
                </button>
              )}
              {filtered.length === 0 ? (
                <div className="text-sm text-[#94A0AE] px-2 py-2">无匹配模型</div>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.permaslug}
                    onClick={() => {
                      onChange(m.permaslug);
                      setOpen(false);
                      setQ("");
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-[#F0F4F8] rounded text-left"
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: m.color_hex }}
                    />
                    <span className="truncate text-[#1A2332] flex-1">{m.display_name}</span>
                    {platforms[m.id]?.length ? (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-[#F0F4F8] text-[#6B7785] shrink-0">
                        {platformLabel(platforms[m.id])}
                      </span>
                    ) : null}
                    <span className="text-xs text-[#94A0AE] shrink-0">
                      {formatTokens(m.tokens_7d)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-[#94A0AE] shrink-0">{label}</span>
      {children}
    </div>
  );
}

function ExportMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
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

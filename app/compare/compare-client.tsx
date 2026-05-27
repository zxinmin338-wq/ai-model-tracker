"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendChart } from "@/components/trend-chart";
import { PivotTable } from "@/components/pivot-table";
import { formatTokens, formatRequests } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Model, DailyUsagePoint } from "@/lib/queries";

type Metric = "tokens" | "requests";
type TimeRange = 7 | 14 | 30;
type ViewMode = "table" | "chart";

interface EventData {
  permaslug: string;
  event_date: string;
  label: string;
  color_hex: string;
  event_type?: string;
}

export function CompareClient({ models }: { models: Model[] }) {
  // Default: top 3 by id (first 3)
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    models.slice(0, 3).forEach((m) => initial.add(m.permaslug));
    return initial;
  });
  const [metric, setMetric] = useState<Metric>("tokens");
  const [days, setDays] = useState<TimeRange>(7);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [series, setSeries] = useState<DailyUsagePoint[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(false);

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

      const res = await fetch(`/api/compare?${params.toString()}`);
      const json = await res.json();
      setSeries(json.series ?? []);
      setEvents(json.events ?? []);
    } catch (e) {
      console.error("Failed to fetch compare data:", e);
    } finally {
      setLoading(false);
    }
  }, [selected, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleModel = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else if (next.size < 5) {
        next.add(slug);
      }
      return next;
    });
  };

  const selectedModels = models.filter((m) => selected.has(m.permaslug));

  // ─── Chart view data ──────────────────────────────
  const chartSeries = selectedModels.map((m) => ({
    key: metric === "tokens" ? m.permaslug : `${m.permaslug}_requests`,
    name: m.display_name,
    color: m.color_hex,
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

  return (
    <div className="space-y-6">
      {/* Model checkboxes */}
      <div className="flex flex-wrap gap-4">
        {models.map((m) => (
          <label
            key={m.permaslug}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Checkbox
              checked={selected.has(m.permaslug)}
              onCheckedChange={() => toggleModel(m.permaslug)}
            />
            <span
              className="inline-block h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: m.color_hex }}
            />
            <span className="text-sm">
              {m.is_own && "⭐ "}
              {m.display_name}
            </span>
          </label>
        ))}
      </div>

      {/* Controls */}
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
      </div>

      {/* Content area */}
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
                      <span className="text-sm flex-1">{m.display_name}</span>
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
  );
}

// ─── Sub-components ─────────────────────────────────

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

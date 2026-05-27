"use client";

import { useCallback, useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendChart } from "@/components/trend-chart";
import { formatTokens, formatRequests } from "@/lib/format";
import type { Model, DailyUsagePoint } from "@/lib/queries";

type Metric = "tokens" | "requests";
type TimeRange = 7 | 14 | 30;

interface EventData {
  permaslug: string;
  event_date: string;
  label: string;
  color_hex: string;
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
            <span className="text-sm">{m.display_name}</span>
          </label>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <Tabs
          value={metric}
          onValueChange={(v) => setMetric(v as Metric)}
        >
          <TabsList>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs
          value={String(days)}
          onValueChange={(v) => setDays(Number(v) as TimeRange)}
        >
          <TabsList>
            <TabsTrigger value="7">7d</TabsTrigger>
            <TabsTrigger value="14">14d</TabsTrigger>
            <TabsTrigger value="30">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Chart */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
        {loading ? (
          <div className="flex items-center justify-center h-[400px] text-[#6B7785]">
            Loading...
          </div>
        ) : (
          <TrendChart
            data={series}
            series={chartSeries}
            events={chartEvents}
            yFormatter={metric === "tokens" ? formatTokens : formatRequests}
          />
        )}
      </div>

      {/* Legend table */}
      {selectedModels.length > 0 && series.length > 0 && (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
          <h3 className="text-sm font-medium mb-3 text-[#6B7785]">
            Totals in selected range ({days}d)
          </h3>
          <div className="space-y-2">
            {selectedModels.map((m) => {
              const key =
                metric === "tokens" ? m.permaslug : `${m.permaslug}_requests`;
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
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendChart } from "@/components/trend-chart";
import { formatTokens, formatRequests } from "@/lib/format";
import { formatTimezoneLabel } from "@/lib/timezones";
import type { Model, EventRecord, PeakValleyData, DailyUsagePoint } from "@/lib/queries";

type Metric = "tokens" | "requests";
type TimeRange = 7 | 14 | 30;

export function ModelDetailClient({
  model,
  events,
  hourlyDeltas,
}: {
  model: Model;
  events: EventRecord[];
  hourlyDeltas: PeakValleyData[];
}) {
  const [metric, setMetric] = useState<Metric>("tokens");
  const [days, setDays] = useState<TimeRange>(7);
  const [series, setSeries] = useState<DailyUsagePoint[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("slugs", model.permaslug);
      params.set("days", String(days));
      const res = await fetch(`/api/compare?${params.toString()}`);
      const json = await res.json();
      setSeries(json.series ?? []);
    } catch (e) {
      console.error("Failed to fetch model data:", e);
    } finally {
      setLoading(false);
    }
  }, [model.permaslug, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartSeries = [
    {
      key: metric === "tokens" ? model.permaslug : `${model.permaslug}_requests`,
      name: model.display_name,
      color: model.color_hex,
    },
  ];

  const chartEvents = events
    .filter((e) => e.event_type === "free_to_paid" || e.event_type === "new_release" || e.event_type === "price_change")
    .map((e) => ({
      date: e.event_date,
      label: e.label,
      color: e.color_hex ?? model.color_hex,
    }));

  // Peak / Valley from hourlyDeltas
  const peak = hourlyDeltas.length > 0
    ? hourlyDeltas.reduce((a, b) => (b.avg_delta > a.avg_delta ? b : a))
    : null;
  const valley = hourlyDeltas.length > 0
    ? hourlyDeltas.reduce((a, b) => (b.avg_delta < a.avg_delta ? b : a))
    : null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <TabsList>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as TimeRange)}>
          <TabsList>
            <TabsTrigger value="7">7d</TabsTrigger>
            <TabsTrigger value="14">14d</TabsTrigger>
            <TabsTrigger value="30">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Trend Chart */}
      <div className="rounded-lg border bg-card p-4">
        {loading ? (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
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

      {/* Peak / Valley Card */}
      {peak && valley && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Peak Hour (highest avg delta)
            </h3>
            <p className="text-lg font-bold">{formatTimezoneLabel(peak.hour_utc)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Avg delta: {formatTokens(peak.avg_delta)} tokens/hr
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Valley Hour (lowest avg delta)
            </h3>
            <p className="text-lg font-bold">{formatTimezoneLabel(valley.hour_utc)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Avg delta: {formatTokens(valley.avg_delta)} tokens/hr
            </p>
          </div>
        </div>
      )}

      {/* Event Timeline */}
      {events.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Event Timeline
          </h3>
          <div className="space-y-3">
            {events.map((evt) => (
              <div key={evt.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: model.color_hex }} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{evt.label}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {evt.event_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{evt.event_date}</p>
                  {evt.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{evt.description}</p>
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

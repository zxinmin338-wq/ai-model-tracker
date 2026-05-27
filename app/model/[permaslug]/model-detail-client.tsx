"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendChart } from "@/components/trend-chart";
import { formatTokens, formatRequests } from "@/lib/format";
import { utcHourToTimezones } from "@/lib/timezones";
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

  // Peak / Valley from hourlyDeltas (filter out zero/negative)
  const validDeltas = hourlyDeltas.filter((d) => d.avg_delta > 0);
  const peak = validDeltas.length > 0
    ? validDeltas.reduce((a, b) => (b.avg_delta > a.avg_delta ? b : a))
    : null;
  const valley = validDeltas.length > 0
    ? validDeltas.reduce((a, b) => (b.avg_delta < a.avg_delta ? b : a))
    : null;

  // Status badge
  const statusColors: Record<string, string> = {
    free: "bg-[#E8EEF7] text-[#5B8DEF]",
    paid: "bg-[#F0F4F8] text-[#6B7785]",
    transitioning: "bg-[#FFF3E0] text-[#F0A856]",
    deprecated: "bg-[#FDECEA] text-[#E85B81]",
  };

  const isNew = model.discovered_at &&
    Date.now() - new Date(model.discovered_at).getTime() < 7 * 86400000;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[#6B7785] hover:text-[#5B8DEF] transition-colors"
      >
        ← Back to Rankings
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="inline-block h-4 w-4 rounded-full shrink-0"
            style={{ backgroundColor: model.color_hex }}
          />
          <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332]">
            {model.display_name}
          </h1>
          {model.current_status && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                statusColors[model.current_status] ?? statusColors.free
              }`}
            >
              {model.current_status.toUpperCase()}
            </span>
          )}
          {isNew && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-[#E8EEF7] text-[#5B8DEF]">
              NEW
            </span>
          )}
        </div>
        <p className="text-base text-[#6B7785] mt-1">
          {model.brand} · {model.permaslug}
        </p>
        {(model.discovered_at || model.region) && (
          <p className="text-sm text-[#94A0AE] mt-1">
            {model.discovered_at && `Discovered: ${model.discovered_at.slice(0, 10)}`}
            {model.discovered_at && model.region && " · "}
            {model.region && `Region: ${model.region.charAt(0).toUpperCase() + model.region.slice(1)}`}
          </p>
        )}
      </div>

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

      {/* Multi-timezone Peak / Valley Cards */}
      {peak && valley ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PeakValleyCard
            title="Peak Hours (UTC, last 7d avg)"
            hourUtc={peak.hour_utc}
            avgDelta={peak.avg_delta}
          />
          <PeakValleyCard
            title="Valley Hours (UTC, last 7d avg)"
            hourUtc={valley.hour_utc}
            avgDelta={valley.avg_delta}
          />
        </div>
      ) : (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 text-center">
          <p className="text-[#6B7785]">
            Peak/Valley analysis requires more hourly data. Keep data collection running.
          </p>
        </div>
      )}

      {/* Event Timeline */}
      {events.length > 0 && (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
          <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
            Timeline
          </div>
          <h3 className="text-xl font-semibold text-[#1A2332] mt-1 mb-6">
            Event Timeline
          </h3>
          <div className="space-y-4">
            {events.map((evt) => (
              <div key={evt.id} className="flex items-start gap-3">
                <div
                  className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: model.color_hex }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#1A2332]">
                      {evt.label}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-[#E8EEF7] text-[#6B7785]">
                      {evt.event_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs text-[#94A0AE]">{evt.event_date}</p>
                  {evt.description && (
                    <p className="text-sm text-[#6B7785] mt-0.5">
                      {evt.description}
                    </p>
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

// ─── Peak/Valley Sub-component ──────────────────────

function PeakValleyCard({
  title,
  hourUtc,
  avgDelta,
}: {
  title: string;
  hourUtc: number;
  avgDelta: number;
}) {
  const nextHour = (hourUtc + 1) % 24;
  const tz = utcHourToTimezones(hourUtc);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
      <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785] mb-4">
        {title}
      </div>

      <div className="text-2xl font-semibold text-[#1A2332] mb-1">
        {pad(hourUtc)}:00 – {pad(nextHour)}:00 UTC
      </div>
      <div className="text-base text-[#5B8DEF] font-medium mb-4">
        +{formatTokens(avgDelta)} tokens/hour
      </div>

      <div className="space-y-1.5 text-sm text-[#6B7785]">
        <div className="flex justify-between">
          <span>Beijing</span>
          <span className="font-medium text-[#1A2332]">{tz.beijing}</span>
        </div>
        <div className="flex justify-between">
          <span>US East</span>
          <span className="font-medium text-[#1A2332]">{tz.us_east}</span>
        </div>
        <div className="flex justify-between">
          <span>US West</span>
          <span className="font-medium text-[#1A2332]">{tz.us_west}</span>
        </div>
        <div className="flex justify-between">
          <span>Central Europe</span>
          <span className="font-medium text-[#1A2332]">{tz.central_europe}</span>
        </div>
      </div>
    </div>
  );
}

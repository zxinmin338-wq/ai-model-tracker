"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendChart } from "@/components/trend-chart";
import { PlatformBreakdown } from "@/components/platform-breakdown";
import { formatTokens, formatRequests } from "@/lib/format";
import { t } from "@/lib/i18n";
import { utcHourToTimezones } from "@/lib/timezones";
import type { Model, EventRecord, PeakValleyData, DailyUsagePoint, PlatformDailyToken } from "@/lib/queries";

type Metric = "tokens" | "requests";
type TimeRange = 7 | 14 | 30;
type Channel = "all" | "free" | "standard";

// 3-hour bucket labels
const BUCKET_LABELS = [
  "00-03", "03-06", "06-09", "09-12",
  "12-15", "15-18", "18-21", "21-24",
];

interface Bucket3h {
  label: string;
  startHour: number;
  endHour: number;
  avgDelta: number;
  sampleCount: number;
}

function aggregateTo3hBuckets(hourlyDeltas: PeakValleyData[]): Bucket3h[] {
  return BUCKET_LABELS.map((label, i) => {
    const startHour = i * 3;
    const endHour = startHour + 3;
    const hoursInBucket = hourlyDeltas.filter(
      (d) => d.hour_utc >= startHour && d.hour_utc < endHour && d.avg_delta > 0
    );
    const totalDelta = hoursInBucket.reduce((sum, h) => sum + h.avg_delta, 0);
    return {
      label,
      startHour,
      endHour,
      avgDelta: hoursInBucket.length > 0 ? totalDelta / hoursInBucket.length : 0,
      sampleCount: hoursInBucket.length,
    };
  });
}

export function ModelDetailClient({
  model,
  events,
  hourlyDeltas,
  hasHourlyData,
  platformDaily,
  memberSlugs,
}: {
  model: Model;
  events: EventRecord[];
  hourlyDeltas: PeakValleyData[];
  hasHourlyData: boolean;
  platformDaily: PlatformDailyToken[];
  memberSlugs: string[];
}) {
  const [metric, setMetric] = useState<Metric>("tokens");
  const [days, setDays] = useState<TimeRange>(7);
  const [channel, setChannel] = useState<Channel>("all");
  const [series, setSeries] = useState<DailyUsagePoint[]>([]);
  const [loading, setLoading] = useState(false);

  // Logical model = this row + cross-platform / version-split siblings.
  const members = memberSlugs.length > 0 ? memberSlugs : [model.permaslug];
  const memberKey = members.join(",");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const slugs = memberKey.split(",");
      const params = new URLSearchParams();
      slugs.forEach((s) => params.append("slugs", s));
      params.set("days", String(days));
      params.set("channel", channel);
      const res = await fetch(`/api/compare?${params.toString()}`);
      const json = await res.json();
      // Collapse every member's columns into the representative model's key so
      // the single trend line reflects the merged logical model (all platforms
      // + versions summed).
      const tokKey = model.permaslug;
      const reqKey = `${model.permaslug}_requests`;
      const merged = (json.series ?? []).map(
        (row: Record<string, number | string>) => {
          let tok = 0;
          let req = 0;
          for (const s of slugs) {
            tok += Number(row[s] ?? 0);
            req += Number(row[`${s}_requests`] ?? 0);
          }
          return { date: row.date, [tokKey]: tok, [reqKey]: req };
        }
      );
      setSeries(merged);
    } catch (e) {
      console.error("Failed to fetch model data:", e);
    } finally {
      setLoading(false);
    }
  }, [model.permaslug, memberKey, days, channel]);

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

  // 3-hour buckets
  const buckets = useMemo(() => aggregateTo3hBuckets(hourlyDeltas), [hourlyDeltas]);
  const validBuckets = buckets.filter((b) => b.avgDelta > 0);
  const peakBucket = validBuckets.length > 0
    ? validBuckets.reduce((a, b) => (b.avgDelta > a.avgDelta ? b : a))
    : null;
  const valleyBucket = validBuckets.length > 0
    ? validBuckets.reduce((a, b) => (b.avgDelta < a.avgDelta ? b : a))
    : null;

  // Status badge
  const statusColors: Record<string, string> = {
    free: "bg-[var(--accent-aurora-soft)] text-[var(--accent-aurora-hover)]",
    paid: "bg-[#F0F4F8] text-[#6B7785]",
    transitioning: "bg-[#FFF3E0] text-[#F0A856]",
    deprecated: "bg-[#FDECEA] text-[#E85B81]",
  };

  const isNew = model.released_at &&
    Date.now() - new Date(model.released_at).getTime() < 7 * 86400000;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[#6B7785] hover:text-[var(--accent-aurora)] transition-colors"
      >
        {t.detail.backToRankings}
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="inline-block h-4 w-4 rounded-full shrink-0"
            style={{ backgroundColor: model.color_hex }}
          />
          <h1 className="font-serif-heading text-[2.4rem] leading-[1.05] font-medium tracking-[-0.015em] text-[#16302B]">
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
            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-[var(--accent-aurora-soft)] text-[var(--accent-aurora-hover)]">
              {t.common.new}
            </span>
          )}
        </div>
        <p className="text-base text-[#6B7785] mt-1">
          {model.brand} · {model.permaslug}
        </p>
        {(model.released_at || model.region || model.monitored_since) && (
          <div className="text-sm text-[#94A0AE] mt-1 space-y-0.5">
            {(model.released_at || model.region) && (
              <p>
                {model.released_at && `${t.detail.releasedAt}: ${model.released_at.slice(0, 10)}`}
                {model.released_at && model.region && " · "}
                {model.region && `${t.detail.region}: ${model.region.charAt(0).toUpperCase() + model.region.slice(1)}`}
              </p>
            )}
            {model.monitored_since && (
              <p>{t.detail.monitoredSince}: {model.monitored_since.slice(0, 10)}</p>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <TabsList>
            <TabsTrigger value="tokens">{t.metric.tokens}</TabsTrigger>
            <TabsTrigger value="requests">{t.metric.requests}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as TimeRange)}>
          <TabsList>
            <TabsTrigger value="7">{t.range.days7}</TabsTrigger>
            <TabsTrigger value="14">{t.range.days14}</TabsTrigger>
            <TabsTrigger value="30">{t.range.days30}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          <TabsList>
            <TabsTrigger value="all">合计</TabsTrigger>
            <TabsTrigger value="free">Free</TabsTrigger>
            <TabsTrigger value="standard">Paid</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Trend Chart */}
      <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-8">
        {loading ? (
          <div className="flex items-center justify-center h-[400px] text-[#6B7785]">
            {t.common.loading}
          </div>
        ) : series.length === 0 ? (
          <div className="flex items-center justify-center h-[400px] text-[#6B7785]">
            {channel === "free"
              ? t.detail.noFreeData
              : channel === "standard"
              ? t.detail.noStandardData
              : t.common.noData}
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

      {/* Platform Distribution — only renders for models with ≥2 platforms */}
      <PlatformBreakdown
        platformDaily={platformDaily}
        days={days}
        colorHex={model.color_hex}
      />

      {/* 3-Hour Distribution Bar Chart — only meaningful for sources with real
          hourly data (OpenRouter). Daily-grain models (anyint/zenmux) get a note. */}
      {!hasHourlyData ? (
        <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-8 text-center">
          <p className="text-[#6B7785]">{t.detail.noHourlyData}</p>
        </div>
      ) : validBuckets.length > 0 ? (
        <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent-aurora)]">
            Distribution
          </div>
          <h3 className="text-xl font-semibold text-[#1A2332] mt-1 mb-6">
            {t.detail.distribution}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={buckets} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid stroke="#F0F4F8" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#6B7785' }}
                stroke="#E8EEF7"
                label={{ value: 'UTC', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: '#94A0AE' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6B7785' }}
                stroke="#E8EEF7"
                tickFormatter={(v: number) => formatTokens(v)}
                width={70}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const bucket = payload[0].payload as Bucket3h;
                  const tzStart = utcHourToTimezones(bucket.startHour);
                  return (
                    <div className="bg-white border border-[#E8EEF7] rounded-lg p-3 shadow-sm text-sm">
                      <div className="font-medium text-[#1A2332] mb-1">
                        UTC {bucket.label}
                      </div>
                      <div className="text-[#6B7785] space-y-0.5">
                        <div>{t.timezone.beijing} {tzStart.beijing}</div>
                        <div>{t.timezone.usEast} {tzStart.us_east}</div>
                        <div>{t.timezone.usWest} {tzStart.us_west}</div>
                        <div>{t.timezone.centralEurope} {tzStart.central_europe}</div>
                      </div>
                      <div className="mt-1 text-[#1A2332] font-medium">
                        {formatTokens(bucket.avgDelta)} tokens/hr avg
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="avgDelta" radius={[4, 4, 0, 0]}>
                {buckets.map((bucket, i) => {
                  const isPeak = peakBucket && bucket.label === peakBucket.label;
                  const isValley = valleyBucket && bucket.label === valleyBucket.label;
                  return (
                    <Cell
                      key={i}
                      fill={isPeak ? model.color_hex : isValley ? '#94A0AE' : `${model.color_hex}66`}
                      stroke={isPeak || isValley ? model.color_hex : 'none'}
                      strokeWidth={isPeak || isValley ? 2 : 0}
                    />
                  );
                })}
              </Bar>
              {peakBucket && (
                <ReferenceLine
                  x={peakBucket.label}
                  stroke="none"
                  label={{ value: '峰', position: 'top', fill: model.color_hex, fontSize: 13, fontWeight: 600 }}
                />
              )}
              {valleyBucket && (
                <ReferenceLine
                  x={valleyBucket.label}
                  stroke="none"
                  label={{ value: '谷', position: 'top', fill: '#94A0AE', fontSize: 13, fontWeight: 600 }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-[#94A0AE] mt-3">
            {t.peakValley.dataNote}
          </p>
        </div>
      ) : (
        <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-8 text-center">
          <p className="text-[#6B7785]">
            {t.detail.peakValleyNoData}
          </p>
        </div>
      )}

      {/* Multi-timezone Peak / Valley Cards (3-hour windows) */}
      {hasHourlyData && peakBucket && valleyBucket && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PeakValley3hCard
            title={`${t.peakValley.peak} ${t.peakValley.peakSuffix}`}
            bucket={peakBucket}
            colorHex={model.color_hex}
          />
          <PeakValley3hCard
            title={`${t.peakValley.valley} ${t.peakValley.valleySuffix}`}
            bucket={valleyBucket}
            colorHex={model.color_hex}
          />
        </div>
      )}

      {/* Event Timeline */}
      {events.length > 0 && (
        <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent-aurora)]">
            Timeline
          </div>
          <h3 className="text-xl font-semibold text-[#1A2332] mt-1 mb-6">
            {t.detail.eventTimeline}
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

// ─── Peak/Valley 3h Sub-component ───────────────────

function PeakValley3hCard({
  title,
  bucket,
  colorHex,
}: {
  title: string;
  bucket: Bucket3h;
  colorHex: string;
}) {
  const tzStart = utcHourToTimezones(bucket.startHour);
  const tzEnd = utcHourToTimezones(bucket.endHour % 24);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-8">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent-aurora)] mb-4">
        {title}
      </div>

      <div className="font-serif-heading text-[1.9rem] font-medium text-[#16302B] mb-1">
        UTC {pad(bucket.startHour)}:00 – {pad(bucket.endHour % 24)}:00
      </div>
      <div className="text-base font-medium mb-4" style={{ color: colorHex }}>
        +{formatTokens(bucket.avgDelta)} tokens/hr avg
      </div>

      <div className="space-y-1.5 text-sm text-[#6B7785]">
        <div className="flex justify-between">
          <span>{t.timezone.beijing}</span>
          <span className="font-medium text-[#1A2332]">{tzStart.beijing} – {tzEnd.beijing}</span>
        </div>
        <div className="flex justify-between">
          <span>{t.timezone.usEast}</span>
          <span className="font-medium text-[#1A2332]">{tzStart.us_east} – {tzEnd.us_east}</span>
        </div>
        <div className="flex justify-between">
          <span>{t.timezone.usWest}</span>
          <span className="font-medium text-[#1A2332]">{tzStart.us_west} – {tzEnd.us_west}</span>
        </div>
        <div className="flex justify-between">
          <span>{t.timezone.centralEurope}</span>
          <span className="font-medium text-[#1A2332]">{tzStart.central_europe} – {tzEnd.central_europe}</span>
        </div>
      </div>
    </div>
  );
}

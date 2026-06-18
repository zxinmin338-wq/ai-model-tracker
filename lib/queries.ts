/**
 * All Supabase data queries — single source of truth.
 */

import { supabase } from "./supabase";

// ─── Types ──────────────────────────────────────────

export interface Model {
  id: number;
  permaslug: string;
  display_name: string;
  brand: string;
  color_hex: string;
  is_active: boolean;
  current_status?: string;
  region?: string;
  released_at?: string;
  monitored_since?: string;
  is_own?: boolean;
  provider?: string;
}

export interface ModelWithUsage extends Model {
  tokens_7d: number;
  requests_7d: number;
  tokens_prev_7d: number;
  requests_prev_7d: number;
}

export interface DailyUsagePoint {
  date: string;
  [permaslug: string]: number | string;
}

export interface EventRecord {
  id: number;
  model_id: number;
  event_date: string;
  event_type: string;
  label: string;
  description: string | null;
  permaslug?: string;
  display_name?: string;
  color_hex?: string;
  brand?: string;
}

// ─── Ranking (Homepage) ─────────────────────────────

export async function getRanking(): Promise<ModelWithUsage[]> {
  const { data, error } = await supabase.rpc("get_ranking_7d");

  if (error) {
    console.error("getRanking error:", error);
    // Fallback: simple query
    const { data: models } = await supabase
      .from("models")
      .select("*")
      .eq("is_active", true)
      .order("display_name");
    return (models ?? []).map((m) => ({
      ...m,
      tokens_7d: 0,
      requests_7d: 0,
      tokens_prev_7d: 0,
      requests_prev_7d: 0,
    }));
  }
  return data ?? [];
}

// ─── Recent Events (Homepage) ───────────────────────

export async function getRecentEvents(days: number = 7): Promise<EventRecord[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("events")
    .select("*, models(permaslug, display_name, brand)")
    .gte("event_date", since)
    .order("event_date", { ascending: false });

  return (data ?? []).map((e) => ({
    ...e,
    permaslug: (e.models as any)?.permaslug,
    display_name: (e.models as any)?.display_name,
    brand: (e.models as any)?.brand,
  }));
}

// ─── Daily Usage (Compare page) ─────────────────────

export async function getDailyUsage(
  permaslugs: string[],
  days: 7 | 14 | 30,
  channel: "all" | "free" | "standard" = "all"
): Promise<{
  series: DailyUsagePoint[];
  events: Array<{
    permaslug: string;
    event_date: string;
    label: string;
    color_hex: string;
  }>;
}> {
  // Get model IDs
  const { data: models } = await supabase
    .from("models")
    .select("id, permaslug, color_hex")
    .in("permaslug", permaslugs);

  if (!models || models.length === 0) return { series: [], events: [] };

  const modelIds = models.map((m) => m.id);
  const slugById = Object.fromEntries(models.map((m) => [m.id, m.permaslug]));
  const colorBySlug = Object.fromEntries(
    models.map((m) => [m.permaslug, m.color_hex])
  );

  // Get snapshots — filter by channel if not "all"
  let snapshotQuery = supabase
    .from("snapshots")
    .select("model_id, usage_date, total_tokens, total_requests, captured_at, is_free, source")
    .in("model_id", modelIds)
    .gte(
      "usage_date",
      new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    );
  if (channel === "free") snapshotQuery = snapshotQuery.eq("is_free", true);
  if (channel === "standard") snapshotQuery = snapshotQuery.eq("is_free", false);
  const { data: snapshots } = await snapshotQuery.order("captured_at", { ascending: false });

  // Deduplicate: keep latest snapshot per (model_id, usage_date, is_free, source)
  const seen = new Set<string>();
  const deduped = (snapshots ?? []).filter((s) => {
    const key = `${s.model_id}_${s.usage_date}_${s.is_free}_${s.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build series: one row per date, columns per permaslug
  // Sum free + standard for each (model, date) pair
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const s of deduped) {
    const slug = slugById[s.model_id];
    if (!slug) continue;
    const date = s.usage_date;
    if (!dateMap.has(date)) {
      dateMap.set(date, { date });
    }
    const row = dateMap.get(date)!;
    row[slug] = ((row[slug] as number) || 0) + s.total_tokens;
    row[`${slug}_requests`] = ((row[`${slug}_requests`] as number) || 0) + s.total_requests;
  }

  const series = (Array.from(dateMap.values()) as DailyUsagePoint[]).sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  // Get events
  const { data: events } = await supabase
    .from("events")
    .select("model_id, event_date, label, event_type")
    .in("model_id", modelIds)
    .gte(
      "event_date",
      new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    );

  const eventList = (events ?? []).map((e) => ({
    permaslug: slugById[e.model_id] ?? "",
    event_date: e.event_date,
    label: e.label,
    color_hex: colorBySlug[slugById[e.model_id]] ?? "#888",
    event_type: e.event_type as string,
  }));

  return { series, events: eventList };
}

// ─── Model Detail ───────────────────────────────────

export async function getModelBySlug(
  permaslug: string
): Promise<Model | null> {
  const { data } = await supabase
    .from("models")
    .select("*")
    .eq("permaslug", permaslug)
    .single();
  return data;
}

export async function getModelEvents(modelId: number): Promise<EventRecord[]> {
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("model_id", modelId)
    .order("event_date", { ascending: false });
  return data ?? [];
}

// ─── Peak/Valley Analysis ───────────────────────────

export interface PeakValleyData {
  hour_utc: number;
  avg_delta: number;
}

export async function getHourlyDeltas(
  modelId: number
): Promise<PeakValleyData[]> {
  const { data, error } = await supabase.rpc("get_hourly_deltas", {
    p_model_id: modelId,
  });
  if (error) {
    console.error("getHourlyDeltas error:", error);
    return [];
  }
  return data ?? [];
}

// ─── Platform breakdown (Model Detail) ──────────────

export interface PlatformDailyToken {
  source: string;
  usage_date: string;
  tokens: number;
}

// Per-(source, day) token totals for a model over the last `days`.
// Independent of getDailyUsage (which sums all sources into one number) — this
// keeps sources separate so the detail page can show a platform breakdown.
// Dedup matches the canonical key (usage_date, is_free, source): latest capture
// per cell, then channels (is_free) summed within each source/day.
export async function getPlatformBreakdown(
  modelId: number,
  days: number = 30
): Promise<PlatformDailyToken[]> {
  const since = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);

  const { data: snaps } = await supabase
    .from("snapshots")
    .select("usage_date, total_tokens, captured_at, is_free, source")
    .eq("model_id", modelId)
    .gte("usage_date", since)
    .order("captured_at", { ascending: false });

  const seen = new Set<string>();
  const bySourceDay = new Map<string, PlatformDailyToken>();
  for (const s of snaps ?? []) {
    const cellKey = `${s.usage_date}_${s.is_free}_${s.source}`;
    if (seen.has(cellKey)) continue;
    seen.add(cellKey);
    const k = `${s.source}_${s.usage_date}`;
    const cur = bySourceDay.get(k);
    if (cur) {
      cur.tokens += s.total_tokens;
    } else {
      bySourceDay.set(k, {
        source: s.source,
        usage_date: s.usage_date,
        tokens: s.total_tokens,
      });
    }
  }
  return Array.from(bySourceDay.values());
}

// Whether a model has any OpenRouter snapshots — the only source with real
// hourly/cumulative data. Used to decide if the 24h-distribution block is
// meaningful (daily-grain anyint/zenmux models have no hourly resolution).
export async function hasHourlyData(modelId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("snapshots")
    .select("id")
    .eq("model_id", modelId)
    .eq("source", "openrouter")
    .limit(1);
  if (error) {
    console.error("hasHourlyData error:", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

// ─── Logical model key (cross-platform / version de-dup) ────
//
// Collapses platform suffix + version/date suffixes so the "same" model from
// different platforms (and different version snapshots) groups into one logical
// model. MVP / coarse granularity: version dates count as the same model.
//   z-ai/glm-4.6, z-ai/glm-4.6-20251208, z-ai/glm-4.6@zenmux  -> "z-ai/glm-4.6"
//   deepseek/deepseek-r1, deepseek/deepseek-r1-0528           -> "deepseek/deepseek-r1"
export function logicalModelKey(permaslug: string): string {
  let s = permaslug.replace(/@zenmux$/, "");
  s = s.replace(/-\d{8}$/, ""); //         -20260423
  s = s.replace(/-\d{4}-\d{2}-\d{2}$/, ""); // -2026-02-10
  s = s.replace(/-\d{2}-\d{2}$/, ""); //      -07-25
  s = s.replace(/-\d{4}$/, ""); //            -2509 / -0905 / -2507
  return s.toLowerCase();
}

// All model rows belonging to the same logical model as `permaslug`
// (cross-platform + version-split members). Used by the detail page to
// aggregate the per-platform breakdown across every underlying row.
export interface LogicalGroupMember {
  id: number;
  permaslug: string;
}
export async function getLogicalGroupMembers(
  permaslug: string
): Promise<LogicalGroupMember[]> {
  const key = logicalModelKey(permaslug);
  const { data } = await supabase.from("models").select("id, permaslug");
  const members = (data ?? []).filter(
    (m) => logicalModelKey(m.permaslug) === key
  );
  // ensure the queried model is always included
  if (!members.some((m) => m.permaslug === permaslug)) {
    // fall back: caller's row may be inactive/edge; not expected, but safe
  }
  return members;
}

// ─── Ranking breakdown (Homepage platform/channel filters) ────

export interface RankingBreakdownRow {
  model_id: number;
  source: string;
  is_free: boolean;
  tokens_7d: number;
  tokens_prev_7d: number;
  requests_7d: number;
}

// Per-(model, source, channel) 7d / prev-7d token + request totals.
// Lets the homepage re-scope the displayed tokens when a platform/channel
// filter is active. Summing every row of a model == its get_ranking_7d total,
// so the unfiltered ("all/all") view stays identical.
export async function getRankingBreakdown(): Promise<RankingBreakdownRow[]> {
  const { data, error } = await supabase.rpc("get_ranking_breakdown_7d");
  if (error) {
    console.error("getRankingBreakdown error:", error);
    return [];
  }
  return data ?? [];
}

// ─── Model platforms (distinct sources per model) ────

export async function getModelPlatforms(): Promise<Record<number, string[]>> {
  // Query only active models and their distinct sources
  const { data: models } = await supabase
    .from("models")
    .select("id")
    .eq("is_active", true);

  if (!models) return {};

  const result: Record<number, string[]> = {};
  for (const m of models) {
    const { data } = await supabase
      .from("snapshots")
      .select("source")
      .eq("model_id", m.id)
      .limit(100);

    const sources = new Set<string>();
    for (const row of data ?? []) {
      sources.add(row.source);
    }
    if (sources.size > 0) {
      result[m.id] = Array.from(sources).sort();
    }
  }

  return result;
}

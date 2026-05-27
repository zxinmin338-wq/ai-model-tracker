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
  discovered_at?: string;
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
  days: 7 | 14 | 30
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

  // Get snapshots
  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("model_id, usage_date, total_tokens, total_requests, captured_at")
    .in("model_id", modelIds)
    .gte(
      "usage_date",
      new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    )
    .order("captured_at", { ascending: false });

  // Deduplicate: keep latest snapshot per (model_id, usage_date)
  const seen = new Set<string>();
  const deduped = (snapshots ?? []).filter((s) => {
    const key = `${s.model_id}_${s.usage_date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build series: one row per date, columns per permaslug
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const s of deduped) {
    const slug = slugById[s.model_id];
    if (!slug) continue;
    const date = s.usage_date;
    if (!dateMap.has(date)) {
      dateMap.set(date, { date });
    }
    const row = dateMap.get(date)!;
    row[slug] = s.total_tokens;
    row[`${slug}_requests`] = s.total_requests;
  }

  const series = (Array.from(dateMap.values()) as DailyUsagePoint[]).sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  // Get events
  const { data: events } = await supabase
    .from("events")
    .select("model_id, event_date, label")
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

// ─── All active models (for checkboxes) ─────────────

export async function getActiveModels(): Promise<Model[]> {
  const { data } = await supabase
    .from("models")
    .select("*")
    .eq("is_active", true)
    .order("display_name");
  return data ?? [];
}

// ─── Free→Paid Transitions ─────────────────────────

export interface TransitionCurve {
  model: {
    id: number;
    display_name: string;
    brand: string;
    color_hex: string;
    permaslug: string;
  };
  transition_date: string;
  data_points: Array<{
    day_offset: number;
    normalized_tokens: number;
    absolute_tokens: number;
  }>;
  context_events: Array<{
    event_date: string;
    days_offset: number;
    label: string;
    type: string;
  }>;
  successor?: string;
}

export async function getTransitionCurves(): Promise<TransitionCurve[]> {
  // Get all free_to_paid events
  const { data: ftpEvents } = await supabase
    .from("events")
    .select("*, models(id, display_name, brand, color_hex, permaslug)")
    .eq("event_type", "free_to_paid")
    .order("event_date", { ascending: false });

  if (!ftpEvents || ftpEvents.length === 0) return [];

  const curves: TransitionCurve[] = [];

  for (const evt of ftpEvents) {
    const model = evt.models as unknown as Model;
    if (!model) continue;

    const transDate = new Date(evt.event_date);
    const dayBefore = new Date(transDate.getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const rangeStart = new Date(transDate.getTime() - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    // Fixed: extend to D+30 (was D+0 before)
    const rangeEnd = new Date(transDate.getTime() + 30 * 86400000)
      .toISOString()
      .slice(0, 10);

    // Get snapshots in range
    const { data: snapshots } = await supabase
      .from("snapshots")
      .select("usage_date, total_tokens, captured_at")
      .eq("model_id", model.id)
      .gte("usage_date", rangeStart)
      .lte("usage_date", rangeEnd)
      .order("captured_at", { ascending: false });

    // Deduplicate per date
    const seen = new Set<string>();
    const byDate = new Map<string, number>();
    for (const s of snapshots ?? []) {
      if (seen.has(s.usage_date)) continue;
      seen.add(s.usage_date);
      byDate.set(s.usage_date, s.total_tokens);
    }

    // Get D-1 value for normalization
    const dMinus1Tokens = byDate.get(dayBefore) ?? 0;
    if (dMinus1Tokens === 0) continue; // Can't normalize

    // Build data points
    const dataPoints: TransitionCurve["data_points"] = [];
    for (const [date, tokens] of byDate) {
      const offset = Math.round(
        (new Date(date).getTime() - transDate.getTime()) / 86400000
      );
      dataPoints.push({
        day_offset: offset,
        normalized_tokens: tokens / dMinus1Tokens,
        absolute_tokens: tokens,
      });
    }
    dataPoints.sort((a, b) => a.day_offset - b.day_offset);

    // Get context events (other events within ±30 days)
    const { data: contextEvts } = await supabase
      .from("events")
      .select("event_date, label, event_type")
      .eq("model_id", model.id)
      .neq("id", evt.id)
      .gte("event_date", rangeStart)
      .lte("event_date", rangeEnd);

    const contextEvents = (contextEvts ?? []).map((ce) => ({
      event_date: ce.event_date,
      days_offset: Math.round(
        (new Date(ce.event_date).getTime() - transDate.getTime()) / 86400000
      ),
      label: ce.label,
      type: ce.event_type,
    }));

    // Find successor: same-brand new_release within ±7 days
    const { data: successorEvts } = await supabase
      .from("events")
      .select("*, models(display_name, brand)")
      .eq("event_type", "new_release")
      .gte("event_date", new Date(transDate.getTime() - 7 * 86400000).toISOString().slice(0, 10))
      .lte("event_date", new Date(transDate.getTime() + 7 * 86400000).toISOString().slice(0, 10));

    const sameBrandSuccessor = (successorEvts ?? []).find((se) => {
      const sModel = se.models as any;
      return sModel?.brand === model.brand && se.model_id !== model.id;
    });

    curves.push({
      model: {
        id: model.id,
        display_name: model.display_name,
        brand: model.brand,
        color_hex: model.color_hex,
        permaslug: model.permaslug,
      },
      transition_date: evt.event_date,
      data_points: dataPoints,
      context_events: contextEvents,
      successor: sameBrandSuccessor
        ? (sameBrandSuccessor.models as any)?.display_name
        : undefined,
    });
  }

  return curves;
}

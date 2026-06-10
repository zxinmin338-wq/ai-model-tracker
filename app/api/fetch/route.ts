import { NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { fetchModelActivity, discoverOpenRouterModels } from "@/lib/openrouter";
import { fetchAnyIntActivity } from "@/lib/anyint";
import {
  fetchZenMuxActivity,
  zenmuxPermaslug,
  type ZenMuxUsageRecord,
} from "@/lib/zenmux";

export const dynamic = "force-dynamic";

const OR_VARIANTS = [
  { variant: "free", is_free: true },
  { variant: "standard", is_free: false },
] as const;

// AnyInt models: permaslug in our DB → slug on AnyInt
const ANYINT_MODELS: Record<string, string> = {
  "ernie-5.1": "ernie-5.1",
};

// Competitor vendor pool — OpenRouter author slugs to auto-discover.
const OR_COMPETITOR_AUTHORS = [
  "deepseek",
  "qwen",
  "tencent",
  "inclusionai",
  "minimax",
  "moonshotai",
  "z-ai",
  "bytedance",
  "bytedance-seed",
];

// ZenMux author slugs for the same 8 vendors (ZenMux uses "bytedance", not the
// "bytedance-seed" split OpenRouter has).
const ZENMUX_COMPETITOR_AUTHORS = [
  "deepseek",
  "qwen",
  "tencent",
  "inclusionai",
  "minimax",
  "moonshotai",
  "z-ai",
  "bytedance",
];

// Drop image/video/audio/asr/omni models by slug name (used for ZenMux, which
// exposes no modality metadata).
const COMPETITOR_EXCLUDE_RE = /(image|video|kling|seedance|audio|tts|asr|omni)/i;

// author slug → brand name for auto-created rows
const BRAND_BY_AUTHOR: Record<string, string> = {
  deepseek: "DeepSeek",
  qwen: "Alibaba",
  tencent: "Tencent",
  inclusionai: "InclusionAI",
  minimax: "MiniMax",
  moonshotai: "Moonshot",
  "z-ai": "Zhipu",
  bytedance: "ByteDance",
  "bytedance-seed": "ByteDance",
};

// Curated palette for auto-assigned colors; overflow falls back to generated
// golden-angle HSL so a large pool never collapses to a single grey.
const COLOR_PALETTE = [
  "#00897B", "#7E57C2", "#F4511E", "#43A047", "#3949AB", "#00ACC1",
  "#FB8C00", "#8D6E63", "#5E35B1", "#039BE5", "#C0CA33", "#D81B60",
  "#6D4C41", "#1E88E5", "#7CB342", "#F06292", "#26A69A", "#AB47BC",
  "#FF7043", "#9CCC65", "#5C6BC0", "#26C6DA", "#FFA726", "#EC407A",
];

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const capturedAt = new Date().toISOString();

  const errors: string[] = [];

  // ─── Auto-discover OpenRouter competitor models (upsert new rows) ───
  // Independent try/catch; a discovery failure must not block collection.
  let orDiscoveredInserted = 0;
  const orDiscoveryByBrand: Record<string, number> = {};
  try {
    const discovered = await discoverOpenRouterModels(OR_COMPETITOR_AUTHORS);

    const { data: existingAll } = await supabase
      .from("models")
      .select("permaslug, color_hex");
    const existingSlugs = new Set(
      (existingAll ?? []).map((m) => m.permaslug)
    );
    const usedColors = new Set((existingAll ?? []).map((m) => m.color_hex));
    const freePalette = COLOR_PALETTE.filter((c) => !usedColors.has(c));
    let paletteIdx = 0;
    let genIdx = 0;
    const nextColor = () => {
      if (paletteIdx < freePalette.length) return freePalette[paletteIdx++];
      const hue = (genIdx++ * 137.508) % 360;
      return hslToHex(hue, 62, 52);
    };

    const newRows = [];
    for (const d of discovered) {
      if (existingSlugs.has(d.permaslug)) continue; // never touch existing rows
      existingSlugs.add(d.permaslug); // dedup within this batch too
      const brand = BRAND_BY_AUTHOR[d.author] ?? d.author;
      newRows.push({
        permaslug: d.permaslug,
        display_name: d.display_name,
        brand,
        provider: d.provider,
        region: "china",
        color_hex: nextColor(),
        is_active: true,
        is_own: false,
      });
      orDiscoveryByBrand[brand] = (orDiscoveryByBrand[brand] ?? 0) + 1;
    }

    if (newRows.length > 0) {
      const { error: insErr } = await supabase.from("models").insert(newRows);
      if (insErr) {
        errors.push(`or-discover-insert: ${insErr.message}`);
      } else {
        orDiscoveredInserted = newRows.length;
      }
    }
  } catch (e) {
    errors.push(
      `or-discover: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // Get all active models (now includes any newly discovered competitor rows)
  const { data: models, error: modelsError } = await supabase
    .from("models")
    .select("id, permaslug, provider")
    .eq("is_active", true);

  if (modelsError || !models) {
    return Response.json(
      { error: "Failed to fetch models", detail: modelsError?.message },
      { status: 500 }
    );
  }

  let inserted = 0;
  let zenmuxInserted = 0;
  const zenmuxModelDecisions: string[] = [];

  for (const model of models) {
    const anyintSlug = ANYINT_MODELS[model.permaslug];

    if (anyintSlug) {
      // ─── AnyInt source ───
      try {
        const records = await fetchAnyIntActivity(anyintSlug);
        if (records.length === 0) continue;

        const rows = records.map((r) => ({
          model_id: model.id,
          captured_at: capturedAt,
          usage_date: r.usage_date,
          total_tokens: r.total_tokens,
          total_requests: r.total_requests,
          is_free: false,
          source: "anyint",
        }));

        const { error: insertError } = await supabase
          .from("snapshots")
          .insert(rows);

        if (insertError) {
          errors.push(`${model.permaslug}[anyint]: ${insertError.message}`);
        } else {
          inserted += rows.length;
        }
      } catch (e) {
        errors.push(
          `${model.permaslug}[anyint]: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    } else {
      // ─── OpenRouter source (free + standard) ───
      for (const { variant, is_free } of OR_VARIANTS) {
        try {
          const records = await fetchModelActivity(model.permaslug, variant);
          if (records.length === 0) continue;

          const rows = records.map((r) => ({
            model_id: model.id,
            captured_at: capturedAt,
            usage_date: r.usage_date,
            total_tokens: r.total_tokens,
            total_requests: r.total_requests,
            is_free,
            source: "openrouter",
          }));

          const { error: insertError } = await supabase
            .from("snapshots")
            .insert(rows);

          if (insertError) {
            errors.push(`${model.permaslug}[${variant}]: ${insertError.message}`);
          } else {
            inserted += rows.length;
          }
        } catch (e) {
          errors.push(
            `${model.permaslug}[${variant}]: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }
  }

  // ─── ZenMux source (one request returns all baidu models, day-bucketed) ───
  // Independent try/catch: a ZenMux failure must not affect OpenRouter/AnyInt.
  try {
    const records = await fetchZenMuxActivity("baidu", 30);

    if (records.length > 0) {
      // Group flat records by the permaslug they map to in our models table.
      const byPermaslug = new Map<string, ZenMuxUsageRecord[]>();
      const rawSlugByPermaslug = new Map<string, string>();
      for (const r of records) {
        const ps = zenmuxPermaslug(r.model_slug);
        if (!byPermaslug.has(ps)) byPermaslug.set(ps, []);
        byPermaslug.get(ps)!.push(r);
        rawSlugByPermaslug.set(ps, r.model_slug);
      }

      // Load all existing models so we can reuse rows (e.g. ernie-5.1) and
      // avoid creating duplicates. Also track used colors for new rows.
      const { data: allModels } = await supabase
        .from("models")
        .select("id, permaslug, color_hex");
      const idByPermaslug = new Map<string, number>(
        (allModels ?? []).map((m) => [m.permaslug, m.id])
      );
      const usedColors = new Set((allModels ?? []).map((m) => m.color_hex));
      const palette = [
        "#00897B",
        "#7E57C2",
        "#F4511E",
        "#43A047",
        "#3949AB",
        "#00ACC1",
        "#FB8C00",
        "#8D6E63",
      ];
      const freeColors = palette.filter((c) => !usedColors.has(c));

      for (const [permaslug, recs] of byPermaslug) {
        const rawSlug = rawSlugByPermaslug.get(permaslug)!;
        let modelId = idByPermaslug.get(permaslug);

        if (modelId) {
          zenmuxModelDecisions.push(
            `${rawSlug} → reuse existing model #${modelId} (${permaslug})`
          );
        } else {
          // ZenMux-only model: create a new row.
          const color = freeColors.shift() ?? "#888";
          const { data: created, error: createErr } = await supabase
            .from("models")
            .insert({
              permaslug,
              display_name: deriveDisplayName(permaslug),
              brand: "Baidu",
              provider: "Qianfan",
              region: "china",
              current_status: "paid",
              is_active: true,
              color_hex: color,
            })
            .select("id")
            .single();

          if (createErr || !created) {
            errors.push(
              `${permaslug}[zenmux]: create model failed: ${createErr?.message}`
            );
            continue;
          }
          const newId: number = created.id;
          modelId = newId;
          idByPermaslug.set(permaslug, newId);
          zenmuxModelDecisions.push(
            `${rawSlug} → NEW model #${newId} (${permaslug}, color ${color})`
          );
        }

        const resolvedModelId = modelId;
        const rows = recs.map((r) => ({
          model_id: resolvedModelId,
          captured_at: capturedAt,
          usage_date: r.usage_date,
          total_tokens: r.total_tokens,
          total_requests: null, // ZenMux provides tokens only
          is_free: false,
          source: "zenmux",
        }));

        const { error: insertError } = await supabase
          .from("snapshots")
          .insert(rows);

        if (insertError) {
          errors.push(`${permaslug}[zenmux]: ${insertError.message}`);
        } else {
          inserted += rows.length;
          zenmuxInserted += rows.length;
        }
      }
    }
  } catch (e) {
    errors.push(`zenmux: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── ZenMux competitor auto-discovery (8 vendor author slugs) ───
  // Separate rows from OpenRouter (no cross-platform merge). permaslug =
  // ZenMux model_slug; if it collides with a NON-zenmux row (e.g. an OR row),
  // namespace as "<model_slug>@zenmux" so the platforms stay on separate rows.
  // Idempotent: re-runs reuse the same rows.
  let zenmuxCompModelsCreated = 0;
  let zenmuxCompSnapshots = 0;
  const zenmuxCompByBrand: Record<string, number> = {};
  try {
    const { data: allModels2 } = await supabase
      .from("models")
      .select("id, permaslug, color_hex");
    const idByPermaslug = new Map<string, number>(
      (allModels2 ?? []).map((m) => [m.permaslug, m.id])
    );
    const usedColors = new Set((allModels2 ?? []).map((m) => m.color_hex));
    const freePalette = COLOR_PALETTE.filter((c) => !usedColors.has(c));
    let pIdx = 0;
    let gIdx = 0;
    const nextColor = () => {
      if (pIdx < freePalette.length) return freePalette[pIdx++];
      const hue = (gIdx++ * 137.508) % 360;
      return hslToHex(hue, 62, 52);
    };

    // Does an existing model row already have zenmux data? (collision tiebreak)
    const zenmuxOwnedCache = new Map<number, boolean>();
    const hasZenmuxData = async (modelId: number): Promise<boolean> => {
      const cached = zenmuxOwnedCache.get(modelId);
      if (cached !== undefined) return cached;
      const { data } = await supabase
        .from("snapshots")
        .select("id")
        .eq("model_id", modelId)
        .eq("source", "zenmux")
        .limit(1);
      const has = (data?.length ?? 0) > 0;
      zenmuxOwnedCache.set(modelId, has);
      return has;
    };

    for (const author of ZENMUX_COMPETITOR_AUTHORS) {
      let records: ZenMuxUsageRecord[];
      try {
        records = await fetchZenMuxActivity(author, 30);
      } catch (e) {
        errors.push(
          `zenmux[${author}]: fetch failed: ${e instanceof Error ? e.message : String(e)}`
        );
        continue;
      }

      // filter out non-text models, group remaining by raw model_slug
      const byModelSlug = new Map<string, ZenMuxUsageRecord[]>();
      for (const r of records) {
        if (COMPETITOR_EXCLUDE_RE.test(r.model_slug)) continue;
        if (!byModelSlug.has(r.model_slug)) byModelSlug.set(r.model_slug, []);
        byModelSlug.get(r.model_slug)!.push(r);
      }
      const brand = BRAND_BY_AUTHOR[author] ?? author;

      for (const [modelSlug, recs] of byModelSlug) {
        // Resolve permaslug: namespace only when colliding with a foreign row.
        let permaslug = modelSlug;
        const collidingId = idByPermaslug.get(modelSlug);
        if (collidingId !== undefined && !(await hasZenmuxData(collidingId))) {
          permaslug = `${modelSlug}@zenmux`;
        }

        let modelId = idByPermaslug.get(permaslug);
        if (modelId === undefined) {
          const nameBase = modelSlug.replace(/^[^/]+\//, "");
          const color = nextColor();
          const { data: created, error: createErr } = await supabase
            .from("models")
            .insert({
              permaslug,
              display_name: deriveDisplayName(nameBase),
              brand,
              provider: null, // ZenMux exposes no provider
              region: "china",
              is_active: true,
              is_own: false,
              color_hex: color,
            })
            .select("id")
            .single();
          if (createErr || !created) {
            errors.push(
              `${permaslug}[zenmux-comp]: create failed: ${createErr?.message}`
            );
            continue;
          }
          modelId = created.id as number;
          idByPermaslug.set(permaslug, modelId);
          zenmuxOwnedCache.set(modelId, true);
          zenmuxCompModelsCreated++;
          zenmuxCompByBrand[brand] = (zenmuxCompByBrand[brand] ?? 0) + 1;
        }

        const mid = modelId;
        const rows = recs.map((r) => ({
          model_id: mid,
          captured_at: capturedAt,
          usage_date: r.usage_date,
          total_tokens: r.total_tokens,
          total_requests: null,
          is_free: false,
          source: "zenmux",
        }));
        const { error: insErr } = await supabase
          .from("snapshots")
          .insert(rows);
        if (insErr) {
          errors.push(`${permaslug}[zenmux-comp]: ${insErr.message}`);
        } else {
          inserted += rows.length;
          zenmuxCompSnapshots += rows.length;
        }
      }
    }
  } catch (e) {
    errors.push(
      `zenmux-comp: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return Response.json({
    ok: true,
    inserted,
    zenmux_inserted: zenmuxInserted,
    zenmux_model_decisions: zenmuxModelDecisions,
    or_discovered_inserted: orDiscoveredInserted,
    or_discovery_by_brand: orDiscoveryByBrand,
    zenmux_competitor_models_created: zenmuxCompModelsCreated,
    zenmux_competitor_snapshots: zenmuxCompSnapshots,
    zenmux_competitor_by_brand: zenmuxCompByBrand,
    models_processed: models.length,
    sources: "openrouter (free+standard) + anyint + zenmux + zenmux-competitors",
    errors: errors.length > 0 ? errors : undefined,
    captured_at: capturedAt,
  });
}

/** Build a readable display name from a permaslug, e.g.
 *  "ernie-5.0-thinking-preview" -> "ERNIE 5.0 Thinking Preview". */
function deriveDisplayName(permaslug: string): string {
  return permaslug
    .split(/[-_]/)
    .map((part) => {
      if (/^ernie$/i.test(part)) return "ERNIE";
      if (/\d/.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

import { NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { fetchModelActivity } from "@/lib/openrouter";
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

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const capturedAt = new Date().toISOString();

  // Get all active models
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
  const errors: string[] = [];
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

  return Response.json({
    ok: true,
    inserted,
    zenmux_inserted: zenmuxInserted,
    zenmux_model_decisions: zenmuxModelDecisions,
    models_processed: models.length,
    sources: "openrouter (free+standard) + anyint + zenmux",
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

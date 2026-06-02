import { NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { fetchModelActivity } from "@/lib/openrouter";
import { fetchAnyIntActivity } from "@/lib/anyint";

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
  const errors: string[] = [];

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

  return Response.json({
    ok: true,
    inserted,
    models_processed: models.length,
    sources: "openrouter (free+standard) + anyint",
    errors: errors.length > 0 ? errors : undefined,
    captured_at: capturedAt,
  });
}

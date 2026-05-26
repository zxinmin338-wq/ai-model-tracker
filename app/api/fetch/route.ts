import { NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { fetchModelActivity } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

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
    .select("id, permaslug")
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
    try {
      const records = await fetchModelActivity(model.permaslug);

      if (records.length === 0) {
        errors.push(`${model.permaslug}: no records returned`);
        continue;
      }

      const rows = records.map((r) => ({
        model_id: model.id,
        captured_at: capturedAt,
        usage_date: r.usage_date,
        total_tokens: r.total_tokens,
        total_requests: r.total_requests,
      }));

      const { error: insertError } = await supabase
        .from("snapshots")
        .insert(rows);

      if (insertError) {
        errors.push(`${model.permaslug}: ${insertError.message}`);
      } else {
        inserted += rows.length;
      }
    } catch (e) {
      errors.push(
        `${model.permaslug}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return Response.json({
    ok: true,
    inserted,
    models_processed: models.length,
    errors: errors.length > 0 ? errors : undefined,
    captured_at: capturedAt,
  });
}

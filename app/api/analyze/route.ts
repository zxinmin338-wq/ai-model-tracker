import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase";
import { getRanking, getDailyUsage } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
// DeepSeek API exposes deepseek-v4-flash / deepseek-v4-pro (verified via /models).
const DEEPSEEK_MODEL = "deepseek-v4-flash";
// v4-flash is a reasoning model: reasoning_tokens count against max_tokens, so
// 1200 truncated the visible answer. Headroom for reasoning + the ~250字 output.
const MAX_TOKENS = 2500;

// ─── Prompts (Section 11 — used verbatim) ───────────

const SYSTEM_PROMPT = `你是 AI 模型市场分析助手。严格遵守以下约束:
【数据边界】只允许使用输入数据中明确给出的数字,禁止编造、估算、外推任何数值;每个数字结论必须可溯源到输入;输入未覆盖的维度明确说"数据未覆盖",不猜。
【判断边界】允许描述性判断(身位、趋势方向、同档归类、差距量级、变化速度);禁止处方性指令——不说"应该/建议做X",改为并列呈现"若做X,依据是…;若不做,依据是…",选择留给人;禁止归因猜测,不编造输入里没有的原因,最多说"原因未知,数据上表现为…"。
【诚实边界】样本不足时直说不足及需要多少,不硬给结论;数据有口径限制时主动声明;趋势判断必须注明依据天数。
【格式边界】严格按指定 section 结构输出,不自由发挥,不加开场白和总结;禁用"水平/表现/情况/亮眼/承压"等泛化词,用具体维度和数字;简体中文。`;

function buildUserPrompt(
  ownModelName: string,
  dbTotal: number,
  poolSize: number,
  structured: unknown
): string {
  return `基于以下数据回答 4 个问题,150-250字,严格按 4 个 numbered sections 输出:
[输入数据:${JSON.stringify(structured, null, 2)}]
1. **绝对水平:** 我方模型(${ownModelName})近7天累计 tokens 是多少?近30天呢?
2. **相对身位:** 我方模型的两个排名口径都给出——全库排名第几(共 ${dbTotal} 个模型,rank_in_db)、所选竞品池内排名第几(共 ${poolSize} 个,rank_in_pool)?与哪些模型同档(差距<20%)?距头部模型差几个数量级?
3. **趋势判断:** 基于近7天数据,我方模型处于上升/平稳/下降?日均增长率多少?
4. **值得注意的信号:** 从输入数据中指出值得关注的异常、拐点或事件(如显著高/低增速、通道断流/数据为0、竞品大幅波动、相关 free→paid 事件)。有信号则列出(最多3条,每条注明依据的具体数字);无信号则直说"本期无显著异常"。`;
}

// ─── Data assembly ──────────────────────────────────

interface ModelDatum {
  name: string;
  permaslug: string;
  is_own: boolean;
  tokens_7d: number;
  tokens_30d: number;
  daily_avg_growth_7d_pct: number | null;
  rank_in_db: number | null; // position in the full ranking (all models)
  rank_in_pool: number | null; // position within the selected pool
}

export async function POST(request: NextRequest) {
  let body: { permaslugs?: string[]; slugs?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const permaslugs = (body.permaslugs ?? body.slugs ?? []).filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  if (permaslugs.length === 0) {
    return Response.json({ error: "permaslugs required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Cache key = sorted permaslugs + today (UTC) + type
  const sorted = [...permaslugs].sort();
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = createHash("sha256")
    .update(`compare|${sorted.join(",")}|${today}`)
    .digest("hex");

  // Cache hit?
  const { data: cached } = await supabase
    .from("analysis_cache")
    .select("content, model_data_snapshot, created_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (cached) {
    return Response.json({
      cached: true,
      content: cached.content,
      data: cached.model_data_snapshot,
      created_at: cached.created_at,
    });
  }

  // ─── Fetch data (only the three blocks specified) ───
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "DEEPSEEK_API_KEY is not set" },
      { status: 500 }
    );
  }

  let ranking, usage;
  try {
    [ranking, usage] = await Promise.all([
      getRanking(), // sorted by tokens_7d desc
      getDailyUsage(sorted, 30, "all"), // 30-day daily totals (all channels/platforms)
    ]);
  } catch (e) {
    return Response.json(
      { error: `data fetch failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }

  const rankIndex = new Map(ranking.map((r, i) => [r.permaslug, i + 1]));
  const byPermaslug = new Map(ranking.map((r) => [r.permaslug, r]));
  const series = usage.series; // [{ date, [permaslug]: tokens, ... }]

  // Per-model 30d sum (from series), 7d (authoritative from ranking),
  // and last-7-day average daily growth rate.
  function metricsForSlug(slug: string) {
    const vals = series.map((row) => Number(row[slug] ?? 0)); // ascending by date
    const tokens_30d = vals.reduce((a, b) => a + b, 0);
    const last7 = vals.slice(-7);
    let growthSum = 0;
    let n = 0;
    for (let i = 1; i < last7.length; i++) {
      if (last7[i - 1] > 0) {
        growthSum += (last7[i] - last7[i - 1]) / last7[i - 1];
        n++;
      }
    }
    const daily_avg_growth_7d_pct =
      n > 0 ? Number(((growthSum / n) * 100).toFixed(1)) : null;
    return { tokens_30d, daily_avg_growth_7d_pct };
  }

  const models: ModelDatum[] = sorted.map((slug) => {
    const r = byPermaslug.get(slug);
    const m = metricsForSlug(slug);
    return {
      name: r?.display_name ?? slug,
      permaslug: slug,
      is_own: !!r?.is_own,
      tokens_7d: r?.tokens_7d ?? 0,
      tokens_30d: m.tokens_30d,
      daily_avg_growth_7d_pct: m.daily_avg_growth_7d_pct,
      rank_in_db: rankIndex.get(slug) ?? null,
      rank_in_pool: null, // filled below
    };
  });

  // Rank within the selected pool (by tokens_7d desc)
  [...models]
    .sort((a, b) => b.tokens_7d - a.tokens_7d)
    .forEach((m, i) => {
      m.rank_in_pool = i + 1;
    });

  // free_to_paid events (all of them)
  const { data: evRows } = await supabase
    .from("events")
    .select("event_date, label, models(display_name)")
    .eq("event_type", "free_to_paid")
    .order("event_date");
  const free_to_paid_events = (evRows ?? []).map(
    (e: { event_date: string; label: string; models: unknown }) => ({
      date: e.event_date,
      label: e.label,
      model:
        (e.models as { display_name?: string } | null)?.display_name ?? null,
    })
  );

  const structured = {
    ranking_metric: "近7日 tokens(全通道全平台合计)",
    total_models_in_db: ranking.length,
    selected_pool_size: models.length,
    models,
    free_to_paid_events,
  };

  const ownNames = models.filter((m) => m.is_own).map((m) => m.name);
  const ownModelName = ownNames.length > 0 ? ownNames.join("、") : "(无我方模型)";

  // ─── Call DeepSeek (OpenAI-compatible) ───
  let content: string;
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt(
              ownModelName,
              ranking.length,
              models.length,
              structured
            ),
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const detail = await res.text();
      return Response.json(
        { error: `DeepSeek HTTP ${res.status}`, detail: detail.slice(0, 500) },
        { status: 502 }
      );
    }
    const j = await res.json();
    content = j?.choices?.[0]?.message?.content ?? "";
    if (!content) {
      return Response.json(
        { error: "DeepSeek returned empty content", raw: j },
        { status: 502 }
      );
    }
  } catch (e) {
    return Response.json(
      { error: `DeepSeek call failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  // ─── Write cache (best-effort) ───
  const { error: cacheErr } = await supabase.from("analysis_cache").insert({
    cache_key: cacheKey,
    analysis_type: "compare",
    content,
    model_data_snapshot: structured,
  });

  return Response.json({
    cached: false,
    content,
    data: structured,
    cache_write_error: cacheErr?.message,
  });
}

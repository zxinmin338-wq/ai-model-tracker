import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase";
import { getRanking, getRankingBreakdown } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const MAX_TOKENS = 1500; // v4-flash reasoning_tokens count against the budget

const TRIVIAL_MIN_ACTIVE_DAYS = 3; // <3 active days in 7d → trivial platform
const SAME_TIER_PCT = 0.2; // within ±20% = same tier

const PLATFORM_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  anyint: "AnyInt",
  zenmux: "ZenMux",
};
const platformLabel = (s: string) => PLATFORM_LABELS[s] ?? s;

// ─── Prompt (Section 11, per-platform vs full-DB pool) ─

function buildPrompt(ownModelName: string, structured: unknown): string {
  return `你是 AI 模型市场分析助手。基于以下数据，回答这 3 个问题（简体中文，280字内）：
[输入数据：${JSON.stringify(structured, null, 2)}]
1. 绝对水平：我方模型 (${ownModelName}) 近7天各平台 tokens 分别多少？合计多少？量级极低的平台标注"(量级极低)"。
2. 相对身位（分平台、对比该平台全库模型）：我方模型在它有效运营的每个平台上，于该平台全部模型中排第几？跟哪些模型同档（差距<20%）？距该平台头部差几个数量级？数据量不足的平台直接说"该平台数据量不足，不评估身位"，不要硬排。
3. 趋势判断：基于有效平台数据，我方模型在各有效平台是上升/平稳/下降？周环比增长率(近7天 vs 前7天, wow_growth_pct)分别是多少？trivial 平台不计趋势。
严格规则：
- 不编数据，数字全部取自输入
- 身位只在同平台内比较，绝不跨平台比量
- 数据量不足的平台不下身位/趋势结论，明确说明原因（不静默丢弃）
- 不做任何决策建议，只描述身位
- 不用"水平/表现/情况"等泛化词
- 严格输出 3 个 numbered sections`;
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
  const sorted = [...permaslugs].sort();
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = createHash("sha256")
    .update(`compare|${sorted.join(",")}|${today}`)
    .digest("hex");

  const { data: cachedRow } = await supabase
    .from("analysis_cache")
    .select("content, model_data_snapshot, created_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (cachedRow) {
    return Response.json({
      cached: true,
      content: cachedRow.content,
      data: cachedRow.model_data_snapshot,
      created_at: cachedRow.created_at,
    });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "DEEPSEEK_API_KEY is not set" }, { status: 500 });
  }

  // ranking (id/name/is_own) + full-DB per-(model,source) 7d breakdown
  let ranking, breakdown;
  try {
    [ranking, breakdown] = await Promise.all([getRanking(), getRankingBreakdown()]);
  } catch (e) {
    return Response.json(
      { error: `data fetch failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }

  const bySlug = new Map(ranking.map((r) => [r.permaslug, r]));
  const idToName = new Map(ranking.map((r) => [r.id, r.display_name]));

  // ── Full-DB ranked pool per platform (ALL models with data on that source) ──
  const fullPools = new Map<
    string,
    Array<{ id: number; name: string; tokens_7d: number; rank: number }>
  >();
  // per (model_id|source): 7d + prev-7d tokens (for week-over-week growth)
  const msBreakdown = new Map<string, { t7: number; tprev: number }>();
  {
    const bySource = new Map<string, Map<number, number>>();
    for (const b of breakdown) {
      const m = bySource.get(b.source) ?? new Map<number, number>();
      m.set(b.model_id, (m.get(b.model_id) ?? 0) + Number(b.tokens_7d));
      bySource.set(b.source, m);
      const mk = `${b.model_id}|${b.source}`;
      const cur = msBreakdown.get(mk) ?? { t7: 0, tprev: 0 };
      cur.t7 += Number(b.tokens_7d);
      cur.tprev += Number(b.tokens_prev_7d);
      msBreakdown.set(mk, cur);
    }
    for (const [src, m] of bySource) {
      const arr = [...m.entries()]
        .filter(([, t]) => t > 0)
        .map(([id, t]) => ({ id, name: idToName.get(id) ?? String(id), tokens_7d: t, rank: 0 }))
        .sort((a, b) => b.tokens_7d - a.tokens_7d);
      arr.forEach((e, i) => (e.rank = i + 1));
      fullPools.set(src, arr);
    }
  }

  // ── Per own-model, per-platform daily detail (active days + trivial + growth) ──
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  async function ownModelPlatformDaily(modelId: number) {
    // paginate past the 1000-row cap
    const rows: Array<{ usage_date: string; total_tokens: number; is_free: boolean; source: string }> = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from("snapshots")
        .select("usage_date, total_tokens, captured_at, is_free, source")
        .eq("model_id", modelId)
        .gte("usage_date", since7)
        .order("captured_at", { ascending: false })
        .range(from, from + 999);
      if (!page || page.length === 0) break;
      rows.push(...page);
      if (page.length < 1000) break;
    }
    // dedup latest per (usage_date, is_free, source) → per-source date→tokens
    const seen = new Set<string>();
    const perSource = new Map<string, Map<string, number>>(); // source -> (date -> tokens)
    for (const r of rows) {
      const k = `${r.usage_date}_${r.is_free}_${r.source}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const dm = perSource.get(r.source) ?? new Map<string, number>();
      dm.set(r.usage_date, (dm.get(r.usage_date) ?? 0) + r.total_tokens);
      perSource.set(r.source, dm);
    }
    return perSource;
  }

  const ownSlugs = sorted.filter((s) => bySlug.get(s)?.is_own);
  const ourModels = [];
  for (const slug of ownSlugs) {
    const r = bySlug.get(slug)!;
    const perSource = await ownModelPlatformDaily(r.id);

    const platforms = [];
    let totalTokens = 0;

    for (const [src, dateMap] of perSource) {
      const tokens_7d = [...dateMap.values()].reduce((a, b) => a + b, 0);
      const active_days = [...dateMap.values()].filter((v) => v > 0).length;
      totalTokens += tokens_7d;
      const trivial = active_days < TRIVIAL_MIN_ACTIVE_DAYS;

      if (trivial) {
        platforms.push({
          platform: platformLabel(src),
          tokens_7d,
          active_days,
          trivial: true,
          note: "数据量不足(近7天有量天数<3)，已排除身位与趋势评估",
        });
        continue;
      }

      // rank against the FULL-DB pool on this platform
      const pool = fullPools.get(src) ?? [];
      const self = pool.find((p) => p.id === r.id);
      const head = pool[0];
      const sameTier = pool
        .filter(
          (p) =>
            p.id !== r.id &&
            tokens_7d > 0 &&
            Math.abs(p.tokens_7d - tokens_7d) / tokens_7d < SAME_TIER_PCT
        )
        .slice(0, 5)
        .map((p) => ({ name: p.name, tokens_7d: p.tokens_7d }));

      // Week-over-week growth (近7天 vs 前7天) — stable, unlike avg daily %change.
      const bd = msBreakdown.get(`${r.id}|${src}`);
      const wow_growth_pct =
        bd && bd.tprev > 0
          ? Number((((bd.t7 - bd.tprev) / bd.tprev) * 100).toFixed(1))
          : null;

      platforms.push({
        platform: platformLabel(src),
        tokens_7d,
        active_days,
        trivial: false,
        rank_in_platform_fulldb: self?.rank ?? null,
        platform_pool_size_fulldb: pool.length,
        platform_head: head ? { name: head.name, tokens_7d: head.tokens_7d } : null,
        same_tier: sameTier,
        wow_growth_pct,
        wow_note:
          wow_growth_pct === null ? "前7天无数据，周环比不可计算" : undefined,
      });
    }

    ourModels.push({
      name: r.display_name,
      total_tokens_7d: totalTokens,
      platforms,
    });
  }

  const structured = {
    metric:
      "近7天 tokens(prompt+completion); 身位=对比该平台【全库】所有有数据模型; 仅同平台内比较; trivial平台(有量天数<3)不评估身位/趋势",
    our_models: ourModels,
  };

  const ownNames = ourModels.map((m) => m.name);
  const ownModelName = ownNames.length > 0 ? ownNames.join("、") : "(无我方模型)";

  // ─── Call DeepSeek ───
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
        messages: [{ role: "user", content: buildPrompt(ownModelName, structured) }],
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
      return Response.json({ error: "DeepSeek returned empty content", raw: j }, { status: 502 });
    }
  } catch (e) {
    return Response.json(
      { error: `DeepSeek call failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

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

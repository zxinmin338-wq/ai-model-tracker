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

// ─── Prompt (neutral: 对比模型 subject [vs 参照模型 reference]) ─

function buildPrompt(
  subjectName: string,
  referenceName: string | null,
  structured: unknown
): string {
  const hasRef = !!referenceName;
  const sec4 = hasRef
    ? `\n4. 正面对比：在 ${subjectName} 与参照模型 (${referenceName}) 都有数据的平台上，分别谁的 tokens 更高、高多少倍或百分比？周环比谁涨得更快？只描述谁高谁低与差距，不下任何判断或建议。`
    : "";
  return `你是 AI 模型市场分析助手。基于以下数据，回答这 ${hasRef ? 4 : 3} 个问题（简体中文，300字内）：
[输入数据：${JSON.stringify(structured, null, 2)}]
1. 绝对水平：对比模型 (${subjectName}) 近7天各平台 tokens 分别多少？合计多少？量级极低的平台标注"(量级极低)"。
2. 相对身位（分平台、对比该平台全库模型）：对比模型在它有效运营的每个平台上，于该平台全部模型中排第几？跟哪些模型同档（差距<20%）？距该平台头部差几个数量级？数据量不足的平台直接说"该平台数据量不足，不评估身位"。
3. 周环比趋势：基于有效平台数据，对比模型在各有效平台是上升/平稳/下降？周环比增长率(近7天 vs 前7天, wow_growth_pct)分别多少？trivial 平台不计趋势。${sec4}
严格规则：
- 不编数据，数字全部取自输入
- 身位只在同平台内比较，绝不跨平台比量
- 数据量不足的平台不下身位/趋势结论，明确说明原因（不静默丢弃）
- 不做任何决策建议，只描述身位与对比
- 不用"水平/表现/情况"等泛化词
- 严格输出 ${hasRef ? 4 : 3} 个 numbered sections`;
}

export async function POST(request: NextRequest) {
  let body: { subject?: string; reference?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const subject =
    typeof body.subject === "string" && body.subject ? body.subject : null;
  const reference =
    typeof body.reference === "string" && body.reference ? body.reference : null;
  if (!subject) {
    return Response.json({ error: "subject (permaslug) required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = createHash("sha256")
    .update(`compare|${subject}|${reference ?? "none"}|${today}`)
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

  let ranking, breakdown;
  try {
    [ranking, breakdown] = await Promise.all([getRanking(), getRankingBreakdown()]);
  } catch (e) {
    return Response.json(
      { error: `data fetch failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }

  // getRankingBreakdown() returns [] on RPC error/timeout (the breakdown RPC is
  // heavy — ~7s cold). An empty breakdown would silently make EVERY platform's
  // pool_size=0 (misleading "无法评估身位") AND get cached. Fail visibly instead:
  // retry once (it's slow, not broken), then bail without caching so the user
  // can retry against a warm RPC.
  if (breakdown.length === 0) {
    breakdown = await getRankingBreakdown();
  }
  if (breakdown.length === 0) {
    return Response.json(
      {
        error:
          "排名分布数据暂不可用（breakdown RPC 可能超时），请重试。未生成分析、未写缓存。",
      },
      { status: 503 }
    );
  }

  const bySlug = new Map(ranking.map((r) => [r.permaslug, r]));
  const idToName = new Map(ranking.map((r) => [r.id, r.display_name]));

  // ── Full-DB ranked pool per platform + per-(model,source) 7d/prev tokens ──
  const fullPools = new Map<
    string,
    Array<{ id: number; name: string; tokens_7d: number; rank: number }>
  >();
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

  const since7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // per-(source) date→tokens for one model (paginate past the 1000-row cap)
  async function dailyBySource(modelId: number) {
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
    const seen = new Set<string>();
    const perSource = new Map<string, Map<string, number>>();
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

  interface PlatformStanding {
    platform: string;
    tokens_7d: number;
    active_days: number;
    trivial: boolean;
    note?: string;
    rank_in_platform_fulldb?: number | null;
    platform_pool_size_fulldb?: number;
    platform_head?: { name: string; tokens_7d: number } | null;
    same_tier?: Array<{ name: string; tokens_7d: number }>;
    wow_growth_pct?: number | null;
  }

  async function modelStanding(permaslug: string) {
    const row = bySlug.get(permaslug);
    if (!row) return { found: false as const, permaslug };
    const perSource = await dailyBySource(row.id);
    const platforms: PlatformStanding[] = [];
    let total = 0;
    for (const [src, dateMap] of perSource) {
      const tokens_7d = [...dateMap.values()].reduce((a, b) => a + b, 0);
      const active_days = [...dateMap.values()].filter((v) => v > 0).length;
      total += tokens_7d;
      if (active_days < TRIVIAL_MIN_ACTIVE_DAYS) {
        platforms.push({
          platform: platformLabel(src),
          tokens_7d,
          active_days,
          trivial: true,
          note: "数据量不足(近7天有量天数<3)，已排除身位与趋势评估",
        });
        continue;
      }
      const pool = fullPools.get(src) ?? [];
      const self = pool.find((p) => p.id === row.id);
      const head = pool[0];
      const same_tier = pool
        .filter(
          (p) =>
            p.id !== row.id &&
            tokens_7d > 0 &&
            Math.abs(p.tokens_7d - tokens_7d) / tokens_7d < SAME_TIER_PCT
        )
        .slice(0, 5)
        .map((p) => ({ name: p.name, tokens_7d: p.tokens_7d }));
      const bd = msBreakdown.get(`${row.id}|${src}`);
      const wow_growth_pct =
        bd && bd.tprev > 0 ? Number((((bd.t7 - bd.tprev) / bd.tprev) * 100).toFixed(1)) : null;
      platforms.push({
        platform: platformLabel(src),
        tokens_7d,
        active_days,
        trivial: false,
        rank_in_platform_fulldb: self?.rank ?? null,
        platform_pool_size_fulldb: pool.length,
        platform_head: head ? { name: head.name, tokens_7d: head.tokens_7d } : null,
        same_tier,
        wow_growth_pct,
      });
    }
    return { found: true as const, name: row.display_name, total_tokens_7d: total, platforms };
  }

  const subjectData = await modelStanding(subject);
  if (!subjectData.found) {
    return Response.json({ error: `subject not found: ${subject}` }, { status: 404 });
  }
  const referenceData = reference ? await modelStanding(reference) : null;
  const referenceName =
    referenceData && referenceData.found ? referenceData.name : null;

  // ── Head-to-head on platforms where BOTH have non-trivial data ──
  const head_to_head: Array<{
    platform: string;
    subject_tokens_7d: number;
    reference_tokens_7d: number;
    subject_higher: boolean;
    higher_over_lower_times: number | null;
    subject_wow_pct: number | null | undefined;
    reference_wow_pct: number | null | undefined;
  }> = [];
  if (referenceData && referenceData.found) {
    const refByPlat = new Map(
      referenceData.platforms.filter((p) => !p.trivial).map((p) => [p.platform, p])
    );
    for (const p of subjectData.platforms.filter((p) => !p.trivial)) {
      const r = refByPlat.get(p.platform);
      if (!r) continue;
      const hi = Math.max(p.tokens_7d, r.tokens_7d);
      const lo = Math.min(p.tokens_7d, r.tokens_7d);
      head_to_head.push({
        platform: p.platform,
        subject_tokens_7d: p.tokens_7d,
        reference_tokens_7d: r.tokens_7d,
        subject_higher: p.tokens_7d >= r.tokens_7d,
        // 高者是低者的几倍（始终 ≥1，不会因极差被舍成 0）
        higher_over_lower_times: lo > 0 ? Number((hi / lo).toFixed(1)) : null,
        subject_wow_pct: p.wow_growth_pct,
        reference_wow_pct: r.wow_growth_pct,
      });
    }
  }

  const structured = {
    metric:
      "近7天 tokens(prompt+completion); 身位=对比该平台【全库】所有有数据模型; 仅同平台内比较; trivial平台(有量天数<3)不评估身位/趋势",
    subject: { name: subjectData.name, total_tokens_7d: subjectData.total_tokens_7d, platforms: subjectData.platforms },
    reference:
      referenceData && referenceData.found
        ? { name: referenceData.name, total_tokens_7d: referenceData.total_tokens_7d, platforms: referenceData.platforms }
        : null,
    head_to_head: referenceData && referenceData.found ? head_to_head : undefined,
  };

  // ─── Call DeepSeek ───
  let content: string;
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "user", content: buildPrompt(subjectData.name, referenceName, structured) },
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

import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase";
import { getRanking, getRankingBreakdown } from "@/lib/queries";
import { aggregateCompanies } from "@/lib/company";

export const dynamic = "force-dynamic";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const MAX_TOKENS = 1500; // v4-flash reasoning_tokens count against the budget

const SAME_TIER_PCT = 0.2; // within ±20% = same tier

const PLATFORM_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  anyint: "AnyInt",
  zenmux: "ZenMux",
};
const platformLabel = (s: string) => PLATFORM_LABELS[s] ?? s;

// ─── Prompt (company-level, scoped to one platform, 3 sections) ─

function buildPrompt(
  brand: string,
  platformScope: string,
  structured: unknown
): string {
  return `你是 AI 模型市场分析助手。基于以下数据，回答这 3 个问题（简体中文，260字内）。**所有结论都只在 ${platformScope} 平台上，禁止跨平台比量，不要提其他平台**：
[输入数据：${JSON.stringify(structured, null, 2)}]
1. 绝对水平：${brand} 在 ${platformScope} 平台上聚合总量（旗下 N 个模型 tokens 求和）是多少？量级极低则标注"(量级极低)"。
2. 相对身位：${brand} 在 ${platformScope} 平台全部公司中排第几（共几家）？跟哪些公司同档（聚合总量差距<20%）？距该平台头部公司差几个数量级？
3. 周环比趋势：${brand} 在 ${platformScope} 平台聚合周环比(近7天 vs 前7天, wow_growth_pct)是上升/平稳/下降、增长率多少？若 wow_growth_pct 为 null（无上周数据）则说"数据不足，不评估趋势"，不要瞎算。
严格规则：
- 不编数据，数字全部取自输入
- 只在 ${platformScope} 平台内比较，绝不跨平台比量、不提其他平台
- 数据量不足时不下结论，明确说明原因（不静默丢弃）
- 不做任何决策建议，只描述身位与趋势
- 不用"水平/表现/情况"等泛化词
- 严格输出 3 个 numbered sections`;
}

export async function POST(request: NextRequest) {
  let body: { brand?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const brand =
    typeof body.brand === "string" && body.brand ? body.brand : null;
  const platform =
    typeof body.platform === "string" && body.platform ? body.platform : null;
  if (!brand) {
    return Response.json({ error: "brand required" }, { status: 400 });
  }
  if (!platform) {
    return Response.json({ error: "platform (source) required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = createHash("sha256")
    .update(`company|${brand}|${platform}|${today}`)
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

  // getRankingBreakdown() returns [] on RPC error/timeout (heavy RPC, ~7s cold).
  // An empty breakdown would silently make every company's total 0 AND get
  // cached. Fail visibly: retry once (slow, not broken), then bail without
  // caching so the user can retry against a warm RPC.
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

  // ── Aggregate every company on this platform, ranked by tokens_7d desc ──
  const companies = aggregateCompanies(breakdown, ranking, platform);
  const self = companies.find((c) => c.brand === brand);
  if (!self) {
    return Response.json(
      { error: `${brand} 在 ${platformLabel(platform)} 平台无数据，无法分析。` },
      { status: 404 }
    );
  }

  const head = companies[0];
  const same_tier = companies
    .filter(
      (c) =>
        c.brand !== brand &&
        self.tokens_7d > 0 &&
        Math.abs(c.tokens_7d - self.tokens_7d) / self.tokens_7d < SAME_TIER_PCT
    )
    .slice(0, 5)
    .map((c) => ({ brand: c.brand, tokens_7d: c.tokens_7d, model_count: c.model_count }));

  // orders of magnitude between head and self (≥0)
  const magnitude_gap_to_head =
    head && self.tokens_7d > 0
      ? Number(Math.log10(head.tokens_7d / self.tokens_7d).toFixed(1))
      : null;

  const structured = {
    metric:
      "近7天 tokens(prompt+completion) 按公司(brand)聚合(旗下模型求和); 身位=对比该平台【全部公司】; 仅同平台内比较; 周环比 wow_growth_pct=null 表示无上周数据(数据不足)",
    platform_scope: platformLabel(platform),
    company_count: companies.length,
    subject: {
      brand: self.brand,
      tokens_7d: self.tokens_7d,
      tokens_prev_7d: self.tokens_prev_7d,
      model_count: self.model_count,
      rank: self.rank,
      wow_growth_pct: self.wow_growth_pct,
    },
    platform_head: head
      ? { brand: head.brand, tokens_7d: head.tokens_7d, model_count: head.model_count }
      : null,
    magnitude_gap_to_head,
    same_tier,
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
          { role: "user", content: buildPrompt(self.brand, platformLabel(platform), structured) },
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
    analysis_type: "company",
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

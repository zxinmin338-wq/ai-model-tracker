// Company-level (brand) aggregation over the per-(model, source) breakdown.
// Pure functions — no DB calls — so both /api/company-analyze and the
// 厂商对比 page can reuse the exact same numbers. No new RPC / SQL needed:
// we group getRankingBreakdown() rows by getRanking()'s id→brand mapping.

import type { ModelWithUsage, RankingBreakdownRow } from "./queries";

export interface CompanyAggregate {
  brand: string;
  platform: string; // source code, e.g. "zenmux"
  tokens_7d: number;
  tokens_prev_7d: number;
  model_count: number; // distinct models of this brand WITH data on the platform
  // (t7 - tprev) / tprev. null when tprev === 0 — no prior week to compare,
  // so we mark "数据不足" rather than computing Infinity (the AnyInt trap).
  wow_growth_pct: number | null;
  rank: number; // 1-based, within the platform, by tokens_7d desc
}

// Aggregate every brand's totals on ONE platform, ranked by tokens_7d desc.
export function aggregateCompanies(
  breakdown: RankingBreakdownRow[],
  ranking: ModelWithUsage[],
  platform: string
): CompanyAggregate[] {
  const idToBrand = new Map(ranking.map((r) => [r.id, r.brand]));

  const acc = new Map<
    string,
    { t7: number; tprev: number; models: Set<number> }
  >();
  for (const b of breakdown) {
    if (b.source !== platform) continue;
    const brand = idToBrand.get(b.model_id);
    if (!brand) continue; // model not in ranking (inactive) — skip, don't guess
    const cur = acc.get(brand) ?? { t7: 0, tprev: 0, models: new Set<number>() };
    cur.t7 += Number(b.tokens_7d);
    cur.tprev += Number(b.tokens_prev_7d);
    if (Number(b.tokens_7d) > 0) cur.models.add(b.model_id);
    acc.set(brand, cur);
  }

  const rows: CompanyAggregate[] = [...acc.entries()]
    .map(([brand, v]) => ({
      brand,
      platform,
      tokens_7d: v.t7,
      tokens_prev_7d: v.tprev,
      model_count: v.models.size,
      wow_growth_pct:
        v.tprev > 0
          ? Number((((v.t7 - v.tprev) / v.tprev) * 100).toFixed(1))
          : null,
      rank: 0,
    }))
    .filter((r) => r.tokens_7d > 0)
    .sort((a, b) => b.tokens_7d - a.tokens_7d);

  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

// Total aggregate tokens_7d per platform — used to default the page to the
// most active platform.
export function platformTotals(
  breakdown: RankingBreakdownRow[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const b of breakdown) {
    totals[b.source] = (totals[b.source] ?? 0) + Number(b.tokens_7d);
  }
  return totals;
}

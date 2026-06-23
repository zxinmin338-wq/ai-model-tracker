import {
  getRanking,
  getModelPlatforms,
  getRankingBreakdown,
} from "@/lib/queries";
import { CompareClient } from "./compare-client";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const [models, platforms, breakdown] = await Promise.all([
    getRanking(),
    getModelPlatforms(),
    getRankingBreakdown(),
  ]);

  // per-(model, source) 7d tokens — lets the client default to a model's
  // largest platform.
  const platformTokens: Record<number, Record<string, number>> = {};
  for (const b of breakdown) {
    (platformTokens[b.model_id] ??= {});
    platformTokens[b.model_id][b.source] =
      (platformTokens[b.model_id][b.source] ?? 0) + Number(b.tokens_7d);
  }

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      <div className="mb-6">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          Trends
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332] mt-1">
          {t.nav.compare}
        </h1>
        <p className="text-base text-[#6B7785] mt-1">
          {t.compare.subtitle}
        </p>
      </div>
      <CompareClient
        models={models}
        platforms={platforms}
        platformTokens={platformTokens}
      />
    </div>
  );
}

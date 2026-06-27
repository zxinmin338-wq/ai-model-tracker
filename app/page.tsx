import { unstable_cache } from "next/cache";
import {
  getRanking,
  getModelPlatforms,
  getRankingBreakdown,
} from "@/lib/queries";
import { HomeClient } from "@/components/home-client";

// A cold ranking/breakdown RPC hits Postgres's statement timeout and returns [].
// Retry a few times so the value we CACHE always has real data and we never
// cache an empty page. Once warm a single call succeeds.
async function nonEmpty<T>(fn: () => Promise<T[]>, tries = 4): Promise<T[]> {
  let last: T[] = [];
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last.length > 0) return last;
  }
  return last;
}

// Cache the homepage dataset in Next's data cache (persists across requests and
// serverless instances), refreshed at most every 120s. Every visitor is served
// the last good snapshot instantly without touching Supabase — so a cold/slow
// query can no longer hand someone an empty "0 / 暂无数据" first paint. The
// Supabase client fetches no-store, so route-level `revalidate` alone won't
// cache it; unstable_cache caches the query results explicitly.
const getHomeData = unstable_cache(
  async () => {
    const [models, platforms, breakdown] = await Promise.all([
      nonEmpty(getRanking),
      getModelPlatforms(), // fast skip-scan map; rarely empty
      nonEmpty(getRankingBreakdown),
    ]);
    return { models, platforms, breakdown };
  },
  ["home-data-v1"],
  { revalidate: 120 }
);

export default async function HomePage() {
  const { models, platforms, breakdown } = await getHomeData();

  return (
    <HomeClient models={models} platforms={platforms} breakdown={breakdown} />
  );
}

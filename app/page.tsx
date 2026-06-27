import {
  getRanking,
  getModelPlatforms,
  getRankingBreakdown,
} from "@/lib/queries";
import { HomeClient } from "@/components/home-client";

// ISR instead of a live query on every visit: serve a cached, already-populated
// homepage to every visitor instantly and refresh it in the background. This
// decouples the page from Supabase cold-starts — a slow/cold query can no longer
// hand a visitor an empty "0 / 暂无数据" first paint; they always see the last
// good snapshot. Data only needs to be minutes-fresh (fetch runs hourly).
export const revalidate = 120;

// A cold ranking/breakdown RPC hits Postgres's statement timeout and returns [].
// Retry a few times so the render that POPULATES the ISR cache has real data and
// we never cache an empty page. Once warm a single call succeeds.
async function nonEmpty<T>(fn: () => Promise<T[]>, tries = 4): Promise<T[]> {
  let last: T[] = [];
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last.length > 0) return last;
  }
  return last;
}

export default async function HomePage() {
  const [models, platforms, breakdown] = await Promise.all([
    nonEmpty(getRanking),
    getModelPlatforms(), // fast skip-scan, returns a map; rarely empty
    nonEmpty(getRankingBreakdown),
  ]);

  return (
    <HomeClient models={models} platforms={platforms} breakdown={breakdown} />
  );
}

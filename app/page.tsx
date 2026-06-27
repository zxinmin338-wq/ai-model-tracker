import {
  getRanking,
  getModelPlatforms,
  getRankingBreakdown,
} from "@/lib/queries";
import { HomeClient } from "@/components/home-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [models, platforms, breakdown] = await Promise.all([
    getRanking(),
    getModelPlatforms(),
    getRankingBreakdown(),
  ]);

  return (
    <HomeClient models={models} platforms={platforms} breakdown={breakdown} />
  );
}

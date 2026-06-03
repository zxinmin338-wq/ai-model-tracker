import {
  getRanking,
  getRecentEvents,
  getModelPlatforms,
  getRankingBreakdown,
} from "@/lib/queries";
import { HomeClient } from "@/components/home-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [models, recentEvents, platforms, breakdown] = await Promise.all([
    getRanking(),
    getRecentEvents(7),
    getModelPlatforms(),
    getRankingBreakdown(),
  ]);

  return (
    <HomeClient
      models={models}
      recentEvents={recentEvents}
      platforms={platforms}
      breakdown={breakdown}
    />
  );
}

import { getRanking, getRecentEvents } from "@/lib/queries";
import { HomeClient } from "@/components/home-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [models, recentEvents] = await Promise.all([
    getRanking(),
    getRecentEvents(7),
  ]);

  return <HomeClient models={models} recentEvents={recentEvents} />;
}

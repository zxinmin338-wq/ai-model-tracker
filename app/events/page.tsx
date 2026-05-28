import { getActiveModels } from "@/lib/queries";
import { EventsClient } from "./events-client";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const models = await getActiveModels();

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      <EventsClient models={models} />
    </div>
  );
}

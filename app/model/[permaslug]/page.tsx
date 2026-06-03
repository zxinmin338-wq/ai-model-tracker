import { notFound } from "next/navigation";
import {
  getModelBySlug,
  getModelEvents,
  getHourlyDeltas,
  hasHourlyData,
  getPlatformBreakdown,
} from "@/lib/queries";
import { ModelDetailClient } from "./model-detail-client";

export const dynamic = "force-dynamic";

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ permaslug: string }>;
}) {
  const { permaslug } = await params;
  const slug = decodeURIComponent(permaslug);
  const model = await getModelBySlug(slug);

  if (!model) return notFound();

  const [events, hourlyDeltas, hourlyAvailable, platformDaily] =
    await Promise.all([
      getModelEvents(model.id),
      getHourlyDeltas(model.id),
      hasHourlyData(model.id),
      getPlatformBreakdown(model.id, 30),
    ]);

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      <ModelDetailClient
        model={model}
        events={events}
        hourlyDeltas={hourlyDeltas}
        hasHourlyData={hourlyAvailable}
        platformDaily={platformDaily}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import {
  getModelBySlug,
  getModelEvents,
  getHourlyDeltas,
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

  const [events, hourlyDeltas] = await Promise.all([
    getModelEvents(model.id),
    getHourlyDeltas(model.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      <ModelDetailClient
        model={model}
        events={events}
        hourlyDeltas={hourlyDeltas}
      />
    </div>
  );
}

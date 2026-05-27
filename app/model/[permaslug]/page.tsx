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
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-4 w-4 rounded-full shrink-0"
            style={{ backgroundColor: model.color_hex }}
          />
          <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332]">
            {model.display_name}
          </h1>
        </div>
        <p className="text-base text-[#6B7785] mt-1">{model.brand}</p>
      </div>

      <ModelDetailClient
        model={model}
        events={events}
        hourlyDeltas={hourlyDeltas}
      />
    </div>
  );
}

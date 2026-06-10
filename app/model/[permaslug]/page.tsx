import { notFound } from "next/navigation";
import {
  getModelBySlug,
  getModelEvents,
  getHourlyDeltas,
  hasHourlyData,
  getPlatformBreakdown,
  getLogicalGroupMembers,
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

  // Logical model = this row + its cross-platform / version-split siblings.
  // Aggregate the per-platform breakdown across all of them so the detail page
  // shows each platform's share of the merged model.
  const members = await getLogicalGroupMembers(slug);
  const memberIds = members.length > 0 ? members.map((m) => m.id) : [model.id];

  const [events, platformDailyArrays, hourlyFlags] = await Promise.all([
    getModelEvents(model.id),
    Promise.all(memberIds.map((id) => getPlatformBreakdown(id, 30))),
    Promise.all(memberIds.map((id) => hasHourlyData(id))),
  ]);

  const platformDaily = platformDailyArrays.flat();
  const hourlyAvailable = hourlyFlags.some(Boolean);
  // Hourly data is OpenRouter-only; use the member that has it.
  const hourlyMemberId =
    memberIds.find((_, i) => hourlyFlags[i]) ?? model.id;
  const hourlyDeltas = hourlyAvailable
    ? await getHourlyDeltas(hourlyMemberId)
    : [];

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

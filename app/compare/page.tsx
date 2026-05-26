import { getActiveModels } from "@/lib/queries";
import { CompareClient } from "./compare-client";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const models = await getActiveModels();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Compare Usage Trends
        </h1>
        <p className="text-muted-foreground mt-1">
          Pick 2–5 models to overlay
        </p>
      </div>
      <CompareClient models={models} />
    </div>
  );
}

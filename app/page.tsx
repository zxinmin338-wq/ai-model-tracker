import { getRanking } from "@/lib/queries";
import { ModelTable } from "@/components/model-table";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const models = await getRanking();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          AI Model Tracker
        </h1>
        <p className="text-muted-foreground mt-1">
          Cross-model usage tracking that public dashboards don&apos;t offer
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <ModelTable models={models} />
      </div>
    </div>
  );
}

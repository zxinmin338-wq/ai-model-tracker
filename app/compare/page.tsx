import { getActiveModels } from "@/lib/queries";
import { CompareClient } from "./compare-client";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const models = await getActiveModels();

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      <div className="mb-6">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          Trends
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332] mt-1">
          {t.nav.compare}
        </h1>
        <p className="text-base text-[#6B7785] mt-1">
          {t.compare.subtitle}
        </p>
      </div>
      <CompareClient models={models} />
    </div>
  );
}

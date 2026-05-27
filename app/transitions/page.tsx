import { getTransitionCurves } from "@/lib/queries";
import { TransitionsClient } from "./transitions-client";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function TransitionsPage() {
  const curves = await getTransitionCurves();

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      <div className="mb-6">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          Transitions
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332] mt-1">
          {t.nav.transitions}
        </h1>
        <p className="text-base text-[#6B7785] mt-1">
          {t.transitions.subtitle}
        </p>
      </div>
      <TransitionsClient curves={curves} />
    </div>
  );
}

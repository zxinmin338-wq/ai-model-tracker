import { getTransitionCurves } from "@/lib/queries";
import { TransitionsClient } from "./transitions-client";

export const dynamic = "force-dynamic";

export default async function TransitionsPage() {
  const curves = await getTransitionCurves();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Free → Paid Decay Curves
        </h1>
        <p className="text-muted-foreground mt-1">
          Normalized to D-1 = 100%, aligned to transition date D+0
        </p>
      </div>
      <TransitionsClient curves={curves} />
    </div>
  );
}

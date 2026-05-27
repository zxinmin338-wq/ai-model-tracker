import { getRanking } from "@/lib/queries";
import { ModelTable } from "@/components/model-table";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const models = await getRanking();

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332]">
          AI Model Tracker
        </h1>
        <p className="text-base text-[#6B7785] mt-1">
          Free model lifecycle monitoring
        </p>
      </div>

      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <ModelTable models={models} />
      </div>
    </div>
  );
}

import { getActiveModels } from "@/lib/queries";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const models = await getActiveModels();

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      <div className="mb-6">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          Settings
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332] mt-1">
          设置
        </h1>
        <p className="text-base text-[#6B7785] mt-1">
          标记我方模型,对比页将以我方模型为中心展示
        </p>
      </div>
      <SettingsClient models={models} />
    </div>
  );
}

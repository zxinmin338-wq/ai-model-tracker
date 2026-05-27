import { getActiveModels } from "@/lib/queries";
import { SettingsClient } from "./settings-client";
import { t } from "@/lib/i18n";

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
          {t.settings.title}
        </h1>
        <p className="text-base text-[#6B7785] mt-1">
          {t.settings.subtitle}
        </p>
      </div>
      <SettingsClient models={models} />
    </div>
  );
}

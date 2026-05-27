"use client";

import { useState } from "react";
import type { Model } from "@/lib/queries";

export function SettingsClient({ models: initialModels }: { models: Model[] }) {
  const [models, setModels] = useState(initialModels);
  const [saving, setSaving] = useState<number | null>(null);

  async function toggleOwn(model: Model) {
    const newVal = !model.is_own;
    setSaving(model.id);
    try {
      const res = await fetch("/api/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: model.id, is_own: newVal }),
      });
      if (res.ok) {
        setModels((prev) =>
          prev.map((m) => (m.id === model.id ? { ...m, is_own: newVal } : m))
        );
      }
    } catch (e) {
      console.error("Failed to update:", e);
    } finally {
      setSaving(null);
    }
  }

  async function updateProvider(model: Model, provider: string) {
    try {
      await fetch("/api/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: model.id, provider: provider || null }),
      });
      setModels((prev) =>
        prev.map((m) =>
          m.id === model.id ? { ...m, provider: provider || undefined } : m
        )
      );
    } catch (e) {
      console.error("Failed to update provider:", e);
    }
  }

  const ownModels = models.filter((m) => m.is_own);
  const otherModels = models.filter((m) => !m.is_own);

  return (
    <div className="space-y-6">
      {/* Own models section */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          My Models
        </div>
        <h2 className="text-xl font-semibold text-[#1A2332] mt-1 mb-6">
          我方模型
        </h2>

        {ownModels.length === 0 ? (
          <p className="text-sm text-[#94A0AE]">
            尚未标记我方模型。在下方列表中勾选即可。
          </p>
        ) : (
          <div className="space-y-3">
            {ownModels.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                saving={saving === m.id}
                onToggle={() => toggleOwn(m)}
                onProviderChange={(v) => updateProvider(m, v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* All models section */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          All Models
        </div>
        <h2 className="text-xl font-semibold text-[#1A2332] mt-1 mb-6">
          全部模型
        </h2>

        <div className="space-y-3">
          {otherModels.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              saving={saving === m.id}
              onToggle={() => toggleOwn(m)}
              onProviderChange={(v) => updateProvider(m, v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ModelRow({
  model,
  saving,
  onToggle,
  onProviderChange,
}: {
  model: Model;
  saving: boolean;
  onToggle: () => void;
  onProviderChange: (v: string) => void;
}) {
  const [editingProvider, setEditingProvider] = useState(false);
  const [providerDraft, setProviderDraft] = useState(model.provider ?? "");

  return (
    <div className="flex items-center gap-4 py-3 border-b border-[#E8EEF7] last:border-0">
      {/* Checkbox */}
      <button
        onClick={onToggle}
        disabled={saving}
        className={`flex items-center justify-center w-5 h-5 rounded border transition-colors shrink-0 ${
          model.is_own
            ? "bg-[#5B8DEF] border-[#5B8DEF] text-white"
            : "border-[#E8EEF7] bg-white hover:border-[#5B8DEF]"
        } ${saving ? "opacity-50" : ""}`}
      >
        {model.is_own && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Color dot + name */}
      <span
        className="inline-block h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: model.color_hex }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#1A2332]">
            {model.is_own && "⭐ "}
            {model.display_name}
          </span>
          <span className="text-xs text-[#94A0AE]">{model.brand}</span>
          {model.current_status && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-md ${
                model.current_status === "free"
                  ? "bg-[#E8EEF7] text-[#5B8DEF]"
                  : "bg-[#F0F4F8] text-[#6B7785]"
              }`}
            >
              {model.current_status.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Provider */}
      <div className="shrink-0">
        {editingProvider ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={providerDraft}
              onChange={(e) => setProviderDraft(e.target.value)}
              placeholder="Provider"
              className="text-sm border border-[#E8EEF7] rounded-lg px-2 py-1 w-32 focus:outline-none focus:border-[#5B8DEF]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onProviderChange(providerDraft);
                  setEditingProvider(false);
                }
                if (e.key === "Escape") {
                  setProviderDraft(model.provider ?? "");
                  setEditingProvider(false);
                }
              }}
            />
            <button
              onClick={() => {
                onProviderChange(providerDraft);
                setEditingProvider(false);
              }}
              className="text-xs text-[#5B8DEF] hover:text-[#4A7DDF]"
            >
              保存
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingProvider(true)}
            className="text-sm text-[#94A0AE] hover:text-[#5B8DEF] transition-colors"
          >
            {model.provider || "设置 Provider"}
          </button>
        )}
      </div>
    </div>
  );
}

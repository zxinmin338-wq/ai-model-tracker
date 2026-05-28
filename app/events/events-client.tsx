"use client";

import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import type { Model } from "@/lib/queries";

// ─── Types ─────────────────────────────────────────

interface EventRow {
  id: number;
  model_id: number;
  event_date: string;
  event_type: string;
  label: string;
  description: string | null;
  display_name?: string;
  brand?: string;
  permaslug?: string;
  color_hex?: string;
}

interface EventForm {
  model_id: number | "";
  event_date: string;
  event_type: string;
  label: string;
  description: string;
}

const EVENT_TYPES = [
  { value: "new_release", label: "新模型发布" },
  { value: "free_to_paid", label: "免费→付费" },
  { value: "price_change", label: "价格变动" },
  { value: "deprecated", label: "下线" },
  { value: "other", label: "其他" },
];

const EMPTY_FORM: EventForm = {
  model_id: "",
  event_date: new Date().toISOString().slice(0, 10),
  event_type: "new_release",
  label: "",
  description: "",
};

// ─── Main Component ────────────────────────────────

export function EventsClient({ models }: { models: Model[] }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterModel, setFilterModel] = useState("all");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      console.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Filtered events
  const filtered = events.filter((e) => {
    if (filterType !== "all" && e.event_type !== filterType) return false;
    if (filterModel !== "all" && String(e.model_id) !== filterModel) return false;
    return true;
  });

  // ─── Form handlers ─────────────────────────────

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(evt: EventRow) {
    setForm({
      model_id: evt.model_id,
      event_date: evt.event_date,
      event_type: evt.event_type,
      label: evt.label,
      description: evt.description ?? "",
    });
    setEditingId(evt.id);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.model_id || !form.label.trim()) return;
    setSaving(true);
    try {
      const payload = {
        model_id: Number(form.model_id),
        event_date: form.event_date,
        event_type: form.event_type,
        label: form.label.trim(),
        description: form.description.trim() || null,
      };

      if (editingId) {
        await fetch(`/api/events/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      closeForm();
      fetchEvents();
    } catch {
      console.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("确定删除此事件？")) return;
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    fetchEvents();
  }

  // ─── Render ────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#1A2332]">
            {t.nav.events}
          </h1>
          <p className="text-base text-[#6B7785] mt-1">
            管理模型生命周期事件：发布、转付费、价格变动、下线等
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[#5B8DEF] text-white text-sm font-medium rounded-lg hover:bg-[#4A7BE0] transition-colors"
        >
          + 新建事件
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#94A0AE]">事件类型</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-sm border border-[#E8EEF7] rounded-lg px-3 py-1.5 text-[#1A2332] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B8DEF]/30"
          >
            <option value="all">{t.common.all}</option>
            {EVENT_TYPES.map((et) => (
              <option key={et.value} value={et.value}>
                {et.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#94A0AE]">模型</span>
          <select
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
            className="text-sm border border-[#E8EEF7] rounded-lg px-3 py-1.5 text-[#1A2332] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B8DEF]/30"
          >
            <option value="all">{t.common.all}</option>
            {models.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
        <span className="text-xs text-[#94A0AE] ml-auto">
          共 {filtered.length} 条事件
        </span>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closeForm}
          />
          <div className="relative bg-white rounded-xl shadow-xl border border-[#E8EEF7] w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[#1A2332]">
              {editingId ? "编辑事件" : "新建事件"}
            </h2>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-[#6B7785] mb-1">
                模型 *
              </label>
              <select
                value={form.model_id}
                onChange={(e) =>
                  setForm({ ...form, model_id: e.target.value ? Number(e.target.value) : "" })
                }
                className="w-full border border-[#E8EEF7] rounded-lg px-3 py-2 text-sm text-[#1A2332] focus:outline-none focus:ring-2 focus:ring-[#5B8DEF]/30"
              >
                <option value="">请选择模型</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name} ({m.brand})
                  </option>
                ))}
              </select>
            </div>

            {/* Date + Type row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#6B7785] mb-1">
                  日期 *
                </label>
                <input
                  type="date"
                  value={form.event_date}
                  onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  className="w-full border border-[#E8EEF7] rounded-lg px-3 py-2 text-sm text-[#1A2332] focus:outline-none focus:ring-2 focus:ring-[#5B8DEF]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6B7785] mb-1">
                  类型 *
                </label>
                <select
                  value={form.event_type}
                  onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                  className="w-full border border-[#E8EEF7] rounded-lg px-3 py-2 text-sm text-[#1A2332] focus:outline-none focus:ring-2 focus:ring-[#5B8DEF]/30"
                >
                  {EVENT_TYPES.map((et) => (
                    <option key={et.value} value={et.value}>
                      {et.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Label */}
            <div>
              <label className="block text-sm font-medium text-[#6B7785] mb-1">
                标签 *
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="例：GLM-4.5 转收费"
                className="w-full border border-[#E8EEF7] rounded-lg px-3 py-2 text-sm text-[#1A2332] focus:outline-none focus:ring-2 focus:ring-[#5B8DEF]/30"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-[#6B7785] mb-1">
                描述（选填）
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="补充说明..."
                rows={3}
                className="w-full border border-[#E8EEF7] rounded-lg px-3 py-2 text-sm text-[#1A2332] resize-none focus:outline-none focus:ring-2 focus:ring-[#5B8DEF]/30"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={closeForm}
                className="px-4 py-2 text-sm text-[#6B7785] hover:text-[#1A2332] transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.model_id || !form.label.trim()}
                className="px-4 py-2 bg-[#5B8DEF] text-white text-sm font-medium rounded-lg hover:bg-[#4A7BE0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "保存中…" : editingId ? "更新" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Events Table */}
      {loading ? (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
          <div className="flex items-center justify-center h-[200px] text-[#6B7785]">
            {t.common.loading}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 text-center">
          <p className="text-[#6B7785]">{t.common.noData}</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EEF7] bg-[#FAFBFC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7785]">日期</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7785]">模型</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7785]">类型</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7785]">标签</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7785]">描述</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7785]">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((evt) => (
                <tr
                  key={evt.id}
                  className="border-b border-[#E8EEF7] last:border-b-0 hover:bg-[#FAFBFC] transition-colors"
                >
                  <td className="px-4 py-3 text-[#1A2332] whitespace-nowrap">
                    {evt.event_date}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {evt.color_hex && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: evt.color_hex }}
                        />
                      )}
                      <span className="text-[#1A2332]">
                        {evt.display_name ?? `Model #${evt.model_id}`}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <EventTypeBadge type={evt.event_type} />
                  </td>
                  <td className="px-4 py-3 text-[#1A2332]">{evt.label}</td>
                  <td className="px-4 py-3 text-[#94A0AE] max-w-[200px] truncate">
                    {evt.description || "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEdit(evt)}
                      className="text-[#5B8DEF] hover:text-[#4A7BE0] text-sm mr-3 transition-colors"
                    >
                      {t.common.edit}
                    </button>
                    <button
                      onClick={() => handleDelete(evt.id)}
                      className="text-[#E85B81] hover:text-[#D14A70] text-sm transition-colors"
                    >
                      {t.common.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────

const TYPE_STYLES: Record<string, string> = {
  new_release: "bg-[#E8EEF7] text-[#5B8DEF]",
  free_to_paid: "bg-[#FFF3E0] text-[#F0A856]",
  price_change: "bg-[#F0F4F8] text-[#6B7785]",
  deprecated: "bg-[#FDECEA] text-[#E85B81]",
  other: "bg-[#F0F4F8] text-[#6B7785]",
};

const TYPE_LABELS: Record<string, string> = {
  new_release: "新发布",
  free_to_paid: "转付费",
  price_change: "价格变动",
  deprecated: "下线",
  other: "其他",
};

function EventTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-md ${
        TYPE_STYLES[type] ?? TYPE_STYLES.other
      }`}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

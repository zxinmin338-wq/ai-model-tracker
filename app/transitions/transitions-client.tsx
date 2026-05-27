"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { TransitionCurve } from "@/lib/queries";

export function TransitionsClient({ curves }: { curves: TransitionCurve[] }) {
  if (curves.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-[#6B7785] bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        No free→paid transition events recorded yet.
      </div>
    );
  }

  // Build unified dataset: day_offset as X, one column per model
  // Ensure full D-7 to D+30 range even when data is sparse
  const offsetMap = new Map<number, Record<string, number | string>>();

  // Pre-fill all offsets from -7 to +30
  for (let offset = -7; offset <= 30; offset++) {
    offsetMap.set(offset, { day: `D${offset >= 0 ? "+" : ""}${offset}` });
  }

  for (const curve of curves) {
    for (const pt of curve.data_points) {
      if (!offsetMap.has(pt.day_offset)) {
        offsetMap.set(pt.day_offset, { day: `D${pt.day_offset >= 0 ? "+" : ""}${pt.day_offset}` });
      }
      const row = offsetMap.get(pt.day_offset)!;
      row[curve.model.permaslug] = Math.round(pt.normalized_tokens * 1000) / 10;
    }
  }

  const data = Array.from(offsetMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row);

  const seriesConfigs = curves.map((c) => ({
    key: c.model.permaslug,
    name: c.model.display_name,
    color: c.model.color_hex,
  }));

  // History case table data
  const caseRows = curves.map((c) => {
    const d7 = c.data_points.find((p) => p.day_offset === 7);
    const d30 = c.data_points.find((p) => p.day_offset === 30);
    const d7Pct = d7 ? ((d7.normalized_tokens - 1) * 100).toFixed(0) : null;
    const d30Pct = d30 ? ((d30.normalized_tokens - 1) * 100).toFixed(0) : null;

    return {
      model: c.model.display_name,
      date: c.transition_date.slice(5), // MM-DD
      d7: d7Pct !== null ? `${Number(d7Pct) > 0 ? "+" : ""}${d7Pct}%` : "—",
      d30: d30Pct !== null ? `${Number(d30Pct) > 0 ? "+" : ""}${d30Pct}%` : "—",
      successor: c.successor ?? "—",
      colorHex: c.model.color_hex,
    };
  });

  return (
    <div className="space-y-6">
      {/* Overlay chart */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
        <ResponsiveContainer width="100%" height={450}>
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid stroke="#F0F4F8" strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#6B7785' }} stroke="#E8EEF7" />
            <YAxis
              tick={{ fontSize: 12, fill: '#6B7785' }}
              stroke="#E8EEF7"
              tickFormatter={(v: number) => `${v}%`}
              width={60}
              domain={[0, "auto"]}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                `${Number(value).toFixed(1)}%`,
                String(name),
              ]}
              contentStyle={{ background: '#FFFFFF', border: '1px solid #E8EEF7', borderRadius: 8 }}
            />
            <Legend />

            {/* D+0 reference line */}
            <ReferenceLine
              x="D+0"
              stroke="#94A0AE"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: "Transition",
                position: "top",
                fill: "#94A0AE",
                fontSize: 12,
              }}
            />

            {/* 100% reference line */}
            <ReferenceLine
              y={100}
              stroke="#94A0AE"
              strokeDasharray="3 3"
              strokeWidth={1}
              label={{
                value: "100%",
                position: "right",
                fill: "#94A0AE",
                fontSize: 11,
              }}
            />

            {seriesConfigs.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* History Case Table */}
      <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
        <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
          History
        </div>
        <h3 className="text-xl font-semibold text-[#1A2332] mt-1 mb-6">
          历史转付费案例
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EEF7]">
                <th className="text-left py-3 px-2 font-medium text-[#6B7785]">Model</th>
                <th className="text-left py-3 px-2 font-medium text-[#6B7785]">Date</th>
                <th className="text-right py-3 px-2 font-medium text-[#6B7785]">D+7</th>
                <th className="text-right py-3 px-2 font-medium text-[#6B7785]">D+30</th>
                <th className="text-left py-3 px-2 font-medium text-[#6B7785]">Successor</th>
              </tr>
            </thead>
            <tbody>
              {caseRows.map((row, i) => (
                <tr key={i} className="border-b border-[#E8EEF7] hover:bg-[#F0F4F8] transition-colors">
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: row.colorHex }}
                      />
                      <span className="font-medium text-[#1A2332]">{row.model}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-[#6B7785]">{row.date}</td>
                  <td className="py-3 px-2 text-right font-mono">
                    <span className={row.d7.startsWith("-") ? "text-[#E85B81]" : "text-[#6B7785]"}>
                      {row.d7}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right font-mono">
                    <span className={row.d30.startsWith("-") ? "text-[#E85B81]" : "text-[#6B7785]"}>
                      {row.d30}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-[#6B7785]">{row.successor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-model cards */}
      {curves.map((curve) => (
        <div key={curve.model.permaslug} className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
          <div className="flex items-center gap-3 mb-4">
            <span
              className="inline-block h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: curve.model.color_hex }}
            />
            <h3 className="text-sm font-medium text-[#1A2332]">
              {curve.model.display_name}
            </h3>
            <span className="text-xs text-[#6B7785]">
              Transition: {curve.transition_date}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[#6B7785] text-xs">D-1 (baseline)</p>
              <p className="font-mono font-medium text-[#1A2332]">100%</p>
            </div>
            {[0, 1, 7, 30].map((offset) => {
              const pt = curve.data_points.find((p) => p.day_offset === offset);
              return (
                <div key={offset}>
                  <p className="text-[#6B7785] text-xs">D+{offset}</p>
                  <p className="font-mono font-medium text-[#1A2332]">
                    {pt ? `${(pt.normalized_tokens * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
              );
            })}
          </div>

          {curve.context_events.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#E8EEF7]">
              <p className="text-xs text-[#6B7785] mb-1">Related events:</p>
              {curve.context_events.map((ce, i) => (
                <p key={i} className="text-xs text-[#1A2332]">
                  D{ce.days_offset >= 0 ? "+" : ""}{ce.days_offset}: {ce.label}{" "}
                  <span className="text-[#6B7785]">({ce.type.replace(/_/g, " ")})</span>
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

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
      <div className="flex items-center justify-center h-[300px] text-muted-foreground rounded-lg border bg-card">
        No free→paid transition events recorded yet.
      </div>
    );
  }

  // Build unified dataset: day_offset as X, one column per model
  const offsetMap = new Map<number, Record<string, number | string>>();

  for (const curve of curves) {
    for (const pt of curve.data_points) {
      if (!offsetMap.has(pt.day_offset)) {
        offsetMap.set(pt.day_offset, { day: `D${pt.day_offset >= 0 ? "+" : ""}${pt.day_offset}` });
      }
      const row = offsetMap.get(pt.day_offset)!;
      row[curve.model.permaslug] = Math.round(pt.normalized_tokens * 1000) / 10; // percentage with 1 decimal
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

  return (
    <div className="space-y-6">
      {/* Overlay chart */}
      <div className="rounded-lg border bg-card p-4">
        <ResponsiveContainer width="100%" height={450}>
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => `${v}%`}
              width={60}
              domain={[0, "auto"]}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                `${Number(value).toFixed(1)}%`,
                String(name),
              ]}
            />
            <Legend />

            {/* D+0 reference line */}
            <ReferenceLine
              x="D+0"
              stroke="#ef4444"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: "Transition",
                position: "top",
                fill: "#ef4444",
                fontSize: 12,
              }}
            />

            {/* 100% reference line */}
            <ReferenceLine
              y={100}
              stroke="#888"
              strokeDasharray="3 3"
              strokeWidth={1}
              label={{
                value: "100%",
                position: "right",
                fill: "#888",
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

      {/* Per-model cards */}
      {curves.map((curve) => (
        <div key={curve.model.permaslug} className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <span
              className="inline-block h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: curve.model.color_hex }}
            />
            <h3 className="text-sm font-medium">
              {curve.model.display_name}
            </h3>
            <span className="text-xs text-muted-foreground">
              Transition: {curve.transition_date}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">D-1 (baseline)</p>
              <p className="font-mono font-medium">100%</p>
            </div>
            {[0, 1, 7].map((offset) => {
              const pt = curve.data_points.find((p) => p.day_offset === offset);
              return (
                <div key={offset}>
                  <p className="text-muted-foreground text-xs">
                    D+{offset}
                  </p>
                  <p className="font-mono font-medium">
                    {pt ? `${(pt.normalized_tokens * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
              );
            })}
          </div>

          {curve.context_events.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-1">Related events:</p>
              {curve.context_events.map((ce, i) => (
                <p key={i} className="text-xs">
                  D{ce.days_offset >= 0 ? "+" : ""}{ce.days_offset}: {ce.label}{" "}
                  <span className="text-muted-foreground">({ce.type.replace(/_/g, " ")})</span>
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

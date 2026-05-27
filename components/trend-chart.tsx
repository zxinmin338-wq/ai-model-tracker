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
import { formatTokens } from "@/lib/format";

interface SeriesConfig {
  key: string;
  name: string;
  color: string;
  strokeWidth?: number;
}

interface EventAnnotation {
  date: string;
  label: string;
  color: string;
}

interface TrendChartProps {
  data: Array<Record<string, string | number>>;
  series: SeriesConfig[];
  events?: EventAnnotation[];
  yFormatter?: (value: number) => string;
  height?: number;
}

export function TrendChart({
  data,
  series,
  events = [],
  yFormatter = formatTokens,
  height = 400,
}: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[#6B7785]"
        style={{ height }}
      >
        暂无数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid stroke="#F0F4F8" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: '#6B7785' }}
          stroke="#E8EEF7"
          tickFormatter={(v: string) => v.slice(5)} // MM-DD
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#6B7785' }}
          stroke="#E8EEF7"
          tickFormatter={(v: number) => yFormatter(v)}
          width={70}
        />
        <Tooltip
          formatter={(value: unknown, name: unknown) => [
            yFormatter(Number(value)),
            String(name),
          ]}
          labelFormatter={(label: unknown) => `Date: ${String(label)}`}
          contentStyle={{ background: '#FFFFFF', border: '1px solid #E8EEF7', borderRadius: 8 }}
        />
        <Legend />

        {/* Event annotation lines */}
        {events.map((evt, i) => (
          <ReferenceLine
            key={`evt-${i}`}
            x={evt.date}
            stroke={evt.color}
            strokeDasharray="3 3"
            strokeWidth={1.5}
            label={{
              value: evt.label,
              position: "top",
              fill: evt.color,
              fontSize: 11,
            }}
          />
        ))}

        {/* Data lines */}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 2}
            dot={{ r: s.strokeWidth && s.strokeWidth > 2 ? 4 : 3 }}
            activeDot={{ r: s.strokeWidth && s.strokeWidth > 2 ? 6 : 5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

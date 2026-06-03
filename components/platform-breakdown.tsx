"use client";

import { useMemo } from "react";
import { formatTokens } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { PlatformDailyToken } from "@/lib/queries";

// source key -> display name
const PLATFORM_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  anyint: "AnyInt",
  zenmux: "ZenMux",
};

function platformLabel(source: string): string {
  return (
    PLATFORM_LABELS[source] ??
    source.charAt(0).toUpperCase() + source.slice(1)
  );
}

function pctLabel(pct: number): string {
  if (pct > 0 && pct < 0.01) return "<0.01%";
  // Truncate (not round) to 2 decimals so a 99.99986% share reads "99.99%"
  // rather than "100.00%" next to a "<0.01%" sibling.
  return `${(Math.floor(pct * 100) / 100).toFixed(2)}%`;
}

/**
 * Platform distribution card for the model detail page.
 *
 * Sums tokens per source over the currently-selected time range (derived from
 * the 30-day `platformDaily` data passed in + the `days` tab). Only renders when
 * the model has data from ≥2 platforms; single-platform models render nothing.
 */
export function PlatformBreakdown({
  platformDaily,
  days,
  colorHex,
}: {
  platformDaily: PlatformDailyToken[];
  days: number;
  colorHex: string;
}) {
  const { entries, total } = useMemo(() => {
    const cutoff = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10);
    const bySource: Record<string, number> = {};
    for (const r of platformDaily) {
      if (r.usage_date < cutoff) continue;
      bySource[r.source] = (bySource[r.source] ?? 0) + r.tokens;
    }
    const entries = Object.entries(bySource)
      .map(([source, tokens]) => ({ source, tokens }))
      .filter((e) => e.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens);
    const total = entries.reduce((s, e) => s + e.tokens, 0);
    return { entries, total };
  }, [platformDaily, days]);

  // Only meaningful when there are at least two platforms.
  if (entries.length < 2) return null;

  return (
    <div className="bg-white border border-[#E8EEF7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
      <div className="text-sm font-medium uppercase tracking-wider text-[#6B7785]">
        Platforms
      </div>
      <h3 className="text-xl font-semibold text-[#1A2332] mt-1 mb-6">
        {t.detail.platformDistribution}
      </h3>
      <div className="space-y-5">
        {entries.map((e) => {
          const pct = total > 0 ? (e.tokens / total) * 100 : 0;
          return (
            <div key={e.source} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-[#1A2332]">
                  {platformLabel(e.source)}
                </span>
                <span className="text-[#6B7785]">
                  {formatTokens(e.tokens)}
                  <span className="text-[#94A0AE]"> · {pctLabel(pct)}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#F0F4F8] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(pct, 0.5)}%`,
                    backgroundColor: colorHex,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

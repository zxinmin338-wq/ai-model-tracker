"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTokens } from "@/lib/format";
import { AnalysisTermsTooltip } from "@/components/info-tooltip";
import { LoadingInline } from "@/components/loading";
import type { CompanyAggregate } from "@/lib/company";

const PLATFORM_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  anyint: "AnyInt",
  zenmux: "ZenMux",
};
const platformLabel = (s: string) => PLATFORM_LABELS[s] ?? s;

const SAME_TIER_PCT = 0.2; // within ±20% = same tier (mirror of the API)

export function VendorsClient({
  platforms,
  companiesByPlatform,
}: {
  platforms: string[];
  companiesByPlatform: Record<string, CompanyAggregate[]>;
}) {
  // Default platform = most active (page already sorted platforms by total desc).
  const [platform, setPlatform] = useState<string>(platforms[0] ?? "");
  const companies = useMemo(
    () => companiesByPlatform[platform] ?? [],
    [companiesByPlatform, platform]
  );
  // Default company = the platform's #1 (companies are pre-ranked desc).
  const [brand, setBrand] = useState<string>(companies[0]?.brand ?? "");

  // When platform changes, if the selected company has no data on the new
  // platform, reset to that platform's top company (keeps the view non-empty).
  useEffect(() => {
    if (!companies.some((c) => c.brand === brand)) {
      setBrand(companies[0]?.brand ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  const selected = companies.find((c) => c.brand === brand) ?? null;
  const head = companies[0] ?? null;
  const sameTier = useMemo(
    () =>
      selected
        ? companies.filter(
            (c) =>
              c.brand !== selected.brand &&
              selected.tokens_7d > 0 &&
              Math.abs(c.tokens_7d - selected.tokens_7d) / selected.tokens_7d <
                SAME_TIER_PCT
          )
        : [],
    [companies, selected]
  );
  const magnitudeGap =
    selected && head && selected.tokens_7d > 0
      ? Math.log10(head.tokens_7d / selected.tokens_7d).toFixed(1)
      : null;

  // ─── AI analysis ───
  const [analysisContent, setAnalysisContent] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisDate, setAnalysisDate] = useState<string>("");
  // Clear a stale analysis whenever the scope (platform/company) changes.
  useEffect(() => {
    setAnalysisContent(null);
    setAnalysisError(null);
  }, [platform, brand]);

  const generateAnalysis = useCallback(async () => {
    if (!brand || !platform) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    const post = () =>
      fetch("/api/company-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, platform }),
      });
    try {
      let res = await post();
      // 503 = breakdown RPC cold/timeout. Auto-retry once instead of surfacing
      // the raw "请重试".
      if (res.status === 503) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await post();
      }
      const json = await res.json();
      if (!res.ok || json.error) {
        setAnalysisContent(null);
        setAnalysisError(json.error || `生成失败 (HTTP ${res.status})`);
      } else {
        setAnalysisContent(json.content ?? "");
        setAnalysisDate((json.created_at || new Date().toISOString()).slice(0, 10));
      }
    } catch {
      setAnalysisContent(null);
      setAnalysisError("生成失败，请重试");
    } finally {
      setAnalysisLoading(false);
    }
  }, [brand, platform]);

  return (
    <div className="space-y-6">
      {/* ─── Controls ─── */}
      <div className="flex items-center gap-5 flex-wrap">
        <ControlGroup label="平台">
          {platforms.length > 0 ? (
            <Tabs value={platform} onValueChange={setPlatform}>
              <TabsList>
                {platforms.map((s) => (
                  <TabsTrigger key={s} value={s}>
                    {platformLabel(s)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            <span className="text-sm text-[#94A0AE]">无平台数据</span>
          )}
        </ControlGroup>
        <p className="text-sm text-[#6B7785]">
          公司聚合口径锁定在
          <span className="font-medium text-[#1A2332]"> {platformLabel(platform)} </span>
          平台内，点击下方排行榜行切换公司。
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-8">
          <div className="flex items-center justify-center h-[160px] text-[#94A0AE]">
            该平台暂无公司数据
          </div>
        </div>
      ) : (
        <>
          {/* ─── 公司排行榜 ─── */}
          <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft overflow-hidden">
            <div className="px-6 pt-5 pb-3 border-b border-[var(--border-cool)]">
              <h2 className="font-serif-heading text-lg font-medium text-[#16302B]">
                公司排行榜
                <span className="ml-2 align-middle text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--accent-aurora-soft)] text-[var(--accent-aurora)]">
                  {platformLabel(platform)} · 共 {companies.length} 家
                </span>
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#94A0AE] text-xs uppercase tracking-wider">
                  <th className="px-6 py-2 font-medium">#</th>
                  <th className="px-6 py-2 font-medium">公司</th>
                  <th className="px-6 py-2 font-medium text-right">旗下模型</th>
                  <th className="px-6 py-2 font-medium text-right">聚合总量</th>
                  <th className="px-6 py-2 font-medium text-right">周环比</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const isSel = c.brand === brand;
                  return (
                    <tr
                      key={c.brand}
                      onClick={() => setBrand(c.brand)}
                      className={`cursor-pointer border-t border-[var(--border-cool)] transition-colors ${
                        isSel ? "bg-[var(--accent-aurora-soft)]" : "hover:bg-[#EEF7F4]"
                      }`}
                    >
                      <td className="px-6 py-2.5 text-[#6B7785] tabular-nums">{c.rank}</td>
                      <td className="px-6 py-2.5 font-medium text-[#1A2332]">
                        {isSel && (
                          <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent-aurora)] mr-2 align-middle" />
                        )}
                        {c.brand}
                      </td>
                      <td className="px-6 py-2.5 text-right text-[#6B7785] tabular-nums">
                        {c.model_count}
                      </td>
                      <td className="px-6 py-2.5 text-right font-mono tabular-nums">
                        {formatTokens(c.tokens_7d)}
                      </td>
                      <td className="px-6 py-2.5 text-right tabular-nums">
                        <WowBadge pct={c.wow_growth_pct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ─── 选中公司详情 ─── */}
          {selected && (
            <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-6">
              <h2 className="font-serif-heading text-lg font-medium text-[#16302B] mb-4">
                {selected.brand}
                <span className="ml-2 text-sm font-normal text-[#6B7785]">
                  在 {platformLabel(platform)} 平台
                </span>
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="聚合总量" value={formatTokens(selected.tokens_7d)} sub={`旗下 ${selected.model_count} 个模型求和`} />
                <Stat
                  label="身位"
                  value={`第 ${selected.rank} / ${companies.length} 家`}
                  sub={magnitudeGap !== null ? `距头部 ${head?.brand} 差 ${magnitudeGap} 个数量级` : "—"}
                />
                <Stat
                  label="周环比"
                  value={selected.wow_growth_pct === null ? "数据不足" : `${selected.wow_growth_pct > 0 ? "+" : ""}${selected.wow_growth_pct}%`}
                  sub={selected.wow_growth_pct === null ? "无上周数据" : "近7天 vs 前7天"}
                />
                <Stat
                  label="同档公司"
                  value={sameTier.length > 0 ? String(sameTier.length) : "无"}
                  sub={sameTier.length > 0 ? sameTier.map((c) => c.brand).join("、") : "聚合总量差<20%"}
                />
              </div>
            </div>
          )}

          {/* ─── AI 身位分析 ─── */}
          {selected && (
            <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent-aurora)]">
                    AI Analysis
                  </div>
                  <h2 className="font-serif-heading text-lg font-medium text-[#16302B] mt-1 inline-flex items-center gap-1.5">
                    AI 身位分析
                    <AnalysisTermsTooltip />
                  </h2>
                </div>
                <button
                  onClick={generateAnalysis}
                  disabled={analysisLoading}
                  className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg bg-[var(--accent-aurora)] text-white hover:bg-[var(--accent-aurora-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {analysisLoading ? "分析生成中…" : "生成 AI 分析"}
                </button>
              </div>

              {analysisLoading && (
                <div className="mt-4">
                  <LoadingInline text="正在生成分析…" />
                </div>
              )}
              {analysisError && !analysisLoading && (
                <div className="text-sm text-[var(--trend-down)] mt-4">{analysisError}</div>
              )}
              {analysisContent && !analysisLoading && (
                <div className="mt-4">
                  <div className="space-y-1.5 text-sm text-[#1A2332] leading-relaxed">
                    {renderAnalysis(analysisContent)}
                  </div>
                  <p className="text-xs text-[#94A0AE] mt-4 pt-3 border-t border-[var(--border-cool)]">
                    本判断由 AI 基于截至 {analysisDate} 数据生成，可能有误，请结合原始数据核对。
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───

function WowBadge({ pct }: { pct: number | null }) {
  if (pct === null)
    return <span className="text-[#94A0AE]">数据不足</span>;
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <span className={flat ? "text-[#6B7785]" : up ? "text-[var(--trend-up)]" : "text-[var(--trend-down)]"}>
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-[#94A0AE]">{label}</div>
      <div className="text-xl font-semibold text-[#1A2332] mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-[#6B7785] mt-0.5">{sub}</div>}
    </div>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-[#94A0AE] shrink-0">{label}</span>
      {children}
    </div>
  );
}

// Light renderer for the LLM analysis: preserves line breaks and **bold**.
function renderAnalysis(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.trim() === "") return <div key={i} className="h-1.5" />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i}>
        {parts.map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={j} className="font-semibold">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <span key={j}>{p}</span>
          )
        )}
      </p>
    );
  });
}

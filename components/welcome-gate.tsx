"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HomeClient } from "@/components/home-client";
import type { ModelWithUsage, RankingBreakdownRow } from "@/lib/queries";

type HomeData = {
  models: ModelWithUsage[];
  platforms: Record<number, string[]>;
  breakdown: RankingBreakdownRow[];
};

// Welcome landing that gates the dashboard. The page shell renders this
// INSTANTLY (no server data fetch), so a cold Supabase query can never make a
// visitor wait on a blank page or see an empty "0 models" board. We fetch the
// data client-side from /api/home-data — kicked off in the background the moment
// someone lands, so it's usually ready by the time they click "开始". If it's
// still loading, the button shows a spinner and reveals the board the instant
// data arrives. "开始" is, in effect, the load/refresh key.
export function WelcomeGate() {
  const [data, setData] = useState<HomeData | null>(null);
  const [wantsEnter, setWantsEnter] = useState(false);
  const [entered, setEntered] = useState(false);
  const fetching = useRef(false);

  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      // Retry a few times: a cold board comes back empty, not as an error.
      for (let i = 0; i < 5; i++) {
        const res = await fetch("/api/home-data", { cache: "no-store" });
        if (res.ok) {
          const d = (await res.json()) as HomeData;
          if (d.models?.length > 0) {
            setData(d);
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      fetching.current = false;
    }
  }, []);

  // Warm + load in the background as soon as the visitor lands.
  useEffect(() => {
    load();
  }, [load]);

  // If they asked to enter and the data is now here, reveal.
  useEffect(() => {
    if (wantsEnter && data) setEntered(true);
  }, [wantsEnter, data]);

  // If the first attempt finished empty (rare), keep trying while they wait.
  useEffect(() => {
    if (!wantsEnter || data) return;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [wantsEnter, data, load]);

  if (entered && data) return <HomeClient {...data} />;

  const loading = wantsEnter && !data;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-center"
      style={{
        background:
          "radial-gradient(55% 45% at 22% 12%, rgba(168,230,207,0.45), transparent 60%), radial-gradient(50% 45% at 82% 16%, rgba(198,226,240,0.5), transparent 62%), linear-gradient(180deg,#FAFBFC,#EAF1F4)",
      }}
    >
      <div className="text-[12px] font-medium uppercase tracking-[0.28em] text-[var(--accent-aurora)]">
        Market Intelligence
      </div>
      <h1 className="font-serif-heading mt-4 text-[2.6rem] sm:text-[3.4rem] leading-[1.05] font-medium tracking-[-0.015em] text-[#16302B]">
        AI Model Tracker
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#3F564F]">
        欢迎使用 · 跨平台 AI 模型调用量与市场身位监测
      </p>

      <button
        onClick={() => setWantsEnter(true)}
        disabled={loading}
        className="group mt-10 inline-flex items-center gap-2 rounded-full bg-[#16302B] px-8 py-3.5 text-[15px] font-medium text-white shadow-[0_18px_40px_-16px_rgba(22,48,43,0.55)] transition-all hover:bg-[#1f4138] hover:shadow-[0_22px_50px_-16px_rgba(22,48,43,0.6)] disabled:opacity-80"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            正在唤醒数据…
          </>
        ) : (
          <>
            开始 · Get Started
            <span className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </>
        )}
      </button>

      <p className="mt-6 text-[11px] tracking-[0.16em] uppercase text-[#9DB3AD]">
        个人项目 · AI Coding 开发
      </p>
    </div>
  );
}

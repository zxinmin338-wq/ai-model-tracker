"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingCard } from "@/components/loading";

// Wraps server-rendered content whose data can come back empty only because a
// heavy RPC cold-started (the DB always has rows). Instead of dumping an ugly
// "请重试", it shows a graceful skeleton and silently re-runs the server
// component ONCE via router.refresh(). If data still doesn't arrive, it shows a
// calm message — never a raw error.
export function RetryBoundary({
  empty,
  children,
  rows,
}: {
  empty: boolean;
  children: React.ReactNode;
  rows?: number;
}) {
  const router = useRouter();
  const retried = useRef(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!empty) return; // data present — nothing to do
    if (!retried.current) {
      retried.current = true;
      const refreshTimer = setTimeout(() => router.refresh(), 1000);
      // If the refresh still yields nothing after a grace period, stop showing
      // the spinner forever and show a calm message.
      const giveUpTimer = setTimeout(() => setGaveUp(true), 9000);
      return () => {
        clearTimeout(refreshTimer);
        clearTimeout(giveUpTimer);
      };
    }
  }, [empty, router]);

  if (!empty) return <>{children}</>;

  if (gaveUp) {
    return (
      <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-8">
        <div className="flex flex-col items-center justify-center gap-2 h-[180px] text-center">
          <div className="text-sm font-medium text-[#16302B]">数据正在加载</div>
          <div className="text-sm text-[#5C726E]">
            数据源响应较慢，请稍候刷新页面重试。
          </div>
        </div>
      </div>
    );
  }

  return <LoadingCard rows={rows} />;
}

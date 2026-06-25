"use client";

// Shared loading affordances — aurora-themed, replaces the old ugly "请重试".

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-[var(--border-cool)] border-t-[var(--accent-aurora)] animate-spin align-middle"
      style={{ width: size, height: size }}
    />
  );
}

// Inline loading state (spinner + copy) for AI generation / small areas.
export function LoadingInline({ text = "正在加载数据…" }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#5C726E]">
      <Spinner />
      {text}
    </div>
  );
}

// A graceful full-card loading state with a shimmering skeleton — used while a
// page's heavy data is (re)loading. No error text, no "请重试".
export function LoadingCard({
  text = "正在加载数据…",
  rows = 6,
}: {
  text?: string;
  rows?: number;
}) {
  return (
    <div className="bg-white/75 backdrop-blur-[3px] border border-[var(--border-cool)] rounded-[20px] shadow-soft p-8">
      <div className="flex items-center gap-2 text-sm text-[#5C726E] mb-6">
        <Spinner />
        {text}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-6 rounded skeleton-shimmer" />
            <div className="h-4 flex-1 rounded skeleton-shimmer" />
            <div className="h-4 w-20 rounded skeleton-shimmer" />
            <div className="h-4 w-16 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

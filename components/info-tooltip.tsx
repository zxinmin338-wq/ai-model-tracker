"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * Small ⓘ icon that reveals an explanatory bubble on hover/focus.
 * Display-layer only. Keyboard-focusable (aria-label). The bubble flips to the
 * left edge if it would overflow the right side of the viewport.
 */
export function InfoTooltip({
  children,
  label = "说明",
  size = 14,
}: {
  children: ReactNode;
  label?: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Flip alignment so the ~240px bubble never spills off the right edge.
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setAlignRight(rect.left + 240 > window.innerWidth - 12);
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        className="inline-flex items-center text-[#94A0AE] hover:text-[#6B7785] focus:outline-none focus-visible:text-[#5B8DEF] cursor-help"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation(); // don't trigger a sortable header's onClick
          setOpen((v) => !v);
        }}
      >
        <Info width={size} height={size} strokeWidth={2} />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-full z-50 mt-1.5 w-max max-w-[240px] rounded-lg border border-[#E8EEF7] bg-white px-3 py-2 text-xs font-normal leading-relaxed text-[#1A2332] shadow-[0_4px_16px_rgba(0,0,0,0.12)] ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

/**
 * Shared term-glossary tooltip for the「AI 身位分析」blocks (对比页 + 厂商对比页).
 * Explains the recurring vocabulary in one place — the LLM output itself is free
 * text and is not annotated inline.
 */
export function AnalysisTermsTooltip() {
  return (
    <InfoTooltip label="术语说明">
      <span className="block space-y-1.5">
        <span className="block">
          <strong className="font-semibold">身位/排名</strong>
          ：在该平台全部模型中，按调用量排第几
        </span>
        <span className="block">
          <strong className="font-semibold">同档</strong>
          ：与之调用量差距在 20% 以内的，视为同一档位
        </span>
        <span className="block">
          <strong className="font-semibold">量级极低</strong>
          ：该平台调用量过小，数据不足以评估身位与趋势，已排除
        </span>
        <span className="block">
          <strong className="font-semibold">周环比</strong>
          ：本周调用量相比上周的变化（需两周数据，不足则不计）
        </span>
      </span>
    </InfoTooltip>
  );
}

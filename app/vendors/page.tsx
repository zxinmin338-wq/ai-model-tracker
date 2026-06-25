import { getRanking, getRankingBreakdown } from "@/lib/queries";
import { aggregateCompanies, platformTotals, type CompanyAggregate } from "@/lib/company";
import { VendorsClient } from "./vendors-client";
import { RetryBoundary } from "@/components/retry-boundary";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const [ranking, initialBreakdown] = await Promise.all([
    getRanking(),
    getRankingBreakdown(),
  ]);
  let breakdown = initialBreakdown;

  // getRankingBreakdown() returns [] on RPC error/timeout (heavy RPC, ~7s cold).
  // The DB always has snapshots, so an empty breakdown means the RPC failed —
  // NOT "no companies". Retry once on the server; if still empty, the page shell
  // still renders and <RetryBoundary> shows a graceful skeleton + auto-refresh
  // (no ugly "请重试").
  if (breakdown.length === 0) {
    breakdown = await getRankingBreakdown();
  }

  // Per-platform company aggregates (ranked). Computed once on the server so the
  // ranking table + detail + AI all read identical numbers.
  const totals = platformTotals(breakdown);
  const platforms = Object.keys(totals)
    .filter((s) => totals[s] > 0)
    .sort((a, b) => totals[b] - totals[a]); // most active platform first
  const companiesByPlatform: Record<string, CompanyAggregate[]> = {};
  for (const src of platforms) {
    companiesByPlatform[src] = aggregateCompanies(breakdown, ranking, src);
  }

  return (
    <div className="mx-auto max-w-6xl px-12 py-8">
      {/* Aurora wash — same token recipe as the homepage, scoped per page. */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55rem 34rem at 78% -12%, rgba(168,230,207,0.45), transparent 62%), radial-gradient(48rem 32rem at 12% -6%, rgba(198,226,240,0.40), transparent 58%), radial-gradient(40rem 30rem at 95% 8%, rgba(184,231,225,0.30), transparent 60%), linear-gradient(180deg, #F7FBFA 0%, #F3F8F7 55%, #EFF6F4 100%)",
        }}
      />
      <header className="mb-8 border-b border-[var(--border-cool)] pb-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent-aurora)]">
          Vendors
        </div>
        <h1 className="font-serif-heading text-[2.6rem] leading-[1.05] font-medium tracking-[-0.015em] text-[#16302B] mt-2">
          {t.nav.vendors}
        </h1>
        <p className="text-[15px] text-[#5C726E] mt-2 tracking-tight">
          按公司聚合，看各厂商旗下模型在某平台的总量与身位
        </p>
      </header>
      <RetryBoundary empty={platforms.length === 0} rows={9}>
        <VendorsClient
          platforms={platforms}
          companiesByPlatform={companiesByPlatform}
        />
      </RetryBoundary>
    </div>
  );
}

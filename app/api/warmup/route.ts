import { NextRequest } from "next/server";
import { getRanking, getRankingBreakdown, getModelPlatforms } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Keep-alive endpoint: hit every ~5 min by an external cron (cron-job.org) so
// the heavy RPCs (breakdown / model-platforms / ranking) stay warm in Postgres
// and never cold-start ~7s on a real user's first request.
//
// Auth: if CRON_SECRET is set, require it via either
//   Authorization: Bearer <CRON_SECRET>   (same pattern as /api/fetch)
//   ?secret=<CRON_SECRET>                  (easier to paste into a cron URL)
// If CRON_SECRET is unset, the endpoint is open (so local dev doesn't break).
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const querySecret = request.nextUrl.searchParams.get("secret");
    const ok =
      authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
    if (!ok) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Run each RPC and time it individually so the cron log shows whether the DB
  // is actually warm (warm ≈ sub-second; cold ≈ several seconds).
  const time = async <T>(fn: () => Promise<T>): Promise<{ ms: number; count: number }> => {
    const t0 = Date.now();
    const result = await fn();
    const ms = Date.now() - t0;
    const count = Array.isArray(result)
      ? result.length
      : result && typeof result === "object"
        ? Object.keys(result).length
        : 0;
    return { ms, count };
  };

  const t0 = Date.now();
  const [breakdown, platforms, ranking] = await Promise.all([
    time(getRankingBreakdown),
    time(getModelPlatforms),
    time(getRanking),
  ]);
  const totalMs = Date.now() - t0;

  // Warm only if every RPC returned data; an empty result means the RPC failed
  // (timeout/network) and the DB is NOT actually warm.
  const warm =
    breakdown.count > 0 && platforms.count > 0 && ranking.count > 0;

  return Response.json(
    {
      ok: true,
      warm,
      total_ms: totalMs,
      timings: {
        getRankingBreakdown: breakdown,
        getModelPlatforms: platforms,
        getRanking: ranking,
      },
      at: new Date().toISOString(),
    },
    // 200 even if not warm — the cron just needs to keep hitting it; the body
    // tells you the truth via `warm` + timings.
    { status: 200 }
  );
}

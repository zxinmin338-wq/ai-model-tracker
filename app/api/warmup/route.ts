import { NextRequest } from "next/server";
import { getRanking, getRankingBreakdown, getModelPlatforms } from "@/lib/queries";

export const dynamic = "force-dynamic";
// A cold breakdown call hits Postgres's statement timeout (~3s) and returns 0
// rows; it takes a few back-to-back runs to warm shared buffers enough to
// complete. So this endpoint may run several seconds on a fully-cold DB — give
// it room beyond Vercel's 10s default. Once warm it returns in <1s.
export const maxDuration = 30;

// Time a single call and report how many rows/keys it returned (0 == failed/cold).
async function timeOnce<T>(fn: () => Promise<T>): Promise<{ ms: number; count: number }> {
  const t0 = Date.now();
  const result = await fn();
  const ms = Date.now() - t0;
  const count = Array.isArray(result)
    ? result.length
    : result && typeof result === "object"
      ? Object.keys(result).length
      : 0;
  return { ms, count };
}

// Keep-alive endpoint: hit every ~5 min by an external cron (cron-job.org) so
// the heavy RPCs (breakdown / model-platforms / ranking) stay warm in Postgres
// and never cold-start on a real user's first request.
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

  const t0 = Date.now();

  // platforms (skip scan) and ranking warm in a single call each — fire together.
  const [platforms, ranking] = await Promise.all([
    timeOnce(getModelPlatforms),
    timeOnce(getRanking),
  ]);

  // breakdown is the fragile one: a cold call returns 0 rows (statement timeout).
  // Retry back-to-back — no sleep, so the buffers stay hot between attempts —
  // until it returns data or we run out of time budget. This is what makes a
  // SINGLE cron ping reliably warm the DB instead of needing several pings.
  const BREAKDOWN_MAX_ATTEMPTS = 5;
  const BUDGET_MS = 24_000; // stay under maxDuration (30s) and the cron's timeout
  let breakdownMs = 0;
  let breakdownCount = 0;
  let breakdownAttempts = 0;
  while (
    breakdownAttempts < BREAKDOWN_MAX_ATTEMPTS &&
    Date.now() - t0 < BUDGET_MS
  ) {
    breakdownAttempts++;
    const r = await timeOnce(getRankingBreakdown);
    breakdownMs += r.ms;
    breakdownCount = r.count;
    if (breakdownCount > 0) break; // warm — stop retrying
  }

  const totalMs = Date.now() - t0;

  // Warm only if every RPC returned data; an empty result means a RPC failed
  // (timeout/network) and the DB is NOT actually warm.
  const warm = breakdownCount > 0 && platforms.count > 0 && ranking.count > 0;

  return Response.json(
    {
      ok: true,
      warm,
      total_ms: totalMs,
      timings: {
        getRankingBreakdown: {
          ms: breakdownMs,
          count: breakdownCount,
          attempts: breakdownAttempts,
        },
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

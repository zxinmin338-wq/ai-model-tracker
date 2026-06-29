import { NextRequest } from "next/server";
import { getRanking, getRankingBreakdown, getModelPlatforms } from "@/lib/queries";

export const dynamic = "force-dynamic";
// Cold heavy RPCs can take ~10s each and may need a couple back-to-back runs to
// warm Postgres's buffers, so give the function room beyond Vercel's 10s default.
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

// Keep-alive endpoint: hit every ~5 min by an external cron (cron-job.org) so the
// heavy RPCs stay warm in Postgres and never cold-start on a real user's first
// request. Auth: if CRON_SECRET is set, require it via
//   Authorization: Bearer <CRON_SECRET>  or  ?secret=<CRON_SECRET>
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
  const BUDGET_MS = 24_000; // stay under maxDuration (30s) and the cron's timeout

  // Retry an RPC back-to-back (no sleep — keep buffers hot) until it returns rows
  // or we run out of budget. get_ranking_7d AND the breakdown RPC both hit the
  // statement timeout when cold (returning empty), but a few back-to-back calls
  // warm the buffers. This is what makes ONE cron ping reliably warm the DB —
  // critically, ranking must be retried too, otherwise it stays perpetually cold
  // and the homepage's first visitor eats the ~10s timeout.
  const warmRetry = async (
    fn: () => Promise<unknown>,
    maxAttempts = 5
  ): Promise<{ ms: number; count: number; attempts: number }> => {
    let ms = 0;
    let count = 0;
    let attempts = 0;
    while (attempts < maxAttempts && Date.now() - t0 < BUDGET_MS) {
      attempts++;
      const r = await timeOnce(fn);
      ms += r.ms;
      count = r.count;
      if (count > 0) break;
    }
    return { ms, count, attempts };
  };

  // platforms is the fast skip-scan and rarely cold — one shot.
  const platforms = await timeOnce(getModelPlatforms);
  // ranking + breakdown are the heavy, cold-prone ones — retry until warm.
  const ranking = await warmRetry(getRanking);
  const breakdown = await warmRetry(getRankingBreakdown);

  const totalMs = Date.now() - t0;

  // Warm only if every RPC returned data; empty means a RPC failed (timeout) and
  // the DB is NOT actually warm.
  const warm = ranking.count > 0 && breakdown.count > 0 && platforms.count > 0;

  return Response.json(
    {
      ok: true,
      warm,
      total_ms: totalMs,
      timings: {
        getRanking: ranking,
        getRankingBreakdown: breakdown,
        getModelPlatforms: platforms,
      },
      at: new Date().toISOString(),
    },
    { status: 200 }
  );
}

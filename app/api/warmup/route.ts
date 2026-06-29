import { NextRequest } from "next/server";
import { getRanking, getRankingBreakdown, getModelPlatforms } from "@/lib/queries";

export const dynamic = "force-dynamic";
// Refreshing the materialized views runs the heavy query once; can take ~15s when
// cold, so give the function room beyond Vercel's 10s default.
export const maxDuration = 30;

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

// Keep-fresh endpoint: hit every ~5 min by an external cron (cron-job.org). The
// homepage now reads precomputed materialized views (docs/batch10) instead of the
// live heavy query, so this endpoint's job is to REFRESH those views. The refresh
// function raises its own statement_timeout, so it completes even when cold — and
// if it ever fails, the views keep serving the last good snapshot (never empty).
//
// Auth: if CRON_SECRET is set, require it via
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

  // Health check: confirm the homepage's materialized views serve data. Refresh
  // is handled by a pg_cron job inside Postgres (the API path hits the ~8s
  // statement timeout), so this endpoint no longer needs to refresh — reads hit
  // the MVs and are instant. The external keep-warm cron is now optional.
  const [ranking, breakdown, platforms] = await Promise.all([
    timeOnce(getRanking),
    timeOnce(getRankingBreakdown),
    timeOnce(getModelPlatforms),
  ]);

  const fresh =
    ranking.count > 0 && breakdown.count > 0 && platforms.count > 0;

  return Response.json(
    {
      ok: true,
      fresh,
      total_ms: Date.now() - t0,
      counts: {
        ranking: ranking.count,
        breakdown: breakdown.count,
        platforms: platforms.count,
      },
      at: new Date().toISOString(),
    },
    { status: 200 }
  );
}

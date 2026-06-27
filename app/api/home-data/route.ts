import { NextResponse } from "next/server";
import {
  getRanking,
  getModelPlatforms,
  getRankingBreakdown,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

// A cold ranking/breakdown RPC hits the statement timeout and returns []. Retry
// so the client never receives an empty board.
async function nonEmpty<T>(fn: () => Promise<T[]>, tries = 4): Promise<T[]> {
  let last: T[] = [];
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last.length > 0) return last;
  }
  return last;
}

// Powers the welcome-gated homepage: the page shell renders instantly (no data),
// then the client fetches this once the visitor clicks "开始". Returns the same
// three datasets the homepage needs, with breakdown/ranking retried until warm.
export async function GET() {
  const [models, platforms, breakdown] = await Promise.all([
    nonEmpty(getRanking),
    getModelPlatforms(),
    nonEmpty(getRankingBreakdown),
  ]);

  return NextResponse.json(
    { models, platforms, breakdown },
    { headers: { "Cache-Control": "no-store" } }
  );
}

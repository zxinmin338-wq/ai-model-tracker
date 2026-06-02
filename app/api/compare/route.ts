import { NextRequest } from "next/server";
import { getDailyUsage } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slugs = searchParams.getAll("slugs");
  const daysParam = searchParams.get("days");
  const channelParam = searchParams.get("channel"); // "all" | "free" | "standard"

  if (slugs.length === 0) {
    return Response.json({ series: [], events: [] });
  }

  const days = ([7, 14, 30] as const).includes(Number(daysParam) as 7 | 14 | 30)
    ? (Number(daysParam) as 7 | 14 | 30)
    : 7;

  const channel = (["all", "free", "standard"] as const).includes(
    channelParam as "all" | "free" | "standard"
  )
    ? (channelParam as "all" | "free" | "standard")
    : "all";

  const result = await getDailyUsage(slugs, days, channel);
  return Response.json(result);
}

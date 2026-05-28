import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modelId = Number(searchParams.get("model_id") ?? "1");

  // 1. Test the RPC function
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_hourly_deltas",
    { p_model_id: modelId }
  );

  // 2. Check raw snapshots count
  const { count } = await supabase
    .from("snapshots")
    .select("*", { count: "exact", head: true })
    .eq("model_id", modelId);

  // 3. Get a few sample snapshots
  const { data: samples } = await supabase
    .from("snapshots")
    .select("model_id, usage_date, total_tokens, captured_at")
    .eq("model_id", modelId)
    .order("captured_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    model_id: modelId,
    rpc_result: rpcData,
    rpc_error: rpcError,
    snapshot_count: count,
    sample_snapshots: samples,
  });
}

import { NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// PATCH /api/models — update model fields (is_own, provider)
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, is_own, provider } = body as {
    id: number;
    is_own?: boolean;
    provider?: string;
  };

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const updates: Record<string, unknown> = {};
  if (typeof is_own === "boolean") updates.is_own = is_own;
  if (typeof provider === "string") updates.provider = provider;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("models")
    .update(updates)
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

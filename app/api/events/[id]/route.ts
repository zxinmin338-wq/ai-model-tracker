import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// PUT — update event
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { model_id, event_date, event_type, label, description } = body;

  if (!model_id || !event_date || !event_type || !label) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const svc = getServiceClient();
  const { data, error } = await svc
    .from("events")
    .update({ model_id, event_date, event_type, label, description: description || null })
    .eq("id", Number(id))
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE — delete event
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const svc = getServiceClient();
  const { error } = await svc.from("events").delete().eq("id", Number(id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

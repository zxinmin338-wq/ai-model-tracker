import { NextRequest, NextResponse } from "next/server";
import { supabase, getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET — list all events (with model info)
export async function GET() {
  const { data, error } = await supabase
    .from("events")
    .select("*, models(display_name, brand, permaslug, color_hex)")
    .order("event_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const events = (data ?? []).map((e) => ({
    ...e,
    display_name: (e.models as any)?.display_name,
    brand: (e.models as any)?.brand,
    permaslug: (e.models as any)?.permaslug,
    color_hex: (e.models as any)?.color_hex,
    models: undefined,
  }));

  return NextResponse.json(events);
}

// POST — create event
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { model_id, event_date, event_type, label, description } = body;

  if (!model_id || !event_date || !event_type || !label) {
    return NextResponse.json(
      { error: "Missing required fields: model_id, event_date, event_type, label" },
      { status: 400 }
    );
  }

  const svc = getServiceClient();
  const { data, error } = await svc
    .from("events")
    .insert({ model_id, event_date, event_type, label, description: description || null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

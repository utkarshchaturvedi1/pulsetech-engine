import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return NextResponse.json({ error: "Client portal is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let body: { subject?: unknown; details?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter a subject and details." }, { status: 400 }); }
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const details = typeof body.details === "string" ? body.details.trim() : "";
  if (subject.length < 3 || subject.length > 120 || details.length < 10 || details.length > 4000) {
    return NextResponse.json({ error: "Use a subject of 3–120 characters and details of 10–4,000 characters." }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("customer_memberships").select("customer_account_id").eq("user_id", user.id).maybeSingle();
  if (membershipError || !membership) return NextResponse.json({ error: "No client account is connected to this login." }, { status: 403 });

  const { error } = await supabase.from("handover_requests").insert({
    customer_account_id: membership.customer_account_id,
    requested_by: user.id,
    subject,
    details,
  });
  if (error) return NextResponse.json({ error: "We couldn’t save this request. Please try again." }, { status: 503 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

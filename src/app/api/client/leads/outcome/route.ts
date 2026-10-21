import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseClientLeadOutcome } from "@/lib/clientLeadOutcome";

export async function PATCH(request: Request) {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return NextResponse.json({ error: "Client portal is not configured." }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let body: { leadId?: unknown; outcome?: unknown; saleAmountUsd?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Choose an outcome and try again." }, { status: 400 }); }
  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  const parsedOutcome = parseClientLeadOutcome(body.outcome, body.saleAmountUsd);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId)) {
    return NextResponse.json({ error: "That lead could not be found." }, { status: 400 });
  }
  if (!parsedOutcome.ok) return NextResponse.json({ error: parsedOutcome.error }, { status: 400 });

  const { data: membership, error: membershipError } = await supabase
    .from("customer_memberships").select("customer_account_id").eq("user_id", user.id).maybeSingle();
  if (membershipError || !membership) return NextResponse.json({ error: "No client account is connected to this login." }, { status: 403 });

  const { data, error } = await supabase.from("customer_leads")
    .update({ sales_outcome: parsedOutcome.outcome, sale_amount_usd: parsedOutcome.saleAmountUsd })
    .eq("id", leadId)
    .eq("customer_account_id", membership.customer_account_id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the lead outcome. Please try again." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "That lead is not in this client account." }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 200 });
}

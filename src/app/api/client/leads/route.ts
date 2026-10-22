import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return NextResponse.json({ error: "Client portal is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let body: { leadId?: unknown; salesOutcome?: unknown; saleAmountUsd?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid update." }, { status: 400 }); }
  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  const salesOutcome = body.salesOutcome;
  const rawSaleAmount = body.saleAmountUsd;
  const saleAmountUsd = rawSaleAmount === null || rawSaleAmount === "" ? null : Number(rawSaleAmount);
  if (!/^[0-9a-f-]{36}$/i.test(leadId) || !["unreviewed", "converted", "not_converted"].includes(String(salesOutcome)) ||
      (saleAmountUsd !== null && (!Number.isFinite(saleAmountUsd) || saleAmountUsd < 0 || saleAmountUsd > 9999999999.99)) ||
      (salesOutcome === "converted" && saleAmountUsd === null)) {
    return NextResponse.json({ error: "Enter a valid sale status and non-negative job value." }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("customer_memberships").select("customer_account_id").eq("user_id", user.id).maybeSingle();
  if (membershipError || !membership) return NextResponse.json({ error: "No client account is connected to this login." }, { status: 403 });

  const { data, error } = await supabase.from("customer_leads")
    .update({ sales_outcome: salesOutcome, sale_amount_usd: saleAmountUsd })
    .eq("id", leadId).eq("customer_account_id", membership.customer_account_id)
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save lead changes. Please try again." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "This lead was not found in your account." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

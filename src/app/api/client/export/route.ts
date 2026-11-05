import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const { data: membership, error } = await session.from("customer_memberships")
      .select("customer_account_id").eq("user_id", user.id).maybeSingle();
    if (error || !membership) return NextResponse.json({ error: "Account not found." }, { status: 403 });

    const leads: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const current = await session.from("customer_leads")
        .select("id,source,customer_name,customer_phone,customer_email,service_address,primary_need,preferred_timing,urgency,sales_outcome,sale_amount_usd,first_captured_at")
        .eq("customer_account_id", membership.customer_account_id).order("id").range(offset, offset + 499);
      if (!current.error) {
        leads.push(...current.data);
        if (current.data.length < 500) break;
        continue;
      }
      if (!current.error.message.includes("source")) throw current.error;
      const legacy = await session.from("customer_leads")
        .select("id,customer_name,customer_phone,customer_email,service_address,primary_need,preferred_timing,urgency,sales_outcome,sale_amount_usd,first_captured_at")
        .eq("customer_account_id", membership.customer_account_id).order("id").range(offset, offset + 499);
      if (legacy.error) throw legacy.error;
      leads.push(...legacy.data.map((row) => ({ ...row, source: "Website chat" })));
      if (legacy.data.length < 500) break;
    }

    const columns: [string, (lead: Record<string, unknown>) => unknown][] = [
      ["Captured at", lead => lead.first_captured_at],
      ["Lead source", lead => lead.source],
      ["Customer name", lead => lead.customer_name],
      ["Phone", lead => lead.customer_phone],
      ["Email", lead => lead.customer_email],
      ["Service address", lead => lead.service_address],
      ["What they need", lead => lead.primary_need],
      ["Preferred timing", lead => lead.preferred_timing],
      ["Urgency", lead => lead.urgency],
      ["Sales outcome", lead => lead.sales_outcome],
      ["Sale amount (USD)", lead => lead.sale_amount_usd],
    ];
    const csvCell = (value: unknown) => {
      let text = value == null ? "" : String(value);
      if (typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const csv = [
      columns.map(([label]) => csvCell(label)).join(","),
      ...leads.map(lead => columns.map(([, get]) => csvCell(get(lead))).join(",")),
    ].join(String.fromCharCode(13, 10));
    return new Response(String.fromCharCode(0xfeff) + csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=PulseTech_Leads.csv",
      },
    });
  } catch (error) {
    console.error("client_lead_export_failed", error instanceof Error ? error.message : "Unknown export error");
    return NextResponse.json({ error: "Export could not be completed. Please try again." }, { status: 503 });
  }
}

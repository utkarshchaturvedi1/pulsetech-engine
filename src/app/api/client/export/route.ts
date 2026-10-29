import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET() {
  try {
    const session=await createClient(); const { data:{user} }=await session.auth.getUser();
    if (!user) return NextResponse.json({error:"Please sign in."},{status:401});
    const {data:membership,error}=await session.from("customer_memberships").select("customer_account_id").eq("user_id",user.id).maybeSingle();
    if(error||!membership) return NextResponse.json({error:"Account not found."},{status:403});
    // Page through the complete tenant export, rather than silently returning
    // only PostgREST's default first 1,000 rows.
    const leads: unknown[]=[];
    for(let offset=0;;offset+=500){
      const page=await session.from("customer_leads").select("id,customer_name,customer_phone,customer_email,service_address,primary_need,preferred_timing,urgency,sales_outcome,sale_amount_usd,first_captured_at,updated_at").eq("customer_account_id",membership.customer_account_id).order("id").range(offset,offset+499);
      if(page.error) throw page.error; leads.push(...page.data);
      if(page.data.length<500) break;
    }
    return NextResponse.json({exportedAt:new Date().toISOString(),leads},{headers:{"Cache-Control":"no-store","Content-Disposition":"attachment; filename=PulseTech_Leads.json"}});
  }catch{return NextResponse.json({error:"Export could not be completed. Please try again."},{status:503});}
}

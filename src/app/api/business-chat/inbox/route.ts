import { createClient } from "@/lib/supabase/server";
import { createClient as adminClient } from "@supabase/supabase-js";
import { isPulseTechAdmin } from "@/lib/clientAccess";
import { authorizeProfileAccess } from "@/lib/authorizeProfileAccess";
import { chatError, readBody, readBusiness, listLeads, validBusinessId } from "@/lib/businessChat/store";
import { listPhotos, readPhoto } from "@/lib/businessChat/media";
export const runtime="nodejs";
export async function POST(request: Request) {
  try {
    const body=await readBody(request), id=validBusinessId(body.demoId);
    const session=await createClient();
    const {data:{user}}=await session.auth.getUser();
    if(!user)return Response.json({error:"Please sign in to view leads."},{status:401});
    if(!isPulseTechAdmin(user.email,process.env.PULSETECH_ADMIN_EMAILS)){
      const admin=adminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:account,error}=await admin.from("customer_accounts").select("id").eq("demo_id",id).maybeSingle();
      if(error) return Response.json({error:"Lead access is temporarily unavailable."},{status:503});
      if(!account)return Response.json({error:"Connect this demo to your client account to view its leads."},{status:403});
    }
    const access=await authorizeProfileAccess(id,"write");
    if(!access.allowed)return Response.json({error:access.error},{status:access.status});
    await readBusiness(id);
    if(body.photoId) return Response.json({dataUrl:await readPhoto(id,String(body.photoId))},{headers:{"Cache-Control":"no-store"}});
    const [leads,photos]=await Promise.all([listLeads(id),listPhotos(id)]);
    return Response.json({leads:leads.map(lead=>({...lead,photos:photos.filter(photo=>photo.conversationId===lead.profile.conversationId)}))},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return chatError(error);}
}

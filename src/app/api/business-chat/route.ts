import { after } from "next/server";
import { parseMessages, currentConversation } from "@/lib/businessChat/policy";
import { ChatError, chatError, readBody, readBusiness, validConversation, findLead, saveLead } from "@/lib/businessChat/store";
import { readPhoto } from "@/lib/businessChat/media";
import { generateBusinessReply, submissionState, leadClosing } from "@/lib/businessChat/engine";
import { maybeSendLeadHandoff, scheduleLeadAlertDelivery } from "@/lib/leadHandoff";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const body=await readBody(request), record=await readBusiness(body.demoId), conversationId=validConversation(body.conversationId);
    let messages;
    try { messages=parseMessages(body.messages); } catch(error) {throw new ChatError((error as Error).message);}
    const submitted=await findLead(record.id,conversationId);
    const ids=[...new Set(currentConversation(messages,record.updatedAt).flatMap(m=>m.photoIds || []))];
    if(ids.length>3) throw new ChatError("You can share up to three photos per conversation.");
    const photos=new Map(await Promise.all(ids.map(async id=>[id,await readPhoto(record.id,id,conversationId)] as const)));
    const result=await generateBusinessReply(record.profile,messages,record.updatedAt,photos,!!submitted);
    const current=await readBusiness(record.id);
    if(current.updatedAt!==record.updatedAt) throw new ChatError("The business information was updated. Please send your message again.",409);
    if(result.submission) {
      const parsed=submissionState(record.profile,conversationId,result.submission,messages);
      if(parsed.missing) return Response.json({reply:parsed.missing,version:record.updatedAt,closed:false});
      const handoff=await maybeSendLeadHandoff(record.profile,parsed.state!,"closure",messages.at(-1)?.content);
      const created=await saveLead(record,conversationId,parsed.lead!,handoff.status);
      if(created) scheduleLeadAlertDelivery(after,handoff.delivery);
      return Response.json({reply:leadClosing,version:record.updatedAt,closed:true},{headers:{"Cache-Control":"no-store"}});
    }
    return Response.json({reply:result.reply,version:record.updatedAt,closed:!!submitted},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return chatError(error);}
}

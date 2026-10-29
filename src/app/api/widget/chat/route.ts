import { after, NextResponse } from "next/server";
import { clientService, reserveClientChatConversation, serviceEnabled } from "@/lib/clientService";
import { loadSharedProfile } from "@/lib/sharedProfileStore";
import { generateSalesReply, type SalesChatMessage } from "@/lib/salesChat";
import { businessIdentityKey, createInitialSalesState, isSalesState, isValidConversationId } from "@/lib/salesState";
import { updateSalesStateFromTurn, resolveDeterministicPreContactReply } from "@/lib/salesController";
import { buildPostContactNextStepReply } from "@/lib/salesConversation";
import { scheduleLeadAlertDelivery } from "@/lib/leadHandoff";
import { persistLiveClientLead } from "@/lib/persistClientLead";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0)>100000) return NextResponse.json({ error: "Message too large." }, { status: 413 });
    const body = await request.json();
    if (JSON.stringify(body).length>100000 || typeof body.demoId!=="string" || !/^[a-z0-9_-]{2,120}$/i.test(body.demoId) || !isValidConversationId(body.conversationId) || !Array.isArray(body.messages) || !body.messages.length || body.messages.length>40 || !body.messages.every((m: SalesChatMessage) => m && ["user","assistant"].includes(m.role) && typeof m.content==="string" && m.content.trim().length>0 && m.content.length<=4000) || body.messages.at(-1).role!=="user") return NextResponse.json({ error: "Enter a valid message." }, { status: 400 });
    const account = await clientService(body.demoId);
    if (!account || !serviceEnabled(account)) return NextResponse.json({ error: "This assistant is currently unavailable. Please contact the business through its website." }, { status: 403 });
    if (!(await reserveClientChatConversation(body.demoId, body.conversationId))) return NextResponse.json({ error: "This business has reached its included monthly chat limit. Please contact the business directly." }, { status: 429 });
    const demo = await loadSharedProfile(body.demoId);
    if (!demo) throw new Error("Profile unavailable.");
    const profile=demo.profile, businessKey=businessIdentityKey(profile);
    let state=isSalesState(body.salesState) ? body.salesState : createInitialSalesState({ conversationId: body.conversationId, businessKey });
    if (state.businessKey!==businessKey || state.conversationId!==body.conversationId) return NextResponse.json({ error: "Please reopen the chat." }, { status: 400 });
    let reply: string;
    try {
      const result=await generateSalesReply(profile,body.messages,state);
      reply=result.reply; state=result.salesState; scheduleLeadAlertDelivery(after,result.leadDelivery);
    } catch {
      state=updateSalesStateFromTurn(state,body.messages,profile);
      reply=resolveDeterministicPreContactReply(state,profile,body.messages.at(-1).content) || state.pendingOwnerQuestion || buildPostContactNextStepReply(state,profile);
    }
    // Saving the recoverable opportunity is independent from qualification and alerts.
    await persistLiveClientLead(body.demoId,state);
    return NextResponse.json({ reply,salesState:state,conversationId:body.conversationId });
  } catch { return NextResponse.json({ error: "We couldn’t save your message. Please try again." }, { status: 503 }); }
}

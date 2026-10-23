import { ChatError, chatError, readBusiness, validConversation } from "@/lib/businessChat/store";
import { savePhoto } from "@/lib/businessChat/media";
export const runtime="nodejs";
export async function POST(request: Request) {
  try {
    if(Number(request.headers.get("content-length")||0)>2300000) throw new ChatError("Please choose a photo smaller than 2 MB.",413);
    const form=await request.formData(), record=await readBusiness(form.get("demoId")), conversationId=validConversation(form.get("conversationId"));
    const file=form.get("photo");
    if(!(file instanceof File)) throw new ChatError("Choose a photo to upload.");
    return Response.json(await savePhoto(record.id,conversationId,file),{headers:{"Cache-Control":"no-store"}});
  }catch(error){return chatError(error);}
}

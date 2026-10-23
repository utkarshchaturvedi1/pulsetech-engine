import { labError, LabError, readLab, validLabId } from "@/lib/salesLab/store";
import { savePhoto } from "@/lib/salesLab/media";
import { validConversation } from "@/lib/salesLab/leads";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 2300000) throw new LabError("Please choose a photo smaller than 2 MB.", 413);
    const form = await request.formData();
    const id = validLabId(form.get("id"));
    const conversationId = validConversation(form.get("conversationId"));
    await readLab(id);
    const file = form.get("photo");
    if (!(file instanceof File)) throw new LabError("Choose a photo to upload.");
    return Response.json(await savePhoto(id, conversationId, file), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return labError(error); }
}

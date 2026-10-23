import { randomUUID } from "node:crypto";
import { LabError, labError, readBody, readLab, requireOwner, validLabId, writeLab } from "@/lib/salesLab/store";
import { applyPeterPlan, askPeter } from "@/lib/salesLab/peter";
import { listLeads } from "@/lib/salesLab/leads";
import { listPhotos, readPhoto } from "@/lib/salesLab/media";
export const runtime = "nodejs";
export const maxDuration = 60;

// Peter is the only writer. Visitor chat has no write path or owner credential.
export async function POST(request: Request) {
  try {
    requireOwner(request);
    const body = await readBody(request);
    if (body.action === "create") {
      if (typeof body.businessName !== "string" || !body.businessName.trim() || body.businessName.length > 150) throw new LabError("Enter a business name (up to 150 characters).");
      const record = await writeLab({ kind: "independent-sales-lab-v1", businessName: body.businessName.trim(), instructions: [] });
      return Response.json(record, { headers: { "Cache-Control": "no-store" } });
    }
    const record = await readLab(validLabId(body.id));
    if (body.action === "photo") return Response.json({ dataUrl: await readPhoto(record.id, String(body.photoId)) }, { headers: { "Cache-Control": "no-store" } });
    if (body.action === "leads") {
      const [leads, photos] = await Promise.all([listLeads(record.id), listPhotos(record.id)]);
      return Response.json({ leads: leads.map(lead => ({ ...lead, photos: photos.filter(photo => photo.conversationId === lead.profile.conversationId) })), emailConfigured: !!(record.profile.leadAlertEmail && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "load") return Response.json(record, { headers: { "Cache-Control": "no-store" } });
    if (body.version !== record.updated_at) throw new LabError("Reload Peter: these instructions have changed.", 409);
    if (body.action === "instruct") {
      if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 12000) throw new LabError("Tell Peter what to include, change, or exclude.");
      const plan = await askPeter(record.profile, body.text);
      const next = applyPeterPlan(record.profile, plan);
      const changed = plan.add.length + plan.revise.length + plan.revoke.length > 0 || (plan.leadAlertEmail != null && plan.leadAlertEmail !== record.profile.leadAlertEmail);
      const saved = changed ? await writeLab(next, record) : record;
      return Response.json({ ...saved, peterReply: plan.reply, changed }, { headers: { "Cache-Control": "no-store" } });
    }
    const profile = { ...record.profile, instructions: [...record.profile.instructions] };
    if (body.action === "add") {
      if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 12000) throw new LabError("Enter an instruction (up to 12,000 characters).");
      profile.instructions.push({ id: randomUUID(), text: body.text.trim(), createdAt: new Date().toISOString() });
    } else if (body.action === "revoke") {
      if (!profile.instructions.some(item => item.id === body.instructionId)) throw new LabError("Instruction not found.");
      profile.instructions = profile.instructions.filter(item => item.id !== body.instructionId);
    } else throw new LabError("Unknown Peter action.");
    return Response.json(await writeLab(profile, record), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return labError(error); }
}

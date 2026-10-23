import OpenAI from "openai";
import { containsContact, parseMessages, salesInstructions } from "@/lib/salesLab/policy";
import { LabError, labError, readBody, readLab, validLabId } from "@/lib/salesLab/store";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const record = await readLab(validLabId(body.id));
    let messages;
    try { messages = parseMessages(body.messages); } catch (error) { throw new LabError((error as Error).message); }
    if (!process.env.OPENAI_API_KEY) throw new LabError("The test AI connection has not been configured.", 503);
    if (!process.env.SALES_LAB_MODEL) throw new LabError("Choose an OpenAI model for the test page first.", 503);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45000, maxRetries: 0 });
    const response = await client.responses.create({
      model: process.env.SALES_LAB_MODEL,
      instructions: salesInstructions(record.profile),
      input: messages,
      store: false,
      max_output_tokens: 1500,
    });
    const reply = response.output_text?.trim();
    if (!reply || response.status !== "completed") throw new LabError("I couldn't complete that reply. Please try again.", 503);
    // Do not display a prohibited contact detail if the model misses the rule.
    if (containsContact(reply)) throw new LabError("I couldn't complete that reply safely. Please rephrase your question.", 502);
    // A concurrent Peter revocation must not leak an in-flight stale answer.
    const current = await readLab(record.id);
    if (current.updated_at !== record.updated_at) throw new LabError("Peter updated the business information. Please send your message again.", 409);
    return Response.json({ reply, businessName: record.profile.businessName, version: record.updated_at }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return labError(error); }
}

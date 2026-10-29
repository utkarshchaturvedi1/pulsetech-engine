import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeDemoId } from "@/lib/demoRepository";
import { claimDemoForUser } from "@/lib/clientDemoClaim";

export async function POST(request: Request) {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return NextResponse.json({ error: "Account setup is unavailable." }, { status: 503 });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Please confirm your email and try again." }, { status: 401 });

  let body: { demoId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "The business demo is missing." }, { status: 400 }); }
  const demoId = typeof body.demoId === "string" ? sanitizeDemoId(body.demoId) : null;
  if (!demoId) return NextResponse.json({ error: "The business demo is invalid." }, { status: 400 });

  const result = await claimDemoForUser(demoId, user);
  if (result === "claimed" || result === "already-linked") return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result === "unavailable" ? "We couldn’t connect to account setup. Please try again shortly." : "This demo is already connected to another account. Contact PulseTech if you need access." }, { status: result === "unavailable" ? 503 : 409 });
}

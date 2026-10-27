import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeClientRedirect } from "@/lib/clientAccess";
import { sanitizeDemoId } from "@/lib/demoRepository";
import { claimDemoForUser } from "@/lib/clientDemoClaim";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const requestedType = searchParams.get("type");
  const otpType = requestedType === "recovery" || requestedType === "invite" || requestedType === "signup" ? requestedType : null;
  if (code || (tokenHash && otpType)) {
    try {
      const supabase = await createClient();
      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType! });
      const { error } = result;
      if (!error) {
        const next = safeClientRedirect(searchParams.get("next") || "/reset-password");
        const nextUrl = new URL(next, origin);
        const demoMatch = /^\/demo\/([a-z0-9_-]+)$/i.exec(nextUrl.pathname);
        const requestedDemoId = demoMatch?.[1]
          ? decodeURIComponent(demoMatch[1])
          : nextUrl.pathname === "/demo" ? nextUrl.searchParams.get("id") : null;
        const user = result.data.user ?? (await supabase.auth.getUser()).data.user;
        const pendingDemoId = typeof user?.user_metadata?.pending_demo_id === "string"
          ? sanitizeDemoId(user.user_metadata.pending_demo_id)
          : null;
        const demoId = requestedDemoId ? sanitizeDemoId(requestedDemoId) : requestedType === "signup" ? pendingDemoId : null;
        if (demoId) {
          const claimResult = user ? await claimDemoForUser(demoId, user) : "conflict";
          if (claimResult !== "claimed" && claimResult !== "already-linked") {
            return NextResponse.redirect(new URL("/login?error=account", origin));
          }
          if (!requestedDemoId) return NextResponse.redirect(new URL(`/demo?id=${encodeURIComponent(demoId)}`, origin));
        }
        return NextResponse.redirect(new URL(next, origin));
      }
    } catch {
      // Missing auth configuration or an unavailable provider must not crash the callback.
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { claimDemoForUser } from "@/lib/clientDemoClaim";
import { resolveCallbackClaimId, resolveCallbackDestination } from "@/lib/authCallbackDestination";

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
        const requestedNext = searchParams.get("next");
        const user = result.data.user ?? (await supabase.auth.getUser()).data.user;
        // Supabase's PKCE confirmation callback commonly returns a `code` without
        // a `type` query parameter. The signup demo ID is stored in user metadata,
        // so use it whenever there is no explicit destination demo. Requiring
        // `type=signup` here silently dropped the demo after email confirmation.
        // Recovery and invitation links must not re-claim a previous signup demo.
        // A stale or unavailable demo must never prevent password setup.
        const demoId = resolveCallbackClaimId(requestedNext, user?.user_metadata?.pending_demo_id, otpType);
        if (demoId) {
          const claimResult = user ? await claimDemoForUser(demoId, user) : "conflict";
          if (claimResult !== "claimed" && claimResult !== "already-linked") {
            return NextResponse.redirect(new URL("/login?error=account", origin));
          }
        }
        return NextResponse.redirect(new URL(resolveCallbackDestination(requestedNext, demoId), origin));
      }
    } catch {
      // Missing auth configuration or an unavailable provider must not crash the callback.
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}

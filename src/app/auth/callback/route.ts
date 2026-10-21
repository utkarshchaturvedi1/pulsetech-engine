import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeClientRedirect } from "@/lib/clientAccess";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const suppliedType = searchParams.get("type");
  const otpType: EmailOtpType | null = suppliedType === "signup" || suppliedType === "invite" || suppliedType === "recovery" || suppliedType === "magiclink" || suppliedType === "email_change" || suppliedType === "email"
    ? suppliedType
    : null;
  if (code || (tokenHash && otpType)) {
    try {
      const supabase = await createClient();
      const { error } = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType! });
      if (!error) return NextResponse.redirect(new URL(safeClientRedirect(searchParams.get("next")), origin));
    } catch {
      // Missing auth configuration or an unavailable provider must not crash the callback.
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}

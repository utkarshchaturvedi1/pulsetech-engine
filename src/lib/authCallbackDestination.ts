import { sanitizeDemoId } from "./demoRepository";
import { safeClientRedirect } from "./clientAccess";

/** Resolves the demo to claim after a Supabase callback, including signup
 * confirmation links that return a PKCE code without `type=signup`. */
export function resolveCallbackDemoId(nextPath: string | null, pendingDemoId: unknown): string | null {
  const safeNext = safeClientRedirect(nextPath);
  const nextUrl = new URL(safeNext, "https://pulsetech.invalid");
  const pathMatch = /^\/demo\/([a-z0-9_-]+)$/i.exec(nextUrl.pathname);
  const requested = pathMatch?.[1]
    ? decodeURIComponent(pathMatch[1])
    : nextUrl.pathname === "/demo" ? nextUrl.searchParams.get("id") : null;
  const candidate = requested || (typeof pendingDemoId === "string" ? pendingDemoId : null);
  if (!candidate || !/^[a-z0-9_-]{2,120}$/i.test(candidate)) return null;
  const sanitized = sanitizeDemoId(candidate);
  return /^[a-z0-9_-]{2,120}$/i.test(sanitized) ? sanitized : null;
}

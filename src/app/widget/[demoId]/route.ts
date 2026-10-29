import { randomBytes } from "node:crypto";
import { clientService, serviceEnabled } from "@/lib/clientService";
import { widgetHtml } from "@/lib/widgetHtml";
export async function GET(request: Request, { params }: { params: Promise<{ demoId: string }> }) {
  try {
    const { demoId } = await params;
    if (!/^[a-z0-9_-]{2,120}$/i.test(demoId)) return new Response("Unavailable", { status: 404 });
    const account = await clientService(demoId);
    if (!account || !serviceEnabled(account) || !account.allowed_domain) return new Response("This assistant is not available right now. Please contact the business through its website.", { status: 403 });
    const nonce = randomBytes(18).toString("base64");
    const origin = new URL(request.url).origin;
    const domain = account.allowed_domain;
    if (!/^[a-z0-9.-]+$/.test(domain)) return new Response("Unavailable", { status: 403 });
    return new Response(widgetHtml(account.business_name, demoId, nonce), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors ${origin} https://${domain} https://www.${domain}; base-uri 'none'; form-action 'none'`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response("Service temporarily unavailable.", { status: 503 }); }
}

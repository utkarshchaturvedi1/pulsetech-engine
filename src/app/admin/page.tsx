import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { billingAdmin } from "@/lib/clientBilling";
import { isPulseTechAdmin } from "@/lib/clientAccess";
import AdminActions from "./AdminActions";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const session = await createClient(); const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (!isPulseTechAdmin(user.email, process.env.PULSETECH_ADMIN_EMAILS)) return <main className="p-8">Administrator access required.</main>;
  const admin = billingAdmin();
  const [currentAccounts, requests] = await Promise.all([
    admin.from("customer_accounts").select("id,customer_id,business_name,billing_status,billing_environment,handover_status,website_status,phone_status,demo_id").order("created_at", { ascending: false }).limit(100),
    admin.from("handover_requests").select("id,subject,details,status,created_at,customer_account_id").order("created_at", { ascending: false }).limit(100),
  ]);
  const accounts = currentAccounts.error ? await admin.from("customer_accounts").select("id,customer_id,business_name,handover_status,demo_id").order("created_at", { ascending: false }).limit(100) : currentAccounts;
  const billingSchemaReady = !currentAccounts.error;
  return <main className="mx-auto max-w-5xl space-y-6 p-6 text-slate-900"><Link href="/client" className="text-blue-700 underline">Client account</Link><h1 className="text-3xl font-bold">PulseTech operations</h1>
    <p>Internal checks release installation. Optional client testing does not delay launch.</p>
    {(accounts.error || requests.error) && <p role="alert">Some account data is unavailable. Verify the account migrations before making changes.</p>}
    {!billingSchemaReady && <p className="rounded bg-amber-50 p-4 text-amber-900">Billing and launch controls are disabled until the account billing migration has been applied.</p>}
    <h2 className="text-xl font-bold">Accounts</h2>{accounts.data?.map(account => <section key={account.id} className="rounded-xl border p-5"><h3 className="font-bold">{account.customer_id} · {account.business_name}</h3><p className="mt-2 text-sm">Billing: {"billing_status" in account ? account.billing_status : "unpaid"} ({("billing_environment" in account && account.billing_environment) || "unpaid"}) · Setup: {account.handover_status} · Website: {("website_status" in account && account.website_status) || "pending"} · Phone: {("phone_status" in account && account.phone_status) || "pending"}</p><Link href={`/demo/${encodeURIComponent(account.demo_id)}`} className="text-blue-700 underline">Open assistant checks</Link>{billingSchemaReady && <AdminActions accountId={account.id} />}</section>)}
    <h2 className="text-xl font-bold">Support queue</h2>{requests.data?.map(request => <section key={request.id} className="rounded-xl border p-5"><h3 className="font-bold">{request.subject} · {request.status}</h3><p className="mt-2 whitespace-pre-wrap">{request.details}</p><p className="text-xs text-slate-600">Account: {request.customer_account_id} · {request.created_at}</p><AdminActions requestId={request.id} /></section>)}
  </main>;
}

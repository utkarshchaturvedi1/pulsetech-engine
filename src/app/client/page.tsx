import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPulseTechAdmin } from "@/lib/clientAccess";
import ClientHandoverRequest from "./ClientHandoverRequest";
import ClientInviteForm from "./ClientInviteForm";
import ClientInstallation from "./ClientInstallation";
import ClientSignOutButton from "./ClientSignOutButton";

export const metadata = { title: "Client handover | PulseTech Labs" };
export const dynamic = "force-dynamic";

type Account = { id: string; customer_id: string; business_name: string; demo_id: string; handover_status: string };
type HandoverRequest = { id: string; subject: string; details: string; status: string; created_at: string };
type CustomerLead = { id: string; customer_name: string | null; customer_phone: string | null; customer_email: string | null; service_address: string | null; primary_need: string | null; urgency: string; preferred_timing: string | null; alert_delivery_status: string; updated_at: string };

const statusLabels: Record<string, string> = {
  invited: "Invitation sent", setup: "Setup in progress", testing: "Testing", approved: "Awaiting launch", live: "Live",
};

export default async function ClientPortalPage() {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return <PortalShell><h1 className="text-2xl font-bold">Client access is being set up</h1><p className="mt-3 text-slate-600">PulseTech is preparing secure account access. Please contact us if you need help.</p></PortalShell>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = isPulseTechAdmin(user.email, process.env.PULSETECH_ADMIN_EMAILS);

  const { data: membership, error: membershipError } = await supabase.from("customer_memberships")
    .select("customer_account_id").eq("user_id", user.id).maybeSingle();
  const { data: accountData, error: accountQueryError } = membership
    ? await supabase.from("customer_accounts").select("id,customer_id,business_name,demo_id,handover_status").eq("id", membership.customer_account_id).maybeSingle()
    : { data: null, error: null };
  const accountError = membershipError || accountQueryError;
  const account = accountData as Account | null;
  const { data: requestData } = account
    ? await supabase.from("handover_requests").select("id,subject,details,status,created_at").eq("customer_account_id", account.id).order("created_at", { ascending: false }).limit(20)
    : { data: [] };
  const requests = (requestData || []) as HandoverRequest[];
  const { data: leadData, error: leadQueryError } = account
    ? await supabase.from("customer_leads").select("id,customer_name,customer_phone,customer_email,service_address,primary_need,urgency,preferred_timing,alert_delivery_status,updated_at").eq("customer_account_id", account.id).order("updated_at", { ascending: false }).limit(50)
    : { data: [], error: null };
  const leads = (leadData || []) as CustomerLead[];

  return <PortalShell email={user.email || ""}>
    {accountError ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
      <h1 className="text-xl font-bold">Client account setup is pending</h1>
      <p className="mt-2 text-sm leading-6">The account database migration needs to be applied before this portal can load client records.</p>
    </section> : !account ? <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-950">No client account is connected</h1>
      <p className="mt-2 text-slate-600">This sign-in email is not linked to a PulseTech customer yet.</p>
      {admin && <div className="mt-7 border-t border-slate-200 pt-6"><h2 className="text-lg font-semibold">Invite a client</h2><p className="mt-1 text-sm text-slate-600">Connect an existing saved business profile to a client login.</p><ClientInviteForm /></div>}
    </section> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Client handover</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">{account.business_name}</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <InfoCard label="Customer ID" value={account.customer_id} />
          <InfoCard label="Handover status" value={statusLabels[account.handover_status] || account.handover_status} />
        </div>
        <p className="mt-5 text-sm text-slate-600">This account is linked to {user.email}. Your handover requests and leads stay with this customer account.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/demo/${encodeURIComponent(account.demo_id)}`} className="inline-flex items-center rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Update business with Peter &amp; test</Link>
        </div>
      </section>
      <ClientInstallation
        businessName={account.business_name}
        demoId={account.demo_id}
        baseUrl={process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.PULSETECH_PUBLIC_BASE_URL?.replace(/\/$/, "") || ""}
      />
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">Recent leads</h2>
        <p className="mt-1 text-sm text-slate-600">Captured customer details and service requests for this business.</p>
        {leadQueryError ? <p role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">Lead records are temporarily unavailable. Please contact PulseTech for help.</p>
          : leads.length ? <div className="mt-4 space-y-3">{leads.map((lead) => <article key={lead.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-slate-950">{lead.customer_name || "New enquiry"}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">Alert {lead.alert_delivery_status.toLowerCase().replaceAll("_", " ")}</span></div>
            {lead.primary_need && <p className="mt-2 text-sm text-slate-800"><span className="font-medium">Request:</span> {lead.primary_need}</p>}
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm text-slate-600 sm:grid-cols-2">
              {lead.customer_phone && <div><dt className="inline font-medium text-slate-700">Phone: </dt><dd className="inline">{lead.customer_phone}</dd></div>}
              {lead.customer_email && <div><dt className="inline font-medium text-slate-700">Email: </dt><dd className="inline">{lead.customer_email}</dd></div>}
              {lead.service_address && <div><dt className="inline font-medium text-slate-700">Address: </dt><dd className="inline">{lead.service_address}</dd></div>}
              {lead.preferred_timing && <div><dt className="inline font-medium text-slate-700">Preferred time: </dt><dd className="inline">{lead.preferred_timing}</dd></div>}
            </dl>
            <time className="mt-3 block text-xs text-slate-400">Updated {new Date(lead.updated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time>
          </article>)}</div>
          : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No leads captured yet.</p>}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold text-slate-950">Request a handover update</h2><p className="mt-2 text-sm leading-6 text-slate-600">Send a setup change, question, or launch-readiness request to PulseTech.</p><ClientHandoverRequest /></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold text-slate-950">Recent requests</h2>
          {requests.length ? <ul className="mt-4 divide-y divide-slate-100">{requests.map((item) => <li key={item.id} className="py-4"><div className="flex items-start justify-between gap-4"><p className="font-semibold text-slate-900">{item.subject}</p><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">{item.status.replaceAll("_", " ")}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.details}</p><time className="mt-2 block text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time></li>)}</ul> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No requests yet.</p>}
        </section>
      </div>
      {admin && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Invite another client</h2><ClientInviteForm /></section>}
    </>}
  </PortalShell>;
}

function PortalShell({ children, email }: { children: React.ReactNode; email?: string }) {
  return <main className="marketing-shell min-h-screen px-4 py-8 sm:px-8 sm:py-12"><div className="relative z-10 mx-auto max-w-5xl">
    <header className="mb-8 flex items-center justify-between rounded-2xl border border-white/80 bg-white/90 px-5 py-4 shadow-sm"><Link href="/" className="font-bold text-slate-950">PulseTech Labs</Link><div className="flex items-center gap-4">{email && <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>}<ClientSignOutButton /></div></header>
    <div className="space-y-6">{children}</div>
    <footer className="relative z-10 mt-8 text-center text-xs text-slate-500">Need help? <a className="text-blue-700 hover:underline" href="mailto:contact@pulsetechlabs.com">contact@pulsetechlabs.com</a></footer>
  </div></main>;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 break-all font-semibold text-slate-950">{value}</p></div>;
}

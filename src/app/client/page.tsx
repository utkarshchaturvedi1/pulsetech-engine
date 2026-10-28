import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPulseTechAdmin } from "@/lib/clientAccess";
import { loadSharedProfile } from "@/lib/sharedProfileStore";
import ClientHandoverRequest from "./ClientHandoverRequest";
import ClientInviteForm from "./ClientInviteForm";
import ClientSignOutButton from "./ClientSignOutButton";
import ClientLeadTable, { type ClientLead } from "./ClientLeadTable";
import type { BusinessProfile } from "@/types/business";

export const metadata = { title: "Your account | PulseTech Labs" };
export const dynamic = "force-dynamic";

type Account = { id: string; customer_id: string; business_name: string; handover_status: string; demo_id: string };
type HandoverRequest = { id: string; subject: string; details: string; status: string; created_at: string };

const statusLabels: Record<string, string> = {
  invited: "Invitation sent", setup: "Setup in progress", testing: "Testing", approved: "Awaiting launch", live: "Live",
};

export default async function ClientPortalPage() {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return <PortalUnavailable />;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = isPulseTechAdmin(user.email, process.env.PULSETECH_ADMIN_EMAILS);

  const { data: membership, error: membershipError } = await supabase.from("customer_memberships")
    .select("customer_account_id").eq("user_id", user.id).maybeSingle();
  const { data: accountData, error: accountQueryError } = membership
    ? await supabase.from("customer_accounts").select("id,customer_id,business_name,handover_status,demo_id").eq("id", membership.customer_account_id).maybeSingle()
    : { data: null, error: null };
  const accountError = membershipError || accountQueryError;
  const account = accountData as Account | null;
  const [requestResult, savedProfile, leadResult] = account ? await Promise.all([
    supabase.from("handover_requests").select("id,subject,details,status,created_at").eq("customer_account_id", account.id).order("created_at", { ascending: false }).limit(20),
    loadSharedProfile(account.demo_id),
    account.handover_status === "live"
      ? supabase.from("customer_leads").select("id,customer_name,customer_phone,customer_email,service_address,primary_need,preferred_timing,urgency,sales_outcome,sale_amount_usd,first_captured_at").eq("customer_account_id", account.id).order("first_captured_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as ClientLead[], error: null }),
  ]) : [{ data: [] as HandoverRequest[] }, null, { data: [] as ClientLead[], error: null }];
  const requests = (requestResult.data || []) as HandoverRequest[];
  const profile = savedProfile?.profile as BusinessProfile | undefined;
  const leads = (leadResult.data || []) as ClientLead[];

  return <PortalShell email={user.email || ""} showLeads={account?.handover_status === "live"}>
    {accountError ? <MessagePanel title="We’re finishing your account setup">Your client account database setup needs attention. Please contact PulseTech and we’ll help.</MessagePanel> : !account ? <section className="rounded-2xl border border-slate-200 bg-white p-7">
      <h1 className="text-2xl font-semibold text-slate-950">No client account is connected</h1>
      <p className="mt-2 text-slate-600">This sign-in email is not linked to a PulseTech client account yet.</p>
      {admin && <div className="mt-7 border-t border-slate-200 pt-6"><h2 className="text-lg font-semibold">Invite a client</h2><p className="mt-1 text-sm text-slate-600">Connect an existing saved business profile to a client login.</p><ClientInviteForm /></div>}
    </section> : account.handover_status === "live" ? <LiveDashboard account={account} profile={profile} requests={requests} leads={leads} leadTableReady={!leadResult.error} /> : <PreLaunchDashboard account={account} profile={profile} requests={requests} />}
    <PlanPricingSection />
    {admin && account && <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Invite another client</h2><ClientInviteForm /></section>}
  </PortalShell>;
}

function PreLaunchDashboard({ account, profile, requests }: { account: Account; profile?: BusinessProfile; requests: HandoverRequest[] }) {
  const demoUrl = `/demo/${encodeURIComponent(account.demo_id)}`;
  const stage = statusLabels[account.handover_status] || "Setup in progress";
  return <>
    <section id="overview" className="space-y-2">
      <StatusPill label={stage} tone="blue" />
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Let’s get your assistant ready</h1>
      <p className="text-slate-600">Your account setup is being prepared with PulseTech. You can test the assistant if you wish; testing is optional.</p>
    </section>
    <section id="assistant" className="grid gap-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Optional</p><h2 className="mt-2 text-2xl font-semibold text-slate-950">Try your assistant</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Test the chat or phone experience whenever you like. PulseTech will complete the launch checks and send your installation instructions.</p></div>
      <Link href={demoUrl} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">Try the demo</Link>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-label="Setup progress">
      <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ProgressStep number="1" title="Payment" state="For initial clients, receipt is confirmed by email with PulseTech." active />
        <ProgressStep number="2" title="Business details" state={profile ? "Saved from your demo" : "Being prepared"} active />
        <ProgressStep number="3" title="PulseTech launch checks" state={account.handover_status === "testing" ? "In progress" : "Handled by PulseTech"} active={account.handover_status === "testing"} />
        <ProgressStep number="4" title="Install and go live" state={account.handover_status === "approved" ? "Ready to arrange" : "Instructions sent after checks"} />
      </ol>
    </section>
    <div className="grid gap-5 md:grid-cols-2">
      <BusinessCard profile={profile} demoUrl={demoUrl} />
      <section id="installation" className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Website installation</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Installation is coordinated with PulseTech. We’ll provide and verify the website-specific install steps with you.</p>
        <Link href="#support" className="mt-5 inline-flex rounded-lg border border-blue-700 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">Ask about installation</Link>
      </section>
    </div>
    <RequestsAndSupport requests={requests} />
  </>;
}

function LiveDashboard({ account, profile, requests, leads, leadTableReady }: { account: Account; profile?: BusinessProfile; requests: HandoverRequest[]; leads: ClientLead[]; leadTableReady: boolean }) {
  const alerts = [profile?.leadNotificationEmail, profile?.leadNotificationPhone].filter(Boolean);
  return <>
    <section id="overview" className="space-y-2">
      <StatusPill label="Live" tone="green" />
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Your assistant is live</h1>
      <p className="text-slate-600">{account.business_name}</p>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Leads captured" value={leadTableReady ? String(leads.length) : "—"} note={leadTableReady ? "Recent enquiries saved in your account." : "Lead list setup is pending."} />
      <SummaryCard label="Website chat" value="Live" note="Included in your AI Sales Employee service." green />
      <SummaryCard label="Inbound phone" value="Live" note="Inbound calls only." green />
      <SummaryCard label="Lead alerts" value={alerts.length ? "Recipients saved" : "Check setup"} note={alerts.join(" · ") || "Confirm recipients with PulseTech."} green={alerts.length > 0} />
    </section>
    <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
      <section id="leads" className="min-h-72 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-slate-950">Recent leads</h2><span className="text-sm text-slate-500">Customer enquiries</span></div>
        {leadTableReady ? <ClientLeadTable initialLeads={leads} /> : <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Lead history is waiting for the V1.2 Supabase lead migration. Your configured email and SMS alerts continue to operate.</div>}
      </section>
      <div className="space-y-5">
        <section id="assistant" className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Business instructions</h2><p className="mt-2 text-sm leading-6 text-slate-600">Update services, hours, pricing, policies, and other business instructions through Peter.</p><Link href={`/demo/${encodeURIComponent(account.demo_id)}`} className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Review with Peter</Link></section>
        <section id="installation" className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Website installation</h2><p className="mt-2 text-sm text-slate-600">Current handover stage: <span className="font-medium text-green-700">Live</span></p><p className="mt-1 text-sm text-slate-600">Need an install change? Send a support request.</p><Link href="#support" className="mt-4 inline-flex rounded-lg border border-blue-700 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">Installation help</Link></section>
      </div>
    </div>
    <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Weekly report</h2><p className="mt-2 text-sm text-slate-600">Weekly analytics are not available in this portal yet. Your lead alerts remain available by email and SMS.</p></section>
    <RequestsAndSupport requests={requests} />
  </>;
}

function BusinessCard({ profile, demoUrl }: { profile?: BusinessProfile; demoUrl: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-950">Your business information</h2><p className="mt-1 text-sm text-slate-600">Review what your assistant knows.</p></div><Link href={demoUrl} className="shrink-0 text-sm font-semibold text-blue-700 hover:underline">Review with Peter</Link></div>
    {profile ? <dl className="mt-5 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
      <ProfileItem label="Website" value={profile.website} /><ProfileItem label="Business phone" value={profile.phone} /><ProfileItem label="Business email" value={profile.email} /><ProfileItem label="Business hours" value={profile.businessHours} /><ProfileItem label="Services" value={profile.services?.slice(0, 4).join(", ")} /><ProfileItem label="Service areas" value={profile.serviceAreas?.slice(0, 4).join(", ")} /><ProfileItem label="Prices and visit fees" value={profile.pricingRules} />
    </dl> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Business details are temporarily unavailable. Use Peter to review them or contact support.</p>}
  </section>;
}

function RequestsAndSupport({ requests }: { requests: HandoverRequest[] }) {
  return <section id="support" className="grid gap-5 lg:grid-cols-2">
    <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Need help?</h2><p className="mt-1 text-sm text-slate-600">Send a setup change, question, or support request to PulseTech.</p><ClientHandoverRequest /></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Recent support requests</h2>{requests.length ? <ul className="mt-3 divide-y divide-slate-100">{requests.map((item) => <li key={item.id} className="py-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{item.subject}</p><StatusPill label={item.status.replaceAll("_", " ")} tone={item.status === "resolved" ? "green" : "blue"} /></div><p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.details}</p><time className="mt-1 block text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No support requests yet.</p>}</div>
  </section>;
}

function PlanPricingSection() {
  return <section id="plan" className="rounded-2xl border border-blue-100 bg-white p-6 sm:p-8">
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Plan & billing</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">Clear pricing, with the service included</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These are the total plan prices. Hosting, platform tools, upkeep, and routine agent updates are included in the monthly service; they are not extra line-item charges.</p>
    </div>
    <div className="grid gap-5 md:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">One-time setup</p>
        <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950">$2,000</p>
        <p className="mt-1 text-sm text-slate-600">Charged once.</p>
        <p className="mt-4 text-sm leading-6 text-slate-700">Configuration of an AI Sales Employee around your business, including your services, policies, operating details, and instructions.</p>
      </article>
      <article className="rounded-2xl border-2 border-blue-600 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Monthly service</p>
        <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950">$500 <span className="text-lg font-medium text-slate-600">/ month</span></p>
        <p className="mt-1 text-sm text-slate-600">Ongoing service and support.</p>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
          <li>Website chat and inbound voice AI Sales Employees</li>
          <li>Client dashboard lead list with captured details and timestamps, editable conversion status, and job value</li>
          <li>Hosting, AI processing, and the tools needed to run the service</li>
          <li>System upkeep, monitoring, and maintenance</li>
          <li>Routine agent improvements and standard platform updates are included, with no separate update fee</li>
          <li>Business knowledge updates through Peter</li>
          <li>Email and SMS lead alerts, plus email support</li>
        </ul>
      </article>
    </div>
    <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-slate-700"><strong>Monthly usage included:</strong> up to 1,000 website chat conversations and 250 inbound voice minutes per billing month. The service is not unlimited. Any additional usage or charge must be agreed with you in writing first.</p>
    <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-slate-700">Optional add-ons or custom integrations, such as future calendar management, are not included unless we confirm the scope and price with you. We will get your approval before adding any charge.</p>
  </section>;
}

function PortalShell({ children, email, showLeads = false }: { children: React.ReactNode; email?: string; showLeads?: boolean }) {
  return <main className="min-h-screen bg-[#f5f5f7] px-4 text-[#111217] sm:px-6">
    <header className="-mx-4 border-b border-black/10 bg-[#f5f5f7]/95 px-4 sm:-mx-6 sm:px-6">
      <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center justify-between gap-4 py-3">
        <Link href="/client" aria-label="PulseTech account overview"><Image src="/branding/pulsetech-logo-blue-black.svg" alt="PulseTech Labs" width={190} height={38} priority /></Link>
        <nav aria-label="Client account" className="order-3 flex w-full gap-5 overflow-x-auto text-sm font-medium text-slate-700 sm:order-2 sm:w-auto sm:gap-7"><a href="#overview" className="py-2 hover:text-blue-700">Overview</a><a href="#assistant" className="py-2 hover:text-blue-700">Assistant</a>{showLeads && <a href="#leads" className="py-2 hover:text-blue-700">Leads</a>}<a href="#installation" className="py-2 hover:text-blue-700">Installation</a><a href="#support" className="py-2 hover:text-blue-700">Support</a><a href="#plan" className="py-2 hover:text-blue-700">Pricing</a></nav>
        <div className="order-2 flex items-center gap-3 sm:order-3">{email && <span className="hidden max-w-48 truncate text-sm text-slate-500 md:inline">{email}</span>}<ClientSignOutButton /></div>
      </div>
    </header>
    <div className="mx-auto max-w-7xl space-y-6 py-8 sm:py-10">{children}</div>
  </main>;
}

function StatusPill({ label, tone }: { label: string; tone: "blue" | "green" }) {
  const classes = tone === "green" ? "bg-green-50 text-green-800" : "bg-blue-50 text-blue-800";
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${classes}`}><span className={`h-2 w-2 rounded-full ${tone === "green" ? "bg-green-600" : "bg-blue-600"}`} />{label}</span>;
}

function SummaryCard({ label, value, note, green = false }: { label: string; value: string; note: string; green?: boolean }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-medium text-slate-600">{label}</p><p className={`mt-2 text-xl font-semibold ${green ? "text-green-700" : "text-slate-950"}`}>{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{note}</p></section>;
}

function ProgressStep({ number, title, state, active = false }: { number: string; title: string; state: string; active?: boolean }) {
  return <li className="flex items-start gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}>{number}</span><div><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{state}</p></div></li>;
}

function ProfileItem({ label, value }: { label: string; value?: string | string[] | null }) {
  const display = Array.isArray(value) ? value.join(", ") : value;
  return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900">{display?.trim() || "Not provided"}</dd></div>;
}

function MessagePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-xl font-semibold text-slate-950">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{children}</p></section>;
}

function PortalUnavailable() {
  return <main className="min-h-screen bg-[#f5f5f7] px-4">
    <header className="mx-auto flex min-h-[76px] max-w-6xl items-center justify-between border-b border-black/10">
      <Link href="/" aria-label="PulseTech Labs home"><Image src="/branding/pulsetech-logo-blue-black.svg" alt="PulseTech Labs" width={190} height={38} priority /></Link>
      <Link href="/login" className="text-sm font-semibold text-blue-700 hover:text-blue-800">Back to log in</Link>
    </header>
    <section className="mx-auto flex min-h-[65vh] max-w-lg items-center justify-center py-12">
      <div className="w-full rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-xl font-semibold text-blue-700" aria-hidden="true">P</div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">Client account unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">We couldn’t connect to the account service. Please try again later or return to the login page.</p>
        <Link href="/login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#111217] px-5 font-semibold text-white transition hover:bg-[#246bfe] focus:outline-none focus:ring-4 focus:ring-lime-200">Return to log in</Link>
      </div>
    </section>
  </main>;
}
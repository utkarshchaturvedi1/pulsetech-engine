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
    {accountError ? <MessagePanel title="We’re finishing your account setup">Your client account database setup needs attention. Please contact PulseTech and we’ll help.</MessagePanel> : !account ? <section className="rounded-[22px] border border-[#d9e7f6] bg-white shadow-[0_15px_38px_rgba(35,83,139,.06)] p-7">
      <h1 className="text-2xl font-semibold text-slate-950">No client account is connected</h1>
      <p className="mt-2 text-slate-600">This sign-in email is not linked to a PulseTech client account yet.</p>
      {admin && <div className="mt-7 border-t border-slate-200 pt-6"><h2 className="text-lg font-semibold">Invite a client</h2><p className="mt-1 text-sm text-slate-600">Connect an existing saved business profile to a client login.</p><ClientInviteForm /></div>}
    </section> : account.handover_status === "live" ? <LiveDashboard account={account} profile={profile} requests={requests} leads={leads} leadTableReady={!leadResult.error} /> : <PreLaunchDashboard account={account} profile={profile} requests={requests} />}
    {admin && account && <section className="rounded-[22px] border border-[#d9e7f6] bg-white shadow-[0_15px_38px_rgba(35,83,139,.06)] p-6"><h2 className="text-lg font-semibold">Invite another client</h2><ClientInviteForm /></section>}
  </PortalShell>;
}

function PreLaunchDashboard({ account, profile, requests }: { account: Account; profile?: BusinessProfile; requests: HandoverRequest[] }) {
  const demoUrl = `/demo/${encodeURIComponent(account.demo_id)}`;
  const stage = statusLabels[account.handover_status] || "Setup in progress";
  return <>
    <section id="overview" className="relative overflow-hidden rounded-[26px] bg-[#060a18] px-6 py-8 text-white shadow-[0_24px_70px_rgba(22,63,112,.16)] sm:px-9 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_78%_45%,rgba(49,95,255,.40),transparent_42%),radial-gradient(ellipse_at_22%_100%,rgba(125,65,255,.20),transparent_42%),linear-gradient(118deg,#040714_0%,#07112a_55%,#09183c_100%)]" />
      <div className="relative"><StatusPill label={stage} tone="blue" />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Let’s get your assistant ready</h1>
      <p className="mt-3 text-[#c5d0e5]">Your account setup is being prepared with PulseTech. You can test the assistant if you wish; testing is optional.</p></div>
    </section>
    <section id="assistant" className="grid gap-6 rounded-[22px] border border-[#d9e7f6] bg-gradient-to-br from-white to-[#f2f7ff] p-6 shadow-[0_15px_40px_rgba(32,76,130,.07)] md:grid-cols-[1fr_auto] md:items-center md:p-8">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Optional</p><h2 className="mt-2 text-2xl font-semibold text-slate-950">Try your assistant</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Test the chat or phone experience whenever you like. PulseTech will complete the launch checks and send your installation instructions.</p></div>
      <Link href={demoUrl} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-r from-[#159dff] via-[#346ff7] to-[#8a4df0] px-6 py-3 font-extrabold text-white shadow-[0_8px_20px_rgba(55,83,235,.2)] hover:brightness-105">Try the demo</Link>
    </section>
    <section className="rounded-[22px] border border-[#d9e7f6] bg-white p-5 shadow-[0_15px_38px_rgba(35,83,139,.06)] sm:p-6" aria-label="Setup progress">
      <ol className="grid gap-4 md:grid-cols-3">
        <ProgressStep number="1" title="Business details" state={profile ? "Saved from your demo" : "Being prepared"} active />
        <ProgressStep number="2" title="PulseTech launch checks" state={account.handover_status === "testing" ? "In progress" : "Handled by PulseTech"} active={account.handover_status === "testing"} />
        <ProgressStep number="3" title="Install and go live" state={account.handover_status === "approved" ? "Ready to arrange" : "Instructions sent after checks"} />
      </ol>
    </section>
    <div className="grid gap-5 md:grid-cols-2">
      <BusinessCard profile={profile} demoUrl={demoUrl} />
      <section id="installation" className="rounded-[22px] border border-[#d9e7f6] bg-white p-6 shadow-[0_15px_38px_rgba(35,83,139,.06)]">
        <h2 className="text-lg font-semibold text-slate-950">Website installation</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Installation is coordinated with PulseTech. We’ll provide and verify the website-specific install steps with you.</p>
        <Link href="#support" className="mt-5 inline-flex rounded-lg border border-[#b8d4f2] px-4 py-2.5 text-sm font-bold text-[#176ff2] hover:bg-[#f6faff]">Ask about installation</Link>
      </section>
    </div>
    <RequestsAndSupport requests={requests} />
  </>;
}

function LiveDashboard({ account, profile, requests, leads, leadTableReady }: { account: Account; profile?: BusinessProfile; requests: HandoverRequest[]; leads: ClientLead[]; leadTableReady: boolean }) {
  const alerts = [profile?.leadNotificationEmail, profile?.leadNotificationPhone].filter(Boolean);
  return <>
    <section id="overview" className="relative overflow-hidden rounded-[26px] bg-[#060a18] px-6 py-8 text-white shadow-[0_24px_70px_rgba(22,63,112,.16)] sm:px-9 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_78%_45%,rgba(49,95,255,.40),transparent_42%),radial-gradient(ellipse_at_22%_100%,rgba(125,65,255,.20),transparent_42%),linear-gradient(118deg,#040714_0%,#07112a_55%,#09183c_100%)]" />
      <div className="relative"><StatusPill label="Live" tone="green" />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Your assistant is live</h1>
      <p className="mt-3 text-[#c5d0e5]">{account.business_name}</p></div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Leads captured" value={leadTableReady ? String(leads.length) : "—"} note={leadTableReady ? "Recent enquiries saved in your account." : "Lead list setup is pending."} />
      <SummaryCard label="Website chat" value="Live" note="Included in your AI Sales Employee service." green />
      <SummaryCard label="Inbound phone" value="Live" note="Inbound calls only." green />
      <SummaryCard label="Lead alerts" value={alerts.length ? "Recipients saved" : "Check setup"} note={alerts.join(" · ") || "Confirm recipients with PulseTech."} green={alerts.length > 0} />
    </section>
    <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
      <section id="leads" className="min-h-72 rounded-[22px] border border-[#d9e7f6] bg-white p-5 shadow-[0_15px_38px_rgba(35,83,139,.06)] sm:p-7">
        <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-slate-950">Recent leads</h2><span className="text-sm text-slate-500">Customer enquiries</span></div>
        {leadTableReady ? <ClientLeadTable initialLeads={leads} /> : <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Lead history is waiting for the V1.2 Supabase lead migration. Your configured email and SMS alerts continue to operate.</div>}
      </section>
      <div className="space-y-5">
        <section id="assistant" className="rounded-[22px] border border-[#d9e7f6] bg-white p-6 shadow-[0_15px_38px_rgba(35,83,139,.06)]"><h2 className="text-lg font-extrabold text-[#071d36]">Business instructions</h2><p className="mt-2 text-sm leading-6 text-[#5d6c7d]">Update services, hours, pricing, policies, and other business instructions through Peter.</p><Link href={`/demo/${encodeURIComponent(account.demo_id)}`} className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-[#159dff] via-[#346ff7] to-[#8a4df0] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(55,83,235,.2)] hover:brightness-105">Review with Peter</Link></section>
        <section id="installation" className="rounded-[22px] border border-[#d9e7f6] bg-white p-6 shadow-[0_15px_38px_rgba(35,83,139,.06)]"><h2 className="text-lg font-extrabold text-[#071d36]">Website installation</h2><p className="mt-2 text-sm text-[#5d6c7d]">Current handover stage: <span className="font-bold text-green-700">Live</span></p><p className="mt-1 text-sm text-[#5d6c7d]">Need an install change? Send a support request.</p><Link href="#support" className="mt-4 inline-flex rounded-lg border border-[#b8d4f2] px-4 py-2.5 text-sm font-bold text-[#176ff2] hover:bg-[#f6faff]">Installation help</Link></section>
      </div>
    </div>
    <section className="rounded-[22px] border border-[#d9e7f6] bg-white p-6 shadow-[0_15px_38px_rgba(35,83,139,.06)]"><h2 className="text-lg font-extrabold text-[#071d36]">Weekly report</h2><p className="mt-2 text-sm text-[#5d6c7d]">Weekly analytics are not available in this portal yet. Your lead alerts remain available by email and SMS.</p></section>
    <RequestsAndSupport requests={requests} />
  </>;
}

function BusinessCard({ profile, demoUrl }: { profile?: BusinessProfile; demoUrl: string }) {
  return <section className="rounded-[22px] border border-[#d9e7f6] bg-white shadow-[0_15px_38px_rgba(35,83,139,.06)] p-6">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-950">Your business information</h2><p className="mt-1 text-sm text-slate-600">Review what your assistant knows.</p></div><Link href={demoUrl} className="shrink-0 text-sm font-semibold text-blue-700 hover:underline">Review with Peter</Link></div>
    {profile ? <dl className="mt-5 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
      <ProfileItem label="Website" value={profile.website} /><ProfileItem label="Business phone" value={profile.phone} /><ProfileItem label="Business email" value={profile.email} /><ProfileItem label="Business hours" value={profile.businessHours} /><ProfileItem label="Services" value={profile.services?.slice(0, 4).join(", ")} /><ProfileItem label="Service areas" value={profile.serviceAreas?.slice(0, 4).join(", ")} /><ProfileItem label="Prices and visit fees" value={profile.pricingRules} />
    </dl> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Business details are temporarily unavailable. Use Peter to review them or contact support.</p>}
  </section>;
}

function RequestsAndSupport({ requests }: { requests: HandoverRequest[] }) {
  return <section id="support" className="grid gap-5 lg:grid-cols-2">
    <div className="rounded-[22px] border border-[#d9e7f6] bg-white shadow-[0_15px_38px_rgba(35,83,139,.06)] p-6"><h2 className="text-lg font-semibold text-slate-950">Need help?</h2><p className="mt-1 text-sm text-slate-600">Send a setup change, question, or support request to PulseTech.</p><ClientHandoverRequest /></div>
    <div className="rounded-[22px] border border-[#d9e7f6] bg-white shadow-[0_15px_38px_rgba(35,83,139,.06)] p-6"><h2 className="text-lg font-semibold text-slate-950">Recent support requests</h2>{requests.length ? <ul className="mt-3 divide-y divide-slate-100">{requests.map((item) => <li key={item.id} className="py-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{item.subject}</p><StatusPill label={item.status.replaceAll("_", " ")} tone={item.status === "resolved" ? "green" : "blue"} /></div><p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.details}</p><time className="mt-1 block text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No support requests yet.</p>}</div>
  </section>;
}

function PortalShell({ children, email, showLeads = false }: { children: React.ReactNode; email?: string; showLeads?: boolean }) {
  return <main className="min-h-screen bg-white px-4 text-[#071d36] sm:px-6">
    <header className="sticky top-0 z-20 -mx-4 border-b border-[#dce7f4] bg-white/95 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="mx-auto flex min-h-[72px] max-w-[1180px] flex-wrap items-center justify-between gap-4 py-3">
        <Link href="/client" aria-label="PulseTech account overview"><Image src="/branding/pulsetech-logo-color.svg" alt="PulseTech Labs" width={168} height={42} priority /></Link>
        <nav aria-label="Client account" className="order-3 flex w-full gap-5 overflow-x-auto text-sm font-bold text-[#4b5d70] sm:order-2 sm:w-auto sm:gap-7"><a href="#overview" className="py-2 hover:text-blue-700">Overview</a><a href="#assistant" className="py-2 hover:text-blue-700">Assistant</a>{showLeads && <a href="#leads" className="py-2 hover:text-blue-700">Leads</a>}<a href="#installation" className="py-2 hover:text-blue-700">Installation</a><a href="#support" className="py-2 hover:text-blue-700">Support</a></nav>
        <div className="order-2 flex items-center gap-3 sm:order-3">{email && <span className="hidden max-w-48 truncate text-sm text-slate-500 md:inline">{email}</span>}<ClientSignOutButton /></div>
      </div>
    </header>
    <div className="mx-auto max-w-[1180px] space-y-7 py-7 sm:py-9">{children}</div>
  </main>;
}

function StatusPill({ label, tone }: { label: string; tone: "blue" | "green" }) {
  const classes = tone === "green" ? "bg-green-50 text-green-800" : "bg-blue-50 text-blue-800";
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${classes}`}><span className={`h-2 w-2 rounded-full ${tone === "green" ? "bg-green-600" : "bg-blue-600"}`} />{label}</span>;
}

function SummaryCard({ label, value, note, green = false }: { label: string; value: string; note: string; green?: boolean }) {
  return <section className="rounded-[20px] border border-[#d9e7f6] bg-white p-5 shadow-[0_12px_30px_rgba(28,77,136,.07)]"><p className="text-sm font-bold text-[#66778b]">{label}</p><p className={`mt-2 text-xl font-extrabold ${green ? "text-[#14804a]" : "text-[#071d36]"}`}>{value}</p><p className="mt-2 text-xs leading-5 text-[#75869a]">{note}</p></section>;
}

function ProgressStep({ number, title, state, active = false }: { number: string; title: string; state: string; active?: boolean }) {
  return <li className="flex items-start gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}>{number}</span><div><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{state}</p></div></li>;
}

function ProfileItem({ label, value }: { label: string; value?: string | string[] | null }) {
  const display = Array.isArray(value) ? value.join(", ") : value;
  return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900">{display?.trim() || "Not provided"}</dd></div>;
}

function MessagePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[22px] border border-[#d9e7f6] bg-white shadow-[0_15px_38px_rgba(35,83,139,.06)] p-6"><h1 className="text-xl font-semibold text-slate-950">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{children}</p></section>;
}

function PortalUnavailable() {
  return <main className="min-h-screen bg-white px-4">
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

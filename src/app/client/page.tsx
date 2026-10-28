import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPulseTechAdmin } from "@/lib/clientAccess";
import { loadSharedProfile } from "@/lib/sharedProfileStore";
import "./portal-theme.css";
import ClientInviteForm from "./ClientInviteForm";
import ClientSignOutButton from "./ClientSignOutButton";
import ClientLeadTable, { type ClientLead } from "./ClientLeadTable";
import type { BusinessProfile } from "@/types/business";

export const metadata = { title: "Your account | PulseTech Labs" };
export const dynamic = "force-dynamic";

type Account = { id: string; customer_id: string; business_name: string; handover_status: string; demo_id: string };

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
  const [savedProfile, leadResult] = account ? await Promise.all([
    loadSharedProfile(account.demo_id),
    account.handover_status === "live"
      ? supabase.from("customer_leads").select("id,customer_name,customer_phone,customer_email,service_address,primary_need,preferred_timing,urgency,sales_outcome,sale_amount_usd,first_captured_at").eq("customer_account_id", account.id).order("first_captured_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as ClientLead[], error: null }),
  ]) : [null, { data: [] as ClientLead[], error: null }];
  const profile = savedProfile?.profile as BusinessProfile | undefined;
  const leads = (leadResult.data || []) as ClientLead[];

  return <PortalShell email={user.email || ""} showLeads={account?.handover_status === "live"}>
    {accountError ? <MessagePanel title="We’re finishing your account setup">Your client account database setup needs attention. Please contact PulseTech and we’ll help.</MessagePanel> : !account ? <section className="pt-portal-card rounded-[22px] border p-7">
      <h1 className="text-2xl font-semibold text-slate-950">No client account is connected</h1>
      <p className="mt-2 text-slate-600">This sign-in email is not linked to a PulseTech client account yet.</p>
      {admin && <div className="mt-7 border-t border-slate-200 pt-6"><h2 className="text-lg font-semibold">Invite a client</h2><p className="mt-1 text-sm text-slate-600">Connect an existing saved business profile to a client login.</p><ClientInviteForm /></div>}
    </section> : account.handover_status === "live" ? <LiveDashboard account={account} profile={profile} leads={leads} leadTableReady={!leadResult.error} /> : <PreLaunchDashboard account={account} profile={profile} />}
    <PlanPricingSection />
    {admin && account && <section className="pt-portal-card rounded-[22px] border p-6"><h2 className="text-lg font-semibold">Invite another client</h2><ClientInviteForm /></section>}
  </PortalShell>;
}

function PreLaunchDashboard({ account, profile }: { account: Account; profile?: BusinessProfile }) {
  const demoUrl = `/demo/${encodeURIComponent(account.demo_id)}`;
  const stage = statusLabels[account.handover_status] || "Setup in progress";
  return <>
    <section id="overview" className="pt-portal-hero relative overflow-hidden rounded-[30px] px-6 py-8 text-white sm:px-9 sm:py-10">
      <div className="relative"><StatusPill label={stage} tone="blue" />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Let’s get your assistant ready</h1>
      <p className="mt-3 text-[#c5d0e5]">Your account setup is being prepared with PulseTech. You can test the assistant if you wish; testing is optional.</p></div>
    </section>
    <section id="assistant" className="pt-portal-card grid gap-6 rounded-[26px] border p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Optional</p><h2 className="mt-2 text-2xl font-semibold text-slate-950">Try your assistant</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Test the chat or phone experience whenever you like. PulseTech will complete the launch checks and send your installation instructions.</p></div>
      <Link href={demoUrl} className="pt-portal-button inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 font-extrabold">Try the demo</Link>
    </section>
    <section className="pt-portal-card rounded-[26px] border p-5 sm:p-6" aria-label="Setup progress">
      <h2 className="mb-5 text-xl font-extrabold text-slate-950">Setup progress</h2>
      <ol className="grid gap-4 md:grid-cols-4">
        <ProgressStep number="1" title="Business details" state={profile ? "Saved from your demo" : "Being prepared"} active />
        <ProgressStep number="2" title="Payment" state="PulseTech confirms payment before launch checks" active={false} />
        <ProgressStep number="3" title="PulseTech launch checks" state={account.handover_status === "testing" ? "In progress" : "Handled by PulseTech"} active={account.handover_status === "testing"} />
        <ProgressStep number="4" title="Install and go live" state={account.handover_status === "approved" ? "Ready to arrange" : "Instructions sent after checks"} />
      </ol>
    </section>
    <div className="grid gap-5 md:grid-cols-2">
      <BusinessCard profile={profile} demoUrl={demoUrl} />
      <section id="installation" className="pt-portal-card rounded-[26px] border p-6">
        <h2 className="text-lg font-semibold text-slate-950">Website installation</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Installation is coordinated with PulseTech. We’ll provide and verify the website-specific install steps with you.</p>
        <a href="mailto:contact@pulsetechlabs.com?subject=Website%20installation" className="pt-portal-secondary mt-5 inline-flex rounded-full border px-4 py-2.5 text-sm font-bold">Email about installation</a>
      </section>
    </div>
    <SupportContact />
  </>;
}

function LiveDashboard({ account, profile, leads, leadTableReady }: { account: Account; profile?: BusinessProfile; leads: ClientLead[]; leadTableReady: boolean }) {
  const alerts = [profile?.leadNotificationEmail, profile?.leadNotificationPhone].filter(Boolean);
  return <>
    <section id="overview" className="pt-portal-hero relative overflow-hidden rounded-[30px] px-6 py-8 text-white sm:px-9 sm:py-10">
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
      <section id="leads" className="pt-portal-card min-h-72 rounded-[26px] border p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-slate-950">Recent leads</h2><span className="text-sm text-slate-500">Customer enquiries</span></div>
        {leadTableReady ? <ClientLeadTable initialLeads={leads} /> : <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Lead history is waiting for the V1.2 Supabase lead migration. Your configured email and SMS alerts continue to operate.</div>}
      </section>
      <div className="space-y-5">
        <section id="assistant" className="pt-portal-card rounded-[26px] border p-6"><h2 className="text-lg font-extrabold text-[#071d36]">Business instructions</h2><p className="mt-2 text-sm leading-6 text-[#5d6c7d]">Update services, hours, pricing, policies, and other business instructions through Peter. Peter confirms updates in chat after saving.</p><Link href={`/demo/${encodeURIComponent(account.demo_id)}`} className="pt-portal-button mt-4 inline-flex rounded-full px-5 py-2.5 text-sm font-extrabold">Review with Peter</Link></section>
      </div>
    </div>
    <section className="pt-portal-card rounded-[26px] border p-6"><h2 className="text-lg font-extrabold text-[#071d36]">Weekly report</h2><p className="mt-2 text-sm text-[#5d6c7d]">Weekly analytics are not available in this portal yet. Your lead alerts remain available by email and SMS.</p></section>
    <SupportContact />
  </>;
}

function BusinessCard({ profile, demoUrl }: { profile?: BusinessProfile; demoUrl: string }) {
  return <section className="pt-portal-card rounded-[26px] border p-6">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-950">Your business information</h2><p className="mt-1 text-sm text-slate-600">Review what your assistant knows.</p></div><Link href={demoUrl} className="shrink-0 text-sm font-semibold text-blue-700 hover:underline">Review with Peter</Link></div>
    {profile ? <dl className="mt-5 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
      <ProfileItem label="Website" value={profile.website} /><ProfileItem label="Business phone" value={profile.phone} /><ProfileItem label="Business email" value={profile.email} /><ProfileItem label="Business hours" value={profile.businessHours} /><ProfileItem label="Services" value={profile.services?.slice(0, 4).join(", ")} /><ProfileItem label="Service areas" value={profile.serviceAreas?.slice(0, 4).join(", ")} /><ProfileItem label="Prices and visit fees" value={profile.pricingRules} />
    </dl> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Business details are temporarily unavailable. Use Peter to review them or contact support.</p>}
  </section>;
}

function SupportContact() {
  return <section id="support" className="pt-portal-support rounded-[26px] p-6 sm:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#c9ff55]">Need a hand?</p><h2 className="mt-2 text-xl font-extrabold text-white">Email PulseTech support</h2><p className="mt-2 text-sm text-white/70">For account or technical help, contact us directly. For business information updates, use Peter.</p></div><a className="pt-portal-button inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-5 py-3 text-sm font-extrabold" href="mailto:contact@pulsetechlabs.com?subject=PulseTech%20client%20support">Contact support ↗</a></div></section>;
}

function PlanPricingSection() {
  return <section id="plan" className="pt-portal-card scroll-mt-24 rounded-[26px] border p-6 sm:p-8">
    <div className="mb-6">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Plan &amp; billing</p>
      <h2 className="mt-2 text-2xl font-extrabold text-slate-950">Clear pricing, with the service included</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">The monthly price includes hosting, connected tools, upkeep, and routine agent improvements. These are included in the price, not separate line items.</p>
    </div>
    <div className="grid gap-5 md:grid-cols-2">
      <article className="rounded-[22px] border border-[#d9e7f6] bg-[#f7faff] p-6">
        <p className="text-sm font-bold uppercase tracking-wide text-blue-700">One-time business-specific setup</p>
        <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">$2,000</p>
        <p className="mt-1 text-sm text-slate-600">Charged once.</p>
        <p className="mt-4 text-sm leading-6 text-slate-700">Configuration of an AI Sales Employee around your business, services, policies, operating details, and instructions.</p>
      </article>
      <article className="rounded-[22px] border-2 border-blue-600 bg-white p-6">
        <p className="text-sm font-bold uppercase tracking-wide text-blue-700">Monthly service</p>
        <p className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">$500 <span className="text-lg font-semibold text-slate-600">/ month</span></p>
        <p className="mt-1 text-sm text-slate-600">Continues month to month until canceled.</p>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
          <li>Website chat and inbound voice AI Sales Employees</li>
          <li>Client dashboard lead list with timestamps, conversion status, and job value</li>
          <li>Hosting, AI processing, system upkeep, and connected tools</li>
          <li>Business knowledge updates through Peter</li>
          <li>Lead alerts by email and SMS, plus email support</li>
          <li>Routine agent improvements and standard platform updates, with no separate update fee</li>
        </ul>
      </article>
    </div>
    <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-slate-700"><strong>Monthly usage included:</strong> up to 1,000 website chat conversations and 250 inbound voice minutes per billing month. Additional usage or charges require your written agreement first.</p>
    <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-slate-700">Future add-ons such as calendar management are not included unless we agree on scope and price first. You will approve any additional charge before it is added.</p>
    <p className="mt-5 text-sm text-slate-600">Questions about billing or cancellation? <a className="font-semibold text-blue-700 underline" href="mailto:contact@pulsetechlabs.com?subject=PulseTech%20billing">Contact PulseTech support</a>.</p>
  </section>;
}

function PortalShell({ children, email, showLeads = false }: { children: React.ReactNode; email?: string; showLeads?: boolean }) {
  return <main className="pt-client-portal min-h-screen px-4 text-[#111217] sm:px-6">
    <header className="pt-portal-header sticky top-0 z-20 -mx-4 border-b px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="mx-auto flex min-h-[72px] max-w-[1180px] flex-wrap items-center justify-between gap-4 py-3">
        <Link href="/client" aria-label="PulseTech account overview"><Image src="/branding/pulsetech-logo-color.svg" alt="PulseTech Labs" width={168} height={42} priority /></Link>
        <nav aria-label="Client account" className="pt-portal-nav order-3 flex w-full gap-5 overflow-x-auto text-sm font-bold sm:order-2 sm:w-auto sm:gap-7"><a href="#overview" className="py-2">Overview</a><a href="#assistant" className="py-2">Assistant</a>{showLeads && <a href="#leads" className="py-2">Leads</a>}{!showLeads && <a href="#installation" className="py-2">Setup</a>}<a href="#plan" className="py-2">Pricing</a><a href="#support" className="py-2">Support</a></nav>
        <div className="order-2 flex items-center gap-3 sm:order-3">{email && <span className="hidden max-w-48 truncate text-sm text-slate-500 md:inline">{email}</span>}<ClientSignOutButton /></div>
      </div>
    </header>
    <div className="pt-portal-content mx-auto max-w-[1180px] space-y-7 py-7 sm:py-9">{children}</div>
  </main>;
}

function StatusPill({ label, tone }: { label: string; tone: "blue" | "green" }) {
  const classes = tone === "green" ? "bg-green-50 text-green-800" : "bg-blue-50 text-blue-800";
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${classes}`}><span className={`h-2 w-2 rounded-full ${tone === "green" ? "bg-green-600" : "bg-blue-600"}`} />{label}</span>;
}

function SummaryCard({ label, value, note, green = false }: { label: string; value: string; note: string; green?: boolean }) {
  return <section className="pt-portal-card rounded-[22px] border p-5"><p className="text-sm font-bold text-[#66778b]">{label}</p><p className={`mt-2 text-xl font-extrabold ${green ? "text-[#14804a]" : "text-[#071d36]"}`}>{value}</p><p className="mt-2 text-xs leading-5 text-[#75869a]">{note}</p></section>;
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
  return <main className="pt-client-portal min-h-screen px-4">
    <header className="mx-auto flex min-h-[76px] max-w-6xl items-center justify-between border-b border-black/10">
      <Link href="/" aria-label="PulseTech Labs home"><Image src="/branding/pulsetech-logo-blue-black.svg" alt="PulseTech Labs" width={190} height={38} priority /></Link>
      <Link href="/login" className="text-sm font-semibold text-blue-700 hover:text-blue-800">Back to log in</Link>
    </header>
    <section className="mx-auto flex min-h-[65vh] max-w-lg items-center justify-center py-12">
      <div className="pt-portal-card w-full rounded-2xl border p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-xl font-semibold text-blue-700" aria-hidden="true">P</div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">Client account unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">We couldn’t connect to the account service. Please try again later or return to the login page.</p>
        <Link href="/login" className="pt-portal-button mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold transition">Return to log in</Link>
      </div>
    </section>
  </main>;
}

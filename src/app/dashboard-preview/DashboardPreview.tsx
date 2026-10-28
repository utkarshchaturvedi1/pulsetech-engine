"use client";

import Image from "next/image";
import { useState } from "react";

type LeadStatus = "Not updated" | "Yes" | "No";
type Lead = { id: string; received: string; name: string; phone: string; address: string; service: string; status: LeadStatus; cost: string };

const sampleLeads: Lead[] = [
  { id: "lead-1", received: "Oct 21, 2026 · 10:42 AM", name: "Jordan M.", phone: "(555) 010-0104", address: "Austin, TX 78704", service: "Kitchen sink repair", status: "Not updated", cost: "" },
  { id: "lead-2", received: "Oct 21, 2026 · 9:18 AM", name: "Taylor R.", phone: "(555) 010-0128", address: "Austin, TX 78745", service: "Water heater service", status: "Yes", cost: "425" },
  { id: "lead-3", received: "Oct 20, 2026 · 4:07 PM", name: "Morgan K.", phone: "(555) 010-0162", address: "Round Rock, TX 78664", service: "Drain cleaning", status: "No", cost: "" },
];

export default function DashboardPreview() {
  const [mode, setMode] = useState<"setup" | "live">("setup");
  const [leads, setLeads] = useState(sampleLeads);
  const [savedLead, setSavedLead] = useState<string | null>(null);

  function updateLead(id: string, patch: Partial<Lead>) {
    setLeads((current) => current.map((lead) => lead.id === id ? { ...lead, ...patch } : lead));
    setSavedLead(null);
  }

  return <main className="pt-dashboard-preview min-h-screen text-[#111217]">
    <header className="pt-portal-header sticky top-0 z-20 border-b backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1180px] items-center justify-between gap-5 px-4 sm:px-6">
        <Image src="/branding/pulsetech-logo-color.svg" alt="PulseTech Labs" width={168} height={42} priority />
        <nav className="pt-portal-nav hidden items-center gap-7 text-sm font-bold md:flex" aria-label="Dashboard navigation">
          <span>Overview</span><span>Leads</span><span>Assistant</span><span>Support</span>
        </nav>
        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-extrabold tracking-wide text-blue-800">SAMPLE PREVIEW</span>
      </div>
    </header>

    <div className="mx-auto max-w-[1180px] space-y-7 px-4 py-7 sm:px-6 sm:py-9">
      <section className="pt-portal-hero relative overflow-hidden rounded-[30px] px-6 py-8 text-white sm:px-9 sm:py-10">
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div><p className="text-[11px] font-black uppercase tracking-[.16em] text-[#78a4ff]">CLIENT DASHBOARD</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{mode === "setup" ? "Let’s get your assistant ready" : "Your assistant is live"}</h1>
            <p className="mt-3 text-sm leading-6 text-[#c5d0e5]">Sample Home Services <span className="px-1.5 text-blue-300">·</span> {mode === "setup" ? "Setup in progress" : "Website chat and inbound phone active"}</p>
          </div>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white">{mode === "setup" ? "SETUP IN PROGRESS" : "LIVE"}</span>
        </div>
        <div className="relative mt-7 inline-flex rounded-xl border border-white/15 bg-white/10 p-1" aria-label="Choose dashboard state">
          <button type="button" onClick={() => setMode("setup")} aria-pressed={mode === "setup"} className={`rounded-lg px-4 py-2.5 text-sm font-bold transition ${mode === "setup" ? "bg-white text-[#071d36] shadow-sm" : "text-white/80 hover:text-white"}`}>Before launch</button>
          <button type="button" onClick={() => setMode("live")} aria-pressed={mode === "live"} className={`rounded-lg px-4 py-2.5 text-sm font-bold transition ${mode === "live" ? "bg-white text-[#071d36] shadow-sm" : "text-white/80 hover:text-white"}`}>Live client</button>
        </div>
      </section>

      <div className="pt-portal-notice rounded-xl border px-4 py-3 text-sm">
        Sample information only. Try switching views and editing lead outcomes; preview changes are not saved to a client account.
      </div>

      {mode === "setup" ? <SetupDashboard /> : <LiveDashboard leads={leads} updateLead={updateLead} savedLead={savedLead} setSavedLead={setSavedLead} />}
    </div>
  </main>;
}

function SetupDashboard() {
  return <>
    <section className="grid gap-6 rounded-[22px] border border-[#d9e7f6] bg-gradient-to-br from-white to-[#f2f7ff] p-6 shadow-[0_15px_40px_rgba(32,76,130,.07)] md:grid-cols-[1fr_auto] md:items-center md:p-8">
      <div><p className="text-[11px] font-black uppercase tracking-[.14em] text-[#3477cf]">OPTIONAL</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight">Try your assistant</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#5d6c7d]">Test the chat or phone experience whenever you like. PulseTech completes the launch checks and sends your installation instructions.</p></div>
      <SampleButton>Try the demo</SampleButton>
    </section>

    <Card title="Setup progress">
      <ol className="grid gap-5 md:grid-cols-4"><Step number="1" title="Business details" detail="Saved from your demo" active /><Step number="2" title="Payment" detail="Confirmed before launch checks" /><Step number="3" title="PulseTech launch checks" detail="Handled by PulseTech" /><Step number="4" title="Install and go live" detail="Instructions sent after checks" /></ol>
    </Card>

    <div className="grid gap-5 md:grid-cols-2">
      <Card title="Your business information" action="Review with Peter">
        <p className="-mt-3 mb-5 text-sm text-[#5d6c7d]">Review what your assistant knows.</p>
        <dl className="grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2"><ProfileItem label="Website" value="samplehomeservices.com" /><ProfileItem label="Business phone" value="(555) 010-0180" /><ProfileItem label="Business email" value="hello@samplehomeservices.com" /><ProfileItem label="Business hours" value="Mon–Sat, 8:00 AM–6:00 PM" /><ProfileItem label="Services" value="Plumbing, drain cleaning, water heaters" /><ProfileItem label="Service areas" value="Austin, Round Rock, Cedar Park" /><ProfileItem label="Prices and visit fees" value="Verified with business owner" /></dl>
      </Card>
      <Card title="Website installation"><p className="text-sm leading-6 text-[#5d6c7d]">Installation is coordinated with PulseTech. We’ll provide and verify the website-specific steps with you.</p><div className="mt-5"><a className="pt-portal-secondary inline-flex rounded-full border px-4 py-2.5 text-sm font-bold" href="mailto:contact@pulsetechlabs.com?subject=Website%20installation">Email about installation ↗</a></div></Card>
    </div>
    <SupportPreview />
  </>;
}

function LiveDashboard({ leads, updateLead, savedLead, setSavedLead }: {
  leads: Lead[]; updateLead: (id: string, patch: Partial<Lead>) => void;
  savedLead: string | null; setSavedLead: (id: string) => void;
}) {
  return <>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Leads captured" value="12" note="Recent enquiries saved in your account." />
      <SummaryCard label="Website chat" value="Live" note="Included in your AI Sales Employee service." green />
      <SummaryCard label="Inbound phone" value="Live" note="Inbound calls only." green />
      <SummaryCard label="Lead alerts" value="Recipients saved" note="hello@samplehomeservices.com · (555) 010-0180" green />
    </section>

    <Card title="Leads captured" description="Review each enquiry and record whether it became a sale and its job cost.">
      <div className="overflow-x-auto rounded-2xl border border-[#dce7f4]">
        <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead className="bg-[#f6faff] text-[11px] uppercase tracking-wide text-[#5d6c7d]"><tr>
            <th className="px-4 py-3 font-extrabold">Date &amp; time</th><th className="px-4 py-3 font-extrabold">Lead</th><th className="px-4 py-3 font-extrabold">Phone no.</th><th className="px-4 py-3 font-extrabold">Service address</th><th className="px-4 py-3 font-extrabold">Service requested</th><th className="px-4 py-3 font-extrabold">Converted to sale?</th><th className="px-4 py-3 font-extrabold">Job cost ($)</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody className="divide-y divide-[#e5edf7] bg-white">{leads.map((lead) => <tr key={lead.id} className="align-top">
            <td className="whitespace-nowrap px-4 py-4 text-xs text-[#5d6c7d]">{lead.received}</td><td className="px-4 py-4 font-bold text-[#071d36]">{lead.name}</td><td className="whitespace-nowrap px-4 py-4"><a className="font-semibold text-[#0878ff] hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a></td><td className="px-4 py-4 text-[#26354b]">{lead.address}</td><td className="px-4 py-4 text-[#26354b]">{lead.service}</td>
            <td className="px-4 py-4"><label className="sr-only" htmlFor={`outcome-${lead.id}`}>Was this lead converted to a sale?</label><select id={`outcome-${lead.id}`} value={lead.status} onChange={(event) => updateLead(lead.id, { status: event.target.value as LeadStatus })} className="min-h-10 w-36 rounded-lg border border-[#dce7f4] bg-white px-3 text-sm text-[#071d36] focus:border-[#0878ff] focus:outline-none focus:ring-2 focus:ring-blue-100"><option>Not updated</option><option>Yes</option><option>No</option></select></td>
            <td className="px-4 py-4"><label className="sr-only" htmlFor={`cost-${lead.id}`}>Job cost in dollars</label><input id={`cost-${lead.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={lead.cost} onChange={(event) => updateLead(lead.id, { cost: event.target.value })} placeholder="Optional" className="min-h-10 w-32 rounded-lg border border-[#dce7f4] bg-white px-3 text-sm text-[#071d36] focus:border-[#0878ff] focus:outline-none focus:ring-2 focus:ring-blue-100" /></td>
            <td className="px-4 py-4"><button type="button" onClick={() => setSavedLead(lead.id)} className="pt-portal-button min-h-10 rounded-full px-4 text-xs font-extrabold">Save</button>{savedLead === lead.id && <span className="mt-1 block whitespace-nowrap text-[11px] font-semibold text-green-700">Preview saved</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[#7b899a]">On a connected client account, these changes will be saved to that client’s lead record.</p>
    </Card>

    <div className="grid gap-5 lg:grid-cols-2"><Card title="Business instructions" description="Update services, hours, pricing, policies, and other business instructions through Peter. Peter confirms updates in chat after saving."><SampleButton>Review with Peter</SampleButton></Card></div>
    <Card title="Weekly report" description="Weekly analytics will appear here. Lead alerts are sent by email and SMS." />
    <SupportPreview />
  </>;
}

function SupportPreview() {
  return <section className="pt-portal-support rounded-[26px] p-6 sm:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#c9ff55]">Need a hand?</p><h2 className="mt-2 text-xl font-extrabold text-white">Email PulseTech support</h2><p className="mt-2 text-sm text-white/70">For account or technical help, contact us directly. Use Peter for business information updates.</p></div><a className="pt-portal-button inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-5 py-3 text-sm font-extrabold" href="mailto:contact@pulsetechlabs.com?subject=PulseTech%20client%20support">Contact support ↗</a></div></section>;
}

function Card({ title, description, action, children }: { title: string; description?: string; action?: string; children?: React.ReactNode }) {
  return <section className="pt-portal-card rounded-[26px] border p-5 sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold tracking-tight text-[#071d36]">{title}</h2>{description && <p className="mt-2 text-sm leading-6 text-[#5d6c7d]">{description}</p>}</div>{action && <SampleButton link>{action}</SampleButton>}</div>
    {children}
  </section>;
}

function SampleButton({ children, secondary = false, link = false }: { children: React.ReactNode; secondary?: boolean; link?: boolean }) {
  const look = secondary ? "pt-portal-secondary border" : "pt-portal-button";
  return link ? <span className="inline-flex items-center rounded-lg px-3 py-2 text-xs font-extrabold text-[#246bfe]">{children} ↗</span> : <button type="button" disabled title="Illustrative button in this sample preview" className={`inline-flex min-h-11 cursor-default items-center justify-center rounded-full px-5 py-3 text-sm font-extrabold opacity-90 ${look}`}>{children}</button>;
}

function SummaryCard({ label, value, note, green = false }: { label: string; value: string; note: string; green?: boolean }) {
  return <section className="pt-portal-card rounded-[22px] border p-5"><p className="text-sm font-bold text-[#66778b]">{label}</p><p className={`mt-2 text-xl font-extrabold ${green ? "text-[#14804a]" : "text-[#071d36]"}`}>{value}</p><p className="mt-2 text-xs leading-5 text-[#75869a]">{note}</p></section>;
}

function Step({ number, title, detail, active = false }: { number: string; title: string; detail: string; active?: boolean }) {
  return <li className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${active ? "bg-[#111217] text-[#c9ff55]" : "border border-[#dce7f4] bg-[#f6f6f8] text-[#246bfe]"}`}>{number}</span><div><p className="text-sm font-extrabold text-[#071d36]">{title}</p><p className="mt-1 text-xs leading-5 text-[#75869a]">{detail}</p></div></li>;
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8190a1]">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium text-[#26354b]">{value}</dd></div>;
}

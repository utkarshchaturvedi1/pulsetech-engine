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

  return <main className="min-h-screen bg-white font-sans text-[#071d36]">
    <header className="sticky top-0 z-20 border-b border-[#dce7f4] bg-white/95 shadow-[0_8px_28px_rgba(8,27,65,.06)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1180px] items-center justify-between gap-5 px-4 sm:px-6">
        <Image src="/branding/pulsetech-logo-color.svg" alt="PulseTech Labs" width={168} height={42} priority />
        <nav className="hidden items-center gap-7 text-sm font-bold text-[#4b5d70] md:flex" aria-label="Dashboard navigation">
          <span>Overview</span><span>Leads</span><span>Assistant</span><span>Support</span>
        </nav>
        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-extrabold tracking-wide text-blue-800">SAMPLE PREVIEW</span>
      </div>
    </header>

    <div className="mx-auto max-w-[1180px] space-y-7 px-4 py-7 sm:px-6 sm:py-9">
      <section className="relative overflow-hidden rounded-[26px] bg-[#060a18] px-6 py-8 text-white shadow-[0_24px_70px_rgba(22,63,112,.16)] sm:px-9 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_78%_45%,rgba(49,95,255,.40),transparent_42%),radial-gradient(ellipse_at_22%_100%,rgba(125,65,255,.20),transparent_42%),linear-gradient(118deg,#040714_0%,#07112a_55%,#09183c_100%)]" />
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

      <div className="rounded-xl border border-blue-100 bg-[#f6faff] px-4 py-3 text-sm text-[#315c8c]">
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
      <ol className="grid gap-5 md:grid-cols-3"><Step number="1" title="Business details" detail="Saved from your demo" active /><Step number="2" title="PulseTech launch checks" detail="Handled by PulseTech" /><Step number="3" title="Install and go live" detail="Instructions sent after checks" /></ol>
    </Card>

    <div className="grid gap-5 md:grid-cols-2">
      <Card title="Your business information" action="Review with Peter">
        <p className="-mt-3 mb-5 text-sm text-[#5d6c7d]">Review what your assistant knows.</p>
        <dl className="grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2"><ProfileItem label="Website" value="samplehomeservices.com" /><ProfileItem label="Business phone" value="(555) 010-0180" /><ProfileItem label="Business email" value="hello@samplehomeservices.com" /><ProfileItem label="Business hours" value="Mon–Sat, 8:00 AM–6:00 PM" /><ProfileItem label="Services" value="Plumbing, drain cleaning, water heaters" /><ProfileItem label="Service areas" value="Austin, Round Rock, Cedar Park" /><ProfileItem label="Prices and visit fees" value="Verified with business owner" /></dl>
      </Card>
      <Card title="Website installation"><p className="text-sm leading-6 text-[#5d6c7d]">Installation is coordinated with PulseTech. We’ll provide and verify the website-specific steps with you.</p><div className="mt-5"><SampleButton secondary>Ask about installation</SampleButton></div></Card>
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
            <td className="px-4 py-4"><button type="button" onClick={() => setSavedLead(lead.id)} className="min-h-10 rounded-lg bg-gradient-to-r from-[#159dff] via-[#346ff7] to-[#8a4df0] px-4 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(55,83,235,.2)]">Save</button>{savedLead === lead.id && <span className="mt-1 block whitespace-nowrap text-[11px] font-semibold text-green-700">Preview saved</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[#7b899a]">On a connected client account, these changes will be saved to that client’s lead record.</p>
    </Card>

    <div className="grid gap-5 lg:grid-cols-2"><Card title="Business instructions" description="Update services, hours, pricing, policies, and other business instructions through Peter."><SampleButton>Review with Peter</SampleButton></Card><Card title="Website installation" description="Your assistant is live. For installation changes, send a support request."><SampleButton secondary>Installation help</SampleButton></Card></div>
    <Card title="Weekly report" description="Weekly analytics will appear here. Lead alerts are sent by email and SMS." />
    <SupportPreview />
  </>;
}

function SupportPreview() {
  return <div className="grid gap-5 lg:grid-cols-2">
    <Card title="Need help?" description="Send a setup change, question, or support request to PulseTech."><textarea aria-label="Sample support request" placeholder="Type a question or support request" className="min-h-24 w-full rounded-xl border border-[#dce7f4] bg-white p-3 text-sm focus:border-[#0878ff] focus:outline-none focus:ring-2 focus:ring-blue-100" /><div className="mt-3"><SampleButton>Send support request</SampleButton></div></Card>
    <Card title="Recent support requests"><div className="border-t border-[#e5edf7] pt-4"><div className="flex items-center justify-between gap-3"><p className="font-bold">Confirm service area update</p><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">In progress</span></div><p className="mt-2 text-sm text-[#5d6c7d]">Please include Cedar Park in the service area list.</p><time className="mt-2 block text-xs text-[#7b899a]">Oct 20, 2026</time></div></Card>
  </div>;
}

function Card({ title, description, action, children }: { title: string; description?: string; action?: string; children?: React.ReactNode }) {
  return <section className="rounded-[22px] border border-[#d9e7f6] bg-white p-5 shadow-[0_15px_38px_rgba(35,83,139,.06)] sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold tracking-tight text-[#071d36]">{title}</h2>{description && <p className="mt-2 text-sm leading-6 text-[#5d6c7d]">{description}</p>}</div>{action && <SampleButton link>{action}</SampleButton>}</div>
    {children}
  </section>;
}

function SampleButton({ children, secondary = false, link = false }: { children: React.ReactNode; secondary?: boolean; link?: boolean }) {
  const look = secondary ? "border border-[#b8d4f2] bg-white text-[#176ff2] hover:bg-[#f6faff]" : "bg-gradient-to-r from-[#159dff] via-[#346ff7] to-[#8a4df0] text-white shadow-[0_8px_20px_rgba(55,83,235,.2)] hover:brightness-105";
  return link ? <span className={`inline-flex items-center rounded-lg px-3 py-2 text-xs font-extrabold ${secondary ? "text-[#176ff2]" : "text-[#176ff2]"}`}>{children} ↗</span> : <button type="button" disabled title="Illustrative button in this sample preview" className={`inline-flex min-h-11 cursor-default items-center justify-center rounded-xl px-5 py-3 text-sm font-extrabold opacity-90 ${look}`}>{children}</button>;
}

function SummaryCard({ label, value, note, green = false }: { label: string; value: string; note: string; green?: boolean }) {
  return <section className="rounded-[20px] border border-[#d9e7f6] bg-white p-5 shadow-[0_12px_30px_rgba(28,77,136,.07)]"><p className="text-sm font-bold text-[#66778b]">{label}</p><p className={`mt-2 text-xl font-extrabold ${green ? "text-[#14804a]" : "text-[#071d36]"}`}>{value}</p><p className="mt-2 text-xs leading-5 text-[#75869a]">{note}</p></section>;
}

function Step({ number, title, detail, active = false }: { number: string; title: string; detail: string; active?: boolean }) {
  return <li className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${active ? "bg-gradient-to-br from-[#159dff] to-[#7458ff] text-white shadow-[0_6px_18px_rgba(68,94,239,.25)]" : "border border-[#dce7f4] bg-[#f6faff] text-[#3477cf]"}`}>{number}</span><div><p className="text-sm font-extrabold text-[#071d36]">{title}</p><p className="mt-1 text-xs leading-5 text-[#75869a]">{detail}</p></div></li>;
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8190a1]">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium text-[#26354b]">{value}</dd></div>;
}

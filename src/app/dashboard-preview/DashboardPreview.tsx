"use client";

import Image from "next/image";
import { useState } from "react";

type LeadStatus = "Not updated" | "Yes" | "No";

export default function DashboardPreview() {
  const [mode, setMode] = useState<"setup" | "live">("setup");
  const [leadStatus, setLeadStatus] = useState<LeadStatus>("Not updated");
  const [jobValue, setJobValue] = useState("");
  const [saved, setSaved] = useState(false);

  return <main className="min-h-screen bg-[#f5f5f7] px-4 text-[#111217] sm:px-6">
    <header className="-mx-4 border-b border-black/10 bg-white px-4 sm:-mx-6 sm:px-6">
      <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4">
        <Image src="/branding/pulsetech-logo-blue-black.svg" alt="PulseTech Labs" width={190} height={38} priority />
        <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">Sample dashboard preview</span>
      </div>
    </header>

    <div className="mx-auto max-w-7xl space-y-6 py-7 sm:py-9">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        Preview only — sample information. Changes here are not saved to a client account.
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Choose dashboard state">
        <button type="button" onClick={() => setMode("setup")} aria-pressed={mode === "setup"} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${mode === "setup" ? "bg-blue-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
          Before launch
        </button>
        <button type="button" onClick={() => setMode("live")} aria-pressed={mode === "live"} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${mode === "live" ? "bg-blue-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
          Live client
        </button>
      </div>

      {mode === "setup" ? <SetupDashboard /> : <LiveDashboard
        leadStatus={leadStatus}
        setLeadStatus={(status) => { setLeadStatus(status); setSaved(false); }}
        jobValue={jobValue}
        setJobValue={(value) => { setJobValue(value); setSaved(false); }}
        saved={saved}
        onSave={() => setSaved(true)}
      />}
    </div>
  </main>;
}

function SetupDashboard() {
  return <>
    <section className="space-y-2">
      <StatusPill label="Setup in progress" tone="blue" />
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Let’s get your assistant ready</h1>
      <p className="text-slate-600">Your AI Sales Employee is being prepared for <strong className="font-semibold text-slate-800">Sample Home Services</strong>. Testing is optional.</p>
    </section>

    <section className="grid gap-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Optional</p><h2 className="mt-2 text-2xl font-semibold text-slate-950">Try your assistant</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Test the chat or phone experience whenever you like. PulseTech completes the launch checks and sends your installation instructions.</p></div>
      <button type="button" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">Try the demo</button>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-label="Setup progress">
      <ol className="grid gap-4 md:grid-cols-3">
        <ProgressStep number="1" title="Business details" state="Saved from your demo" active />
        <ProgressStep number="2" title="PulseTech launch checks" state="Handled by PulseTech" />
        <ProgressStep number="3" title="Install and go live" state="Instructions sent after checks" />
      </ol>
    </section>

    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-950">Your business information</h2><p className="mt-1 text-sm text-slate-600">Review what your assistant knows.</p></div><button type="button" className="shrink-0 text-sm font-semibold text-blue-700 hover:underline">Review with Peter</button></div>
        <dl className="mt-5 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
          <ProfileItem label="Website" value="samplehomeservices.com" /><ProfileItem label="Business phone" value="(555) 010-0180" /><ProfileItem label="Business email" value="hello@samplehomeservices.com" /><ProfileItem label="Business hours" value="Mon–Sat, 8:00 AM–6:00 PM" /><ProfileItem label="Services" value="Plumbing, drain cleaning, water heaters" /><ProfileItem label="Service areas" value="Austin, Round Rock, Cedar Park" /><ProfileItem label="Prices and visit fees" value="Verified with business owner" />
        </dl>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Website installation</h2><p className="mt-2 text-sm leading-6 text-slate-600">Installation is coordinated with PulseTech. We’ll provide and verify website-specific steps with you.</p>
        <button type="button" className="mt-5 inline-flex rounded-lg border border-blue-700 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">Ask about installation</button>
      </section>
    </div>
    <SupportPreview />
  </>;
}

function LiveDashboard({ leadStatus, setLeadStatus, jobValue, setJobValue, saved, onSave }: {
  leadStatus: LeadStatus; setLeadStatus: (status: LeadStatus) => void;
  jobValue: string; setJobValue: (value: string) => void;
  saved: boolean; onSave: () => void;
}) {
  return <>
    <section className="space-y-2"><StatusPill label="Live" tone="green" /><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Your assistant is live</h1><p className="text-slate-600">Sample Home Services</p></section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Leads captured" value="12" note="Recent enquiries saved in your account." />
      <SummaryCard label="Website chat" value="Live" note="Included in your AI Sales Employee service." green />
      <SummaryCard label="Inbound phone" value="Live" note="Inbound calls only." green />
      <SummaryCard label="Lead alerts" value="Recipients saved" note="hello@samplehomeservices.com · (555) 010-0180" green />
    </section>

    <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-slate-950">Recent leads</h2><span className="text-sm text-slate-500">Customer enquiries</span></div>
        <article className="mt-5 rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">Jordan M.</h3><p className="mt-1 text-xs text-slate-500">Oct 21, 2026 · 10:42 AM · Normal urgency</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">New enquiry</span></div>
          <dl className="mt-4 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2"><LeadField label="Phone" value="(555) 010-0104" /><LeadField label="Email" value="jordan@example.com" /><LeadField label="Service address" value="Austin, TX 78704" /><LeadField label="Service requested" value="Kitchen sink repair · This week" /></dl>
          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-xs font-semibold text-slate-700">Was this lead converted to a sale?
              <select value={leadStatus} onChange={(event) => setLeadStatus(event.target.value as LeadStatus)} className="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"><option>Not updated</option><option>Yes</option><option>No</option></select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">Job value ($)
              <input type="number" min="0" step="0.01" value={jobValue} onChange={(event) => setJobValue(event.target.value)} placeholder="Optional" className="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </label>
            <button type="button" onClick={onSave} className="min-h-10 rounded-lg bg-[#111217] px-4 text-sm font-semibold text-white hover:bg-blue-700">Save preview</button>
          </div>
          {saved && <p role="status" className="mt-2 text-xs text-green-700">Saved in this preview only.</p>}
        </article>
      </section>
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Business instructions</h2><p className="mt-2 text-sm leading-6 text-slate-600">Update services, hours, pricing, policies, and other business instructions through Peter.</p><button type="button" className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Review with Peter</button></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Website installation</h2><p className="mt-2 text-sm text-slate-600">Current handover stage: <span className="font-medium text-green-700">Live</span></p><p className="mt-1 text-sm text-slate-600">Need an install change? Send a support request.</p><button type="button" className="mt-4 inline-flex rounded-lg border border-blue-700 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">Installation help</button></section>
      </div>
    </div>
    <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Weekly report</h2><p className="mt-2 text-sm text-slate-600">Weekly analytics will appear here. Lead alerts are sent by email and SMS.</p></section>
    <SupportPreview />
  </>;
}

function SupportPreview() {
  return <section className="grid gap-5 lg:grid-cols-2">
    <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Need help?</h2><p className="mt-1 text-sm text-slate-600">Send a setup change, question, or support request to PulseTech.</p><textarea aria-label="Sample support request" placeholder="Type a question or support request" className="mt-4 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" /><button type="button" className="mt-3 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">Send preview request</button></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-950">Recent support requests</h2><div className="mt-4 border-t border-slate-100 pt-4"><div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">Confirm service area update</p><StatusPill label="In progress" tone="blue" /></div><p className="mt-1 text-sm text-slate-600">Please include Cedar Park in the service area list.</p><time className="mt-1 block text-xs text-slate-400">Oct 20, 2026</time></div></div>
  </section>;
}

function StatusPill({ label, tone }: { label: string; tone: "blue" | "green" }) {
  const classes = tone === "green" ? "bg-green-50 text-green-800" : "bg-blue-50 text-blue-800";
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${classes}`}><span className={`h-2 w-2 rounded-full ${tone === "green" ? "bg-green-600" : "bg-blue-600"}`} />{label}</span>;
}

function ProgressStep({ number, title, state, active = false }: { number: string; title: string; state: string; active?: boolean }) {
  return <li className="flex items-start gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}>{number}</span><div><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{state}</p></div></li>;
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900">{value}</dd></div>;
}

function SummaryCard({ label, value, note, green = false }: { label: string; value: string; note: string; green?: boolean }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-medium text-slate-600">{label}</p><p className={`mt-2 text-xl font-semibold ${green ? "text-green-700" : "text-slate-950"}`}>{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{note}</p></section>;
}

function LeadField({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-slate-900">{value}</dd></div>;
}

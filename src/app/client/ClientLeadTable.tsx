"use client";

import { useState } from "react";

export type ClientLead = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  service_address: string | null;
  primary_need: string | null;
  preferred_timing: string | null;
  urgency: string;
  sales_outcome: "unreviewed" | "converted" | "not_converted";
  sale_amount_usd: number | string | null;
  first_captured_at: string;
};

export default function ClientLeadTable({ initialLeads }: { initialLeads: ClientLead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [values, setValues] = useState<Record<string, { converted: string; jobValue: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  function edit(lead: ClientLead) {
    return values[lead.id] || {
      converted: lead.sales_outcome === "unreviewed" ? "" : lead.sales_outcome === "converted" ? "yes" : "no",
      jobValue: lead.sale_amount_usd == null ? "" : String(lead.sale_amount_usd),
    };
  }

  async function save(lead: ClientLead) {
    const value = edit(lead);
    if (value.converted === "yes" && !value.jobValue.trim()) {
      setMessages((old) => ({ ...old, [lead.id]: "Enter the job value before marking this lead as a sale." }));
      return;
    }
    if (value.jobValue.trim() && (!Number.isFinite(Number(value.jobValue)) || Number(value.jobValue) < 0)) {
      setMessages((old) => ({ ...old, [lead.id]: "Enter a valid job value of $0 or more." }));
      return;
    }
    setBusy(lead.id);
    setMessages((old) => ({ ...old, [lead.id]: "" }));
    try {
      const response = await fetch("/api/client/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          salesOutcome: value.converted === "" ? "unreviewed" : value.converted === "yes" ? "converted" : "not_converted",
          saleAmountUsd: value.jobValue === "" ? null : Number(value.jobValue),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save changes.");
      setLeads((old) => old.map((item) => item.id === lead.id ? {
        ...item,
        sales_outcome: value.converted === "" ? "unreviewed" : value.converted === "yes" ? "converted" : "not_converted",
        sale_amount_usd: value.jobValue === "" ? null : Number(value.jobValue),
      } : item));
      setMessages((old) => ({ ...old, [lead.id]: "Saved." }));
    } catch (error) {
      setMessages((old) => ({ ...old, [lead.id]: error instanceof Error ? error.message : "Could not save changes." }));
    } finally {
      setBusy(null);
    }
  }

  if (!leads.length) return <div className="flex min-h-52 flex-col items-center justify-center text-center">
    <div className="text-3xl text-slate-300" aria-hidden="true">○</div>
    <p className="mt-3 font-semibold text-slate-800">No leads yet</p>
    <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">New enquiries captured by your live website chat will appear here. Lead alerts continue by email and SMS.</p>
  </div>;

  return <div className="mt-5">
    <div className="hidden overflow-x-auto rounded-2xl border border-[#dce7f4] lg:block">
      <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
        <thead className="bg-[#f6faff] text-[11px] uppercase tracking-wide text-[#5d6c7d]"><tr>
          <th className="px-4 py-3 font-extrabold">Date &amp; time</th><th className="px-4 py-3 font-extrabold">Lead</th><th className="px-4 py-3 font-extrabold">Phone no.</th><th className="px-4 py-3 font-extrabold">Service address</th><th className="px-4 py-3 font-extrabold">Service requested</th><th className="px-4 py-3 font-extrabold">Converted to sale?</th><th className="px-4 py-3 font-extrabold">Job cost ($)</th><th className="px-4 py-3" />
        </tr></thead>
        <tbody className="divide-y divide-[#e5edf7] bg-white">{leads.map((lead) => {
          const value = edit(lead);
          return <tr key={lead.id} className="align-top">
            <td className="whitespace-nowrap px-4 py-4 text-xs text-[#5d6c7d]">{new Date(lead.first_captured_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
            <td className="px-4 py-4 font-bold text-[#071d36]">{lead.customer_name || "Name not provided"}</td>
            <td className="whitespace-nowrap px-4 py-4">{lead.customer_phone ? <a className="font-semibold text-[#0878ff] hover:underline" href={`tel:${lead.customer_phone}`}>{lead.customer_phone}</a> : "Not provided"}</td>
            <td className="px-4 py-4 text-[#26354b]">{lead.service_address || "Not provided"}</td><td className="px-4 py-4 text-[#26354b]">{lead.primary_need || "Not provided"}{lead.preferred_timing ? ` · ${lead.preferred_timing}` : ""}</td>
            <td className="px-4 py-4"><label className="sr-only" htmlFor={`outcome-${lead.id}`}>Was this lead converted to a sale?</label><select value={value.converted} onChange={(event) => setValues((old) => ({ ...old, [lead.id]: { ...value, converted: event.target.value } }))} className="min-h-10 w-36 rounded-lg border border-[#dce7f4] bg-white px-3 text-sm text-[#071d36] focus:border-[#0878ff] focus:outline-none focus:ring-2 focus:ring-blue-100"><option value="">Not updated</option><option value="yes">Yes</option><option value="no">No</option></select></td>
            <td className="px-4 py-4"><label className="sr-only" htmlFor={`cost-${lead.id}`}>Job value in dollars</label><input type="number" min="0" step="0.01" inputMode="decimal" value={value.jobValue} onChange={(event) => setValues((old) => ({ ...old, [lead.id]: { ...value, jobValue: event.target.value } }))} placeholder="Optional" className="min-h-10 w-28 rounded-lg border border-[#dce7f4] bg-white px-3 text-sm text-[#071d36] focus:border-[#0878ff] focus:outline-none focus:ring-2 focus:ring-blue-100" /></td>
            <td className="px-4 py-4"><button type="button" disabled={busy === lead.id} onClick={() => void save(lead)} className="min-h-10 rounded-lg bg-gradient-to-r from-[#159dff] via-[#346ff7] to-[#8a4df0] px-4 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(55,83,235,.2)] disabled:opacity-60">{busy === lead.id ? "Saving…" : "Save"}</button>{messages[lead.id] && <span role="status" className={`mt-1 block whitespace-nowrap text-[11px] font-semibold ${messages[lead.id] === "Saved." ? "text-green-700" : "text-rose-700"}`}>{messages[lead.id]}</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="space-y-4 lg:hidden">
    {leads.map((lead) => {
      const value = edit(lead);
      return <article key={lead.id} className="rounded-2xl border border-[#d9e7f6] bg-white p-4 shadow-[0_10px_28px_rgba(35,83,139,.05)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
          <h3 className="font-extrabold text-[#071d36]">{lead.customer_name || "Customer name not provided"}</h3>
            <p className="mt-1 text-xs text-slate-500">{new Date(lead.first_captured_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}{lead.urgency !== "NONE" ? ` · ${lead.urgency.toLowerCase()} urgency` : ""}</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">New enquiry</span>
        </div>
        <dl className="mt-4 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-medium text-slate-500">Phone</dt><dd className="mt-1">{lead.customer_phone ? <a className="text-blue-700 hover:underline" href={`tel:${lead.customer_phone}`}>{lead.customer_phone}</a> : "Not provided"}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Email</dt><dd className="mt-1">{lead.customer_email ? <a className="break-all text-blue-700 hover:underline" href={`mailto:${lead.customer_email}`}>{lead.customer_email}</a> : "Not provided"}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Service address</dt><dd className="mt-1">{lead.service_address || "Not provided"}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Service requested</dt><dd className="mt-1">{lead.primary_need || "Not provided"}{lead.preferred_timing ? ` · ${lead.preferred_timing}` : ""}</dd></div>
        </dl>
        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs font-semibold text-slate-700">Was this lead converted to a sale?
            <select value={value.converted} onChange={(event) => setValues((old) => ({ ...old, [lead.id]: { ...value, converted: event.target.value } }))} className="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Not updated</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-700">Job value ($)
            <input type="number" min="0" step="0.01" inputMode="decimal" value={value.jobValue} onChange={(event) => setValues((old) => ({ ...old, [lead.id]: { ...value, jobValue: event.target.value } }))} placeholder="Optional" className="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
          <button type="button" disabled={busy === lead.id} onClick={() => void save(lead)} className="min-h-10 rounded-lg bg-[#111217] px-4 text-sm font-semibold text-white hover:bg-[#246bfe] focus:outline-none focus:ring-4 focus:ring-lime-200 disabled:cursor-wait disabled:opacity-60">{busy === lead.id ? "Saving…" : "Save"}</button>
        </div>
        {messages[lead.id] && <p role="status" className={`mt-2 text-xs ${messages[lead.id] === "Saved." ? "text-green-700" : "text-rose-700"}`}>{messages[lead.id]}</p>}
      </article>;
    })}
    </div>
  </div>;
}

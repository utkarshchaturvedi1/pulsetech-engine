"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientLeadOutcome({
  leadId,
  initialOutcome,
  initialAmount,
}: {
  leadId: string;
  initialOutcome: "unreviewed" | "converted" | "not_converted";
  initialAmount: number | null;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState(initialOutcome);
  const [amount, setAmount] = useState(initialAmount == null ? "" : String(initialAmount));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/client/leads/outcome", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, outcome, saleAmountUsd: outcome === "converted" ? amount : null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this lead outcome.");
      setMessage("Lead outcome saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this lead outcome.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
    <label className="text-xs font-semibold text-slate-600">Sale outcome
      <select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)} className="mt-1 block min-w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
        <option value="unreviewed">Needs review</option>
        <option value="converted">Converted to sale</option>
        <option value="not_converted">Not converted</option>
      </select>
    </label>
    {outcome === "converted" && <label className="text-xs font-semibold text-slate-600">Confirmed sale amount (USD)
      <input type="number" min="0" max="1000000000" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="0.00" />
    </label>}
    <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">{busy ? "Saving…" : "Save outcome"}</button>
    {message && <p aria-live="polite" className="basis-full text-xs text-slate-600">{message}</p>}
  </form>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function AdminActions({ accountId, requestId }: { accountId?: string; requestId?: string }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/client/admin", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, accountId, requestId, internalChecksPassed: fields.internalChecksPassed === "on" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setMessage("Saved."); router.refresh();
    } catch(error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-3 space-y-3">
    {requestId ? <label className="block">Request status <select name="status" className="ml-2 rounded border p-2"><option value="received">Received</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label> : <>
      <label className="block">Action <select name="action" className="ml-2 rounded border p-2"><option value="testing">Start internal checks</option><option value="activate_chat">Release website installation</option><option value="activate_phone">Confirm inbound phone setup</option><option value="suspend">Suspend service channels</option></select></label>
      <label className="block">Website domain <input name="domain" className="ml-2 rounded border p-2" placeholder="business.com" /></label>
      <label className="block">Assigned inbound phone <input name="phone" className="ml-2 rounded border p-2" placeholder="+1…" /></label>
      <label className="flex gap-2"><input type="checkbox" name="internalChecksPassed" /> Chat, saved instructions, prices and actual email/SMS alerts were tested successfully.</label>
    </>}
    <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}

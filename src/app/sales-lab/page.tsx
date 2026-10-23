"use client";
import { useEffect, useRef, useState } from "react";
import type { LabMessage, LabProfile } from "@/lib/salesLab/policy";
type RecordView = { id: string; profile: LabProfile; updated_at: string };

export default function SalesLab() {
  const [ownerKey, setOwnerKey] = useState("");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [record, setRecord] = useState<RecordView | null>(null);
  const [instruction, setInstruction] = useState("");
  const [peterReply, setPeterReply] = useState("");
  const [messages, setMessages] = useState<LabMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visitor, setVisitor] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.get("id")) setId(params.get("id")!);
    setVisitor(params.get("view") === "customer");
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);

  async function peter(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/sales-lab/peter", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerKey}` }, body: JSON.stringify({ action, id, version: record?.updated_at, ...extra }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRecord(data); setId(data.id); setName(data.profile.businessName);
      location.hash = new URLSearchParams({ id: data.id }).toString();
      if (action === "create" || record?.id !== data.id) setMessages([]);
      if (action === "add" || action === "instruct") setInstruction("");
      setPeterReply(data.peterReply ? `${data.changed ? "Saved. " : ""}${data.peterReply}` : action === "revoke" ? "Removed. The sales employee will use the updated instructions on its next reply." : "");
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!draft.trim() || busy || !id) return;
    const next: LabMessage[] = [...messages, { role: "user", content: draft.trim() }];
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/sales-lab/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, messages: next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessages([...next, { role: "assistant", content: data.reply }]); setDraft(""); setName(data.businessName);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const chatReady = !!id && (visitor || !!record);
  return <main className="sales-lab">
    <header className="lab-top"><div><span className="lab-eyebrow">A FRESH CONVERSATION</span><h1>Sales conversation lab<span>.</span></h1></div><span className="lab-badge">Independent experiment</span></header>
    <div className={visitor ? "lab-grid customer-only" : "lab-grid"}>
      {!visitor && <aside className="lab-panel lab-peter">
        <div className="lab-panel-heading"><span className="lab-avatar">P</span><div><h2>Peter</h2><p>Your business instructions</p></div></div>
        <p>Tell Peter how your business works. Only saved instructions guide the sales employee.</p>
        <label>Owner key<input type="password" autoComplete="off" value={ownerKey} onChange={e => setOwnerKey(e.target.value)} placeholder="Private access key" /></label>
        <label>Business name<input value={name} maxLength={150} onChange={e => setName(e.target.value)} placeholder="Your test business" /></label>
        <button disabled={busy || !ownerKey || !name.trim()} onClick={() => peter("create", { businessName: name })}>Create separate test business</button>
        <details><summary>Open a saved test</summary><label>Test business ID<input value={id} onChange={e => { setId(e.target.value); setRecord(null); setMessages([]); }} /></label><button disabled={busy || !ownerKey || !id} onClick={() => peter("load")}>Load with Peter</button></details>
        {record && <>
          <div className="lab-divider" />
          <h3>Talk to Peter</h3><p>Tell him what to include, change, or exclude. For example: “Change our visit fee to $20” or “Stop asking about pets.”</p>
          <label className="lab-sr" htmlFor="instruction">Business instruction</label><textarea id="instruction" rows={4} maxLength={12000} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="For example: Our visit fee is $30, waived if the customer proceeds." />
          <button disabled={busy || !instruction.trim()} onClick={() => peter("instruct", { text: instruction })}>Send to Peter ↗</button>
          {peterReply && <p className="lab-peter-reply" role="status">{peterReply}</p>}
          <div className="lab-saved-heading"><h3>Active instructions</h3><button className="lab-text-button" disabled={busy} onClick={() => peter("load")}>Refresh</button></div>
          {!record.profile.instructions.length && <p>No business instructions saved yet.</p>}
          <ul className="lab-instructions">{record.profile.instructions.map(item => <li key={item.id}><p>{item.text}</p><button className="lab-text-button" disabled={busy} onClick={() => peter("revoke", { instructionId: item.id })}>Revoke</button></li>)}</ul>
          <a className="lab-link" target="_blank" rel="noreferrer" href={`/sales-lab#${new URLSearchParams({ id: record.id, view: "customer" })}`}>Open customer-only test ↗</a>
        </>}
      </aside>}
      <section className="lab-panel lab-chat" aria-label="Customer conversation">
        <div className="lab-panel-heading"><span className="lab-avatar lab-sales">S</span><div><h2>{name || "Sales employee"}</h2><p><span className="lab-dot" /> Here to help</p></div><button className="lab-text-button lab-reset" disabled={busy} onClick={() => { setMessages([]); setError(""); }}>New chat</button></div>
        <div className="lab-transcript" role="log" aria-live="polite">
          {!messages.length && <div className="lab-welcome"><span className="lab-welcome-icon">✦</span><h2>Let’s talk.</h2><p>{chatReady ? "Hi! What can I help you with today?" : "Create a test business with Peter, then start a customer conversation here."}</p></div>}
          {messages.map((message, index) => <div className={`lab-message ${message.role}`} key={index}><span>{message.role === "user" ? "You" : name || "Sales employee"}</span><p>{message.content}</p></div>)}
          {busy && <p className="lab-thinking" role="status">One moment…</p>}<div ref={end} />
        </div>
        <form className="lab-composer" onSubmit={e => { e.preventDefault(); void send(); }}><label className="lab-sr" htmlFor="customer-message">Your message</label><input id="customer-message" maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} disabled={!chatReady || busy} placeholder="Type as a customer…" /><button disabled={!chatReady || busy || !draft.trim()} type="submit">Send ↗</button></form>
        <p className="lab-test-note">Test conversation · No real bookings or notifications</p>
      </section>
    </div>
    {error && <div className="lab-error" role="alert">{error}</div>}
  </main>;
}

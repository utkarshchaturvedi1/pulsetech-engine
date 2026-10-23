"use client";
import { useEffect, useRef, useState } from "react";
import type { LabMessage, LabProfile } from "@/lib/salesLab/policy";
import type { OwnerLead } from "@/lib/salesLab/leads";
type RecordView = { id: string; profile: LabProfile; updated_at: string };

async function preparePhoto(file: File): Promise<File> {
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) throw new Error("Please choose a JPG, PNG or WebP photo.");
  if (file.size <= 2 * 1024 * 1024) return file;
  if (file.size > 15 * 1024 * 1024) throw new Error("Please choose a photo smaller than 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d"); if (!context) throw new Error("Please choose another photo.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error("Please choose a smaller photo.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {type:"image/jpeg"});
  } finally { bitmap.close(); }
}

export default function SalesLab() {
  const [ownerKey, setOwnerKey] = useState("");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [record, setRecord] = useState<RecordView | null>(null);
  const [instruction, setInstruction] = useState("");

  const [messages, setMessages] = useState<LabMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visitor, setVisitor] = useState(false);
  const [closed, setClosed] = useState(false);
  const [peterMessages, setPeterMessages] = useState<LabMessage[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [ownerPhoto, setOwnerPhoto] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef<string[]>([]);
  const [leads, setLeads] = useState<OwnerLead[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const conversation = useRef("");
  const end = useRef<HTMLDivElement>(null);
  function newChat() { conversation.current = crypto.randomUUID(); setMessages([]); setClosed(false); setError(""); setPendingPhotos([]); setPhotoPreviews({}); previewUrls.current.forEach(url => URL.revokeObjectURL(url)); previewUrls.current = []; }
  useEffect(() => () => { previewUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
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
      if (action === "photo") { setOwnerPhoto(data.dataUrl); return; }
      if (action === "leads") { setLeads(data.leads); setEmailConfigured(data.emailConfigured); return; }
      setRecord(data); setId(data.id); setName(data.profile.businessName);
      location.hash = new URLSearchParams({ id: data.id }).toString();
      if (action === "create" || record?.id !== data.id) { newChat(); setLeads([]); setPeterMessages([{role:"assistant",content:"Tell me about your business, or what you’d like to change."}]); }
      if (action === "add" || action === "instruct") {
        setInstruction("");
        setPeterMessages(previous => [...previous, {role:"user",content:String(extra.text || "")}, {role:"assistant",content:data.changed ? "Saved. " + data.peterReply : data.peterReply}]);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  async function uploadPhoto(file?: File) {
    if (!file || busy || !id) return;
    setBusy(true); setError("");
    if (!conversation.current) conversation.current = crypto.randomUUID();
    try {
      const prepared = await preparePhoto(file);
      const form = new FormData(); form.set("id",id); form.set("conversationId",conversation.current); form.set("photo",prepared);
      const response = await fetch("/api/sales-lab/media",{method:"POST",body:form});
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const preview = URL.createObjectURL(prepared); previewUrls.current.push(preview);
      setPhotoPreviews(previous => ({...previous,[data.id]:preview})); setPendingPhotos(previous => [...previous,data.id]);
    } catch(e) { setError(e instanceof Error ? e.message : "The photo could not be uploaded."); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function send() {
    if ((!draft.trim() && !pendingPhotos.length) || busy || !id) return;
    if (!conversation.current) conversation.current = crypto.randomUUID();
    const next: LabMessage[] = [...messages, { role: "user", content: draft.trim() || "Here is a photo of the issue.", ...(pendingPhotos.length ? {photoIds:pendingPhotos} : {}) }];
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/sales-lab/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, messages: next, conversationId: conversation.current }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessages([...next, { role: "assistant", content: data.reply, version: data.version }]); setDraft(""); setPendingPhotos([]); setName(data.businessName);
      setClosed(data.closed === true);
      if (data.closed === true && !visitor) await peter("leads");
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const chatReady = !!id && (visitor || !!record);
  return <main className="sales-lab">
    <header className="lab-top"><div><span className="lab-eyebrow">A FRESH CONVERSATION</span><h1>Sales conversation lab<span>.</span></h1></div><span className="lab-badge">Independent experiment</span></header>
    <div className={visitor ? "lab-grid customer-only" : "lab-grid"}>
      {!visitor && <aside className="lab-panel lab-peter">
        <div className="lab-panel-heading"><span className="lab-avatar">P</span><div><h2>Peter</h2><p>Your business instructions</p></div></div>
        <p>Tell Peter about your business. Ask him to add, change, or remove anything.</p>
        <details className="lab-setup" open={!record}><summary>{record ? "Business settings" : "Start here"}</summary>
        <label>Owner password<input type="password" autoComplete="off" value={ownerKey} onChange={e => setOwnerKey(e.target.value)} placeholder="Your owner password" /></label>
        <label>Business name<input value={name} maxLength={150} onChange={e => setName(e.target.value)} placeholder="Your test business" /></label>
        <button disabled={busy || !ownerKey || !name.trim()} onClick={() => peter("create", { businessName: name })}>Start test</button>
        <details><summary>Open an existing business</summary><label>Test business ID<input value={id} onChange={e => { setId(e.target.value); setRecord(null); newChat(); }} /></label><button disabled={busy || !ownerKey || !id} onClick={() => peter("load")}>Open business</button></details></details>
        {record && <>
          <div className="lab-peter-chat" role="log" aria-label="Conversation with Peter" aria-live="polite">{peterMessages.map((message,index) => <div className={`lab-message ${message.role}`} key={index}><span>{message.role === "user" ? "You" : "Peter"}</span><p>{message.content}</p></div>)}</div>
          <form onSubmit={e=>{e.preventDefault(); void peter("instruct",{text:instruction});}}>
          <label className="lab-sr" htmlFor="instruction">Message Peter</label><textarea id="instruction" rows={3} maxLength={12000} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Tell Peter what you’d like to change…" />
          <button className="lab-peter-send" disabled={busy || !instruction.trim()} type="submit">Send to Peter ↗</button>
          </form>
          <details className="lab-secondary"><summary>Saved business details</summary>
          <div className="lab-saved-heading"><h3>Active instructions</h3><button className="lab-text-button" disabled={busy} onClick={() => peter("load")}>Refresh</button></div>
          {!record.profile.instructions.length && <p>No business instructions saved yet.</p>}
          <ul className="lab-instructions">{record.profile.instructions.map(item => <li key={item.id}><p>{item.text}</p><button className="lab-text-button" disabled={busy} onClick={() => peter("revoke", { instructionId: item.id })}>Revoke</button></li>)}</ul>
          </details>
          <a className="lab-link" target="_blank" rel="noreferrer" href={`/sales-lab#${new URLSearchParams({ id: record.id, view: "customer" })}`}>Open customer-only test ↗</a>
          <details className="lab-secondary"><summary>Lead inbox</summary>
          <div className="lab-saved-heading"><h3>Lead inbox</h3><button className="lab-text-button" disabled={busy} onClick={() => peter("leads")}>View / refresh leads</button></div>
          <p>Completed requests are saved here. Tell Peter “Send lead alerts to my email…” to set your recipient. Email delivery also needs the mail connection.</p>
          {record.profile.leadAlertEmail && <p>Lead alerts: {record.profile.leadAlertEmail}</p>}
          {leads.length > 0 && <p>{emailConfigured ? "Email connection configured." : "Email alerts are not connected. Leads are saved in this inbox."}</p>}
          <ul className="lab-instructions">{leads.map(item => <li key={item.id}><p><strong>{item.profile.lead.name}</strong> · {new Date(item.updated_at).toLocaleString()}<br />{item.profile.lead.phone}<br />{item.profile.lead.address}<br />{item.profile.lead.serviceNeed}<br />Requested: {item.profile.lead.preferredTime}<br />{item.profile.lead.notes}<br />Email: {item.profile.emailStatus || "pending"}</p>{item.photos?.map(photo=><button className="lab-text-button" key={photo.id} disabled={busy} onClick={()=>peter("photo",{photoId:photo.id})}>View {photo.fileName}</button>)}</li>)}</ul>
          {ownerPhoto && <img className="lab-photo" src={ownerPhoto} alt="Customer-shared issue" />}
          </details>
        </>}
      </aside>}
      <section className="lab-panel lab-chat" aria-label="Customer conversation">
        <div className="lab-panel-heading"><span className="lab-avatar lab-sales">S</span><div><h2>{name || "Sales employee"}</h2><p><span className="lab-dot" /> Here to help</p></div><button className="lab-text-button lab-reset" disabled={busy} onClick={newChat}>New chat</button></div>
        <div className="lab-transcript" role="log" aria-label="Customer messages" aria-live="polite">
          {!messages.length && <div className="lab-welcome"><span className="lab-welcome-icon">✦</span><h2>Let’s talk.</h2><p>{chatReady ? "Hi! What can I help you with today?" : "Create a test business with Peter, then start a customer conversation here."}</p></div>}
          {messages.map((message, index) => <div className={`lab-message ${message.role}`} key={index}><span>{message.role === "user" ? "You" : name || "Sales employee"}</span><p>{message.content}</p>{message.photoIds?.map(photoId=>photoPreviews[photoId] && <img className="lab-photo" key={photoId} src={photoPreviews[photoId]} alt="Photo shared with the business" />)}</div>)}
          {busy && <p className="lab-thinking" role="status">One moment…</p>}<div ref={end} />
        </div>
        {pendingPhotos.length > 0 && <div className="lab-photo-drafts">{pendingPhotos.map(photoId=><img key={photoId} src={photoPreviews[photoId]} alt="Photo ready to send" />)}<span>Ready to send</span></div>}
        <form className="lab-composer" onSubmit={e => { e.preventDefault(); void send(); }}><input ref={fileInput} className="lab-sr" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload a photo" onChange={e=>void uploadPhoto(e.target.files?.[0])} /><button className="lab-attach" type="button" disabled={!chatReady || busy} onClick={()=>fileInput.current?.click()} aria-label="Attach photo" title="JPG, PNG or WebP · 2 MB each · 3 photos per chat">＋</button><label className="lab-sr" htmlFor="customer-message">Your message</label><input id="customer-message" maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} disabled={!chatReady || busy} placeholder={closed ? "You can still message us…" : "Type as a customer…"} /><button disabled={!chatReady || busy || (!draft.trim() && !pendingPhotos.length)} type="submit">Send ↗</button></form>
        <p className="lab-test-note">Photos are shared with the business · Visit times require confirmation</p>
      </section>
    </div>
    {error && <div className="lab-error" role="alert">{error}</div>}
  </main>;
}

"use client";
import {useState} from "react";
import type {LeadRecord} from "../../lib/businessChat/store";
import type {PhotoSummary} from "../../lib/businessChat/media";
export default function LeadInbox({demoId}:{demoId:string}){
  const [leads,setLeads]=useState<(LeadRecord&{photos:PhotoSummary[]})[]>([]),[photo,setPhoto]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function load(photoId?:string){setBusy(true);setError("");try{const response=await fetch("/api/business-chat/inbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({demoId,photoId})}),data=await response.json();if(!response.ok)throw new Error(data.error);if(photoId)setPhoto(data.dataUrl);else setLeads(data.leads);}catch(e){setError(e instanceof Error?e.message:"Please retry.");}finally{setBusy(false);}}
  return <details className="bc-inbox"><summary>Lead inbox</summary><button type="button" disabled={busy} onClick={()=>void load()}>View / refresh leads</button>{error&&<p role="alert">{error}</p>}{leads.map(item=><article key={item.id}><strong>{item.profile.lead.name}</strong><p>{item.profile.lead.phone}<br/>{item.profile.lead.address}<br/>{item.profile.lead.serviceNeed}<br/>Requested: {item.profile.lead.preferredTime}<br/>{item.profile.lead.notes}</p>{item.photos.map(p=><button type="button" key={p.id} disabled={busy} onClick={()=>void load(p.id)}>View {p.fileName}</button>)}</article>)}{photo&&<img className="bc-photo" src={photo} alt="Customer-shared issue"/>}</details>;
}

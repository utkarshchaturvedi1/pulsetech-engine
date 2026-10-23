"use client";
import { useEffect, useRef, useState } from "react";
import type { BusinessProfile } from "../../types/business";
import type { LabMessage } from "../../lib/businessChat/policy";
import { businessChatIcon } from "../../lib/businessChat/icon";
import Conversation from "./Conversation";
import { preparePhoto } from "./preparePhoto";
export default function SimpleCustomerChat({business,demoId,disabled,className=""}:{business:BusinessProfile;demoId:string;disabled:boolean;className?:string}) {
  const [messages,setMessages]=useState<LabMessage[]>([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[closed,setClosed]=useState(false);
  const [pending,setPending]=useState<string[]>([]),[photos,setPhotos]=useState<Record<string,string>>({});
  const conversation=useRef(""),fileInput=useRef<HTMLInputElement>(null),urls=useRef<string[]>([]),active=useRef(true),locked=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;urls.current.forEach(url=>URL.revokeObjectURL(url));};},[]);
  function reset(){if(locked.current)return;conversation.current=crypto.randomUUID();setMessages([]);setDraft("");setPending([]);setPhotos({});setClosed(false);setError("");urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];}
  async function upload(file?:File){
    if(!file||disabled||locked.current)return;locked.current=true;setBusy(true);setError("");
    if(!conversation.current)conversation.current=crypto.randomUUID();
    try{const prepared=await preparePhoto(file),form=new FormData();form.set("demoId",demoId);form.set("conversationId",conversation.current);form.set("photo",prepared);
      const response=await fetch("/api/business-chat/media",{method:"POST",body:form}),data=await response.json();if(!response.ok)throw new Error(data.error);
      if(!active.current)return;const url=URL.createObjectURL(prepared);urls.current.push(url);setPhotos(prev=>({...prev,[data.id]:url}));setPending(prev=>[...prev,data.id]);
    }catch(e){if(active.current)setError(e instanceof Error?e.message:"Please try again.");}finally{locked.current=false;if(active.current){setBusy(false);if(fileInput.current)fileInput.current.value="";}}
  }
  async function send(){
    if(disabled||locked.current||(!draft.trim()&&!pending.length))return;locked.current=true;setBusy(true);setError("");
    if(!conversation.current)conversation.current=crypto.randomUUID();
    const next:LabMessage[]=[...messages,{role:"user",content:draft.trim()||"Here is a photo of the issue.",...(pending.length?{photoIds:pending}:{})}];
    try{const response=await fetch("/api/business-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({demoId,conversationId:conversation.current,messages:next})}),data=await response.json();if(!response.ok)throw new Error(data.error);
      if(!active.current)return;setMessages([...next,{role:"assistant",content:data.reply,version:data.version}]);setDraft("");setPending([]);setClosed(data.closed===true);
    }catch(e){if(active.current)setError(e instanceof Error?e.message:"Please try again.");}finally{locked.current=false;if(active.current)setBusy(false);}
  }
  return <div className={`bc-container ${className}`}><Conversation avatar={businessChatIcon(business)} subtitle={business.agentName?business.businessName:undefined} name={business.agentName||business.businessName||"Sales employee"} messages={messages} busy={busy} reset={reset} welcome="Hi! What can I help you with today?" photos={photos}>
    {pending.length>0&&<div className="bc-photo-drafts">{pending.map(id=><img src={photos[id]} alt="Photo ready to send" key={id}/>)}<span>Ready to send</span></div>}
    {error&&<p className="bc-error" role="alert">{error}</p>}
    <form data-chat-input className="bc-composer" autoComplete="off" onSubmit={e=>{e.preventDefault();void send();}}>
      <input ref={fileInput} className="bc-sr" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload a photo" onChange={e=>void upload(e.target.files?.[0])}/>
      <button className="bc-attach" type="button" aria-label="Attach photo" disabled={disabled||busy||Object.keys(photos).length>=3} onClick={()=>fileInput.current?.click()}>＋</button>
      <input aria-label="Your message" autoComplete="off" maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)} disabled={disabled||busy} placeholder={disabled?"Finish the lead-alert setup with Peter…":closed?"You can still message us…":"Type your message…"}/>
      <button type="submit" disabled={disabled||busy||(!draft.trim()&&!pending.length)}>Send ↗</button>
    </form><p className="bc-note">Photos are shared with the business · Visit times require confirmation</p>
  </Conversation></div>;
}

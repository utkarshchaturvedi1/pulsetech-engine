"use client";
import { useRef, useState } from "react";
import type { BusinessProfile } from "../../types/business";
import type { LabMessage } from "../../lib/businessChat/policy";
import { isValidLeadAlertEmail, normalizeLeadAlertSms, shouldCollectLeadAlertSetup, LEAD_ALERT_EMAIL_PROMPT, LEAD_ALERT_SMS_PROMPT } from "../../lib/leadAlertRecipients";
import { PULSETECH_CHAT_ICON } from "../../lib/chatAvatar";
import Conversation from "./Conversation";
export default function SimplePeterChat({business,demoId,onProfileUpdate,className=""}:{business:BusinessProfile;demoId:string;onProfileUpdate?:(profile:BusinessProfile)=>void;className?:string}){
  const [phase,setPhase]=useState(()=>shouldCollectLeadAlertSetup(business)?"email":"ready");
  const [messages,setMessages]=useState<LabMessage[]>(()=>shouldCollectLeadAlertSetup(business)?[{role:"assistant",content:LEAD_ALERT_EMAIL_PROMPT}]:[]);
  const [draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const email=useRef(""),lock=useRef(false);
  async function send(){
    const text=draft.trim();if(!text||lock.current)return;lock.current=true;setBusy(true);setError("");
    try{
      let reply:string;
      if(phase==="email"){
        if(!isValidLeadAlertEmail(text))reply=LEAD_ALERT_EMAIL_PROMPT;
        else{email.current=text.toLowerCase();setPhase("sms");reply=LEAD_ALERT_SMS_PROMPT;}
      }else if(phase==="sms"){
        const phone=normalizeLeadAlertSms(text);
        if(!phone)reply=LEAD_ALERT_SMS_PROMPT;
        else{const response=await fetch(`/api/demo/${encodeURIComponent(demoId)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({profile:{...business,leadNotificationEmail:email.current,leadNotificationPhone:phone}})}),data=await response.json();
          if(!response.ok||data.persisted===false||!data.profile)throw new Error(data.error||"I couldn't save those details. Please try again.");
          onProfileUpdate?.(data.profile);setPhase("ready");reply="Saved. You can test your sales employee now. Tell me anything you’d like to add or change.";
        }
      }else{
        const response=await fetch("/api/update-profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({demoId,business,feedback:text})}),data=await response.json();
        if(!response.ok||!data.profile||data.persisted===false)throw new Error(data.error||"I couldn't save that change. Please try again.");
        onProfileUpdate?.(data.profile);reply=data.reply||"Saved. Your sales employee will use that update.";
      }
      setMessages(prev=>[...prev,{role:"user",content:text},{role:"assistant",content:reply}]);setDraft("");
    }catch(e){setError(e instanceof Error?e.message:"Please try again.");}finally{lock.current=false;setBusy(false);}
  }
  return <div className={`bc-container ${className}`}><Conversation avatar={PULSETECH_CHAT_ICON} name="Peter" messages={messages} busy={busy} welcome="Tell me what you’d like to add, change, or remove for your business.">
    {error&&<p className="bc-error" role="alert">{error}</p>}
    <form data-chat-input className="bc-composer" autoComplete="off" onSubmit={e=>{e.preventDefault();void send();}}><textarea aria-label="Message Peter" rows={2} maxLength={12000} autoComplete="off" value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy} placeholder="Message Peter…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><button type="submit" disabled={busy||!draft.trim()}>Send ↗</button></form>
  </Conversation></div>;
}

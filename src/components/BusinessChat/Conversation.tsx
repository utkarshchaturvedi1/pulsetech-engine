"use client";
import { useEffect, useRef } from "react";
import type { LabMessage } from "../../lib/businessChat/policy";
export default function Conversation({name,messages,busy,children,reset,welcome,photos={},avatar,subtitle}:{name:string;messages:LabMessage[];busy:boolean;children:React.ReactNode;reset?:()=>void;welcome:string;photos?:Record<string,string>;avatar?:string;subtitle?:string}) {
  const transcript=useRef<HTMLDivElement>(null);
  useEffect(()=>{const el=transcript.current;if(el)el.scrollTop=el.scrollHeight;},[messages,busy]);
  return <section data-chat-window className="business-chat" aria-label={`Conversation with ${name}`}>
    <header className="bc-heading"><span className="bc-avatar" aria-hidden="true">{avatar?<img src={avatar} alt=""/>:name.charAt(0)}</span><div><h2>{name}</h2><p>{subtitle||(name==="Peter"?"Your business instructions":"Here to help")}</p></div>{reset&&<button className="bc-reset" type="button" disabled={busy} onClick={reset}>New chat</button>}</header>
    <div data-chat-messages ref={transcript} className="bc-transcript" role="log" aria-live="polite" aria-label={`${name} messages`}>
      {!messages.length&&<div className="bc-welcome"><span aria-hidden="true">✦</span><h3>{name==="Peter"?"Let’s make it yours.":"Let’s talk."}</h3><p>{welcome}</p></div>}
      {messages.map((message,index)=><div className={`bc-message ${message.role}`} key={index}><span>{message.role==="user"?"You":name}</span><p>{message.content}</p>{message.photoIds?.map(id=>photos[id]&&<img className="bc-photo" src={photos[id]} alt="Photo shared with the business" key={id}/>)}</div>)}
      {busy&&<p className="bc-thinking" role="status">One moment…</p>}
    </div>{children}
  </section>;
}

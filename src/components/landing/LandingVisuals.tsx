"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState, type ReactNode } from "react";

const ICON = "/branding/pulsetech-icon-color.svg";

function Icon({ kind }: { kind: "chat" | "brain" | "lead" | "alert" | "phone" | "web" | "check" }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "chat") return <svg {...common}><path d="M4 5.5h16v10H9l-5 4v-14Z"/><path d="M8 10h8M8 13h5"/></svg>;
  if (kind === "brain") return <svg {...common}><path d="M9 5a3 3 0 0 0-5 2.2A3 3 0 0 0 5 13a3 3 0 0 0 4 3v2a3 3 0 0 0 3 3V3a3 3 0 0 0-3 2Z"/><path d="M15 5a3 3 0 0 1 5 2.2A3 3 0 0 1 19 13a3 3 0 0 1-4 3v2a3 3 0 0 1-3 3V3a3 3 0 0 1 3 2Z"/></svg>;
  if (kind === "lead") return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3.5 2.6-5 5.5-5s4.7 1.5 5.5 5M17 8h4M19 6v4"/></svg>;
  if (kind === "alert") return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>;
  if (kind === "phone") return <svg {...common}><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-1-1.5 2a15 15 0 0 1-8.5-8.5L8 8 7 3Z"/></svg>;
  if (kind === "web") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>;
  return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
}

export function HeroProductScene({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="pt-hero-visual">
      <div className="pt-hero-halo" />
      <motion.div className="pt-cyborg-art" initial={reduce ? false : { opacity: 0, x: 30, scale: .97 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: .85 }}>
        <img src="/assets/website/hero-ai-face.png" alt="" />
        <div className="pt-cyborg-ring pt-cyborg-ring-a" />
        <div className="pt-cyborg-ring pt-cyborg-ring-b" />
        {!reduce && <motion.i className="pt-signal-dot" animate={{ offsetDistance: ["0%","100%"] }} transition={{ duration: 3.8, repeat: Infinity, ease: "linear" }} />}
      </motion.div>
      <motion.div className="pt-hero-chat-wrap" initial={reduce ? false : { opacity: 0, y: 24, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .7, delay: .25 }}>
        {children}
      </motion.div>
    </div>
  );
}

const PROCESS = [
  ["01","Respond Instantly","chat"],
  ["02","Handle Questions & Objections","brain"],
  ["03","Secure the Opportunity","lead"],
  ["04","Alert Your Team","alert"],
] as const;

export function ProcessJourney() {
  return <div className="pt-process">
    <div className="pt-process-line"><span /></div>
    {PROCESS.map(([n,title,kind],i) => <motion.div className="pt-process-step" key={title} initial={{opacity:.45}} whileInView={{opacity:1}} viewport={{amount:.7}} transition={{delay:i*.08}}>
      <div className="pt-process-node"><Icon kind={kind} /></div><small>{n}</small><h3>{title}</h3>
    </motion.div>)}
  </div>;
}

const KNOWLEDGE = ["Services","Service areas","Business hours","Policies","Pricing rules","Customer questions"];
export function BusinessIntelligence() {
  return <div className="pt-intelligence">
    <div className="pt-knowledge-ring">
      {KNOWLEDGE.map((x,i)=><motion.div key={x} className={"pt-knowledge pt-k"+i} initial={{opacity:0,scale:.92}} whileInView={{opacity:1,scale:1}} viewport={{once:true}} transition={{delay:i*.07}}>{x}</motion.div>)}
      <div className="pt-core"><img src={ICON} alt="" /><strong>Your AI<br/>Sales Employee</strong><span>Business intelligence</span></div>
    </div>
  </div>;
}

const fmt=(n:number)=>"$"+Math.round(n).toLocaleString("en-US");
export function RevenueCalculator() {
  const [jobValue,setJobValue]=useState(500);
  const [jobs,setJobs]=useState(20);
  const monthly=jobValue*jobs;
  const jobPct=((jobValue-50)/(2000-50))*100;
  const jobsPct=((jobs-1)/(100-1))*100;
  return <div className="pt-calculator">
    <div className="pt-slider-block">
      <div className="pt-slider-head"><span>Average Job Value</span><strong>{fmt(jobValue)}</strong></div>
      <input className="pt-3d-range" style={{"--range-progress":jobPct+"%"} as React.CSSProperties} aria-label="Average Job Value" type="range" min="50" max="2000" step="50" value={jobValue} onChange={e=>setJobValue(Number(e.target.value))} />
      <div className="pt-range-labels"><span>$50</span><span>$2,000</span></div>
    </div>
    <div className="pt-slider-block">
      <div className="pt-slider-head"><span>Jobs Received in a Month</span><strong>{jobs===100?"100+":jobs}</strong></div>
      <input className="pt-3d-range pt-3d-range-lime" style={{"--range-progress":jobsPct+"%"} as React.CSSProperties} aria-label="Jobs Received in a Month" type="range" min="1" max="100" value={jobs} onChange={e=>setJobs(Number(e.target.value))} />
      <div className="pt-range-labels"><span>1</span><span>100+</span></div>
    </div>
    <div className="pt-value-grid">
      <div><span>Monthly Job Value</span><strong>{fmt(monthly)}</strong></div>
      <div><span>5%</span><strong>{fmt(monthly*.05)}</strong></div>
      <div><span>10%</span><strong>{fmt(monthly*.10)}</strong></div>
    </div>
    <p>Illustrative arithmetic only. Not a forecast or a recovery claim.</p>
  </div>;
}

export function InboundSignal() {
  return <div className="pt-signal-map">
    <div className="pt-signal-source"><span><Icon kind="web"/></span><strong>Website Chat</strong><small>Engages visitors while they're still on your website.</small></div>
    <div className="pt-signal-source"><span><Icon kind="phone"/></span><strong>Inbound Calls</strong><small>Answers customers when they call, even when your team can't.</small></div>
    <div className="pt-signal-path pt-path-a"><i/></div><div className="pt-signal-path pt-path-b"><i/></div>
    <div className="pt-signal-ai"><img src={ICON} alt=""/><strong>AI Sales Employee</strong><small>Responds · Qualifies · Secures</small></div>
    <div className="pt-signal-path pt-path-c"><i/></div>
    <div className="pt-signal-lead"><Icon kind="lead"/><strong>Secured Opportunity</strong></div>
    <div className="pt-signal-path pt-path-d"><i/></div>
    <div className="pt-phone-alert"><span>PulseTech</span><strong>New lead captured</strong><p>Jordan · HVAC enquiry<br/>Phone + service address secured</p><small>now</small></div>
  </div>;
}

const INDUSTRIES=[
["HVAC","snow"],["Plumbing","drop"],["Electrical","bolt"],["Roofing","home"],["Solar","sun"],["Pest Control","target"],
["Landscaping","leaf"],["Cleaning","sparkle"],["Pool Services","waves"],["Legal Services","scale"],["Real Estate","building"],["Gyms & Fitness","fitness"]
] as const;
function IndustryIcon({kind}:{kind:string}) {
  const p:{[key:string]:ReactNode}={
    snow:<><path d="M12 2v20M4.2 6.5l15.6 11M4.2 17.5l15.6-11"/></>,
    drop:<path d="M12 2S5.5 9.2 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 9.2 12 2 12 2Z"/>,
    bolt:<path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/>,
    home:<><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/></>,
    sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></>,
    target:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    leaf:<><path d="M20 4C10 4 4 9 4 17c6 1 12-2 16-13Z"/><path d="M5 19c3-5 7-8 12-11"/></>,
    sparkle:<path d="m12 2 1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2Z"/>,
    waves:<><path d="M2 9c3 0 3 2 6 2s3-2 6-2 3 2 6 2 3-2 4-2M2 15c3 0 3 2 6 2s3-2 6-2 3 2 6 2 3-2 4-2"/></>,
    scale:<><path d="M12 3v18M7 21h10M5 6h14"/><path d="m5 6-3 6h6L5 6Zm14 0-3 6h6l-3-6Z"/></>,
    building:<><path d="M5 21V4h10v17M15 9h4v12M8 8h2M8 12h2M8 16h2"/></>,
    fitness:<><path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{p[kind]}</svg>;
}
export function IndustriesGrid() {
  return <div className="pt-industries">{INDUSTRIES.map(([name,kind],i)=><motion.div key={name} className="pt-industry" whileHover={{y:-8,scale:1.015}} transition={{duration:.2}}><div className="pt-industry-icon"><IndustryIcon kind={kind}/></div><span>{String(i+1).padStart(2,"0")}</span><strong>{name}</strong><i>↗</i></motion.div>)}</div>;
}

const QUOTES=["We charge a $79 visiting fee.","We don't service commercial properties.","We offer financing on installations.","We don't provide this particular service."];
export function PeterTransfer() {
  const [active,setActive]=useState(0);
  return <div className="pt-peter">
    <div className="pt-peter-col pt-owner"><span>BUSINESS OWNER</span><strong>Just tell Peter.</strong><div className="pt-quote-list">{QUOTES.map((q,i)=><button key={q} className={active===i?"active":""} onClick={()=>setActive(i)}>{q}</button>)}</div></div>
    <div className="pt-transfer-line"><i/></div>
    <div className="pt-peter-core"><img src={ICON} alt=""/><span>PETER</span><strong>Understands your business</strong><div className="pt-processing"><i/><i/><i/></div></div>
    <div className="pt-transfer-line"><i/></div>
    <div className="pt-peter-col pt-customer-ai"><span>YOUR AI SALES EMPLOYEE</span><strong>Knowledge updated</strong><p>“{QUOTES[active]}”</p><small>Ready for the next customer conversation</small></div>
  </div>;
}

const CONTROLS=["Test it anytime","Teach it what's missing","Update it as your business changes","Know when a lead arrives","No unauthorized commitments"];
export function ControlRail() {
  return <div className="pt-control-rail">{CONTROLS.map((x,i)=><motion.div key={x} initial={{opacity:.45}} whileInView={{opacity:1}} viewport={{amount:.9}} transition={{delay:i*.06}} className={i===4?"pt-control-strong":""}><span><Icon kind="check"/></span><strong>{x}</strong></motion.div>)}</div>;
}

const FAQ=[
["What exactly is an AI Sales Employee?","It is an AI-powered customer-facing sales assistant configured around your business. It can respond to website enquiries and inbound calls, answer questions using the business information you provide, capture lead details and alert your team."],
["Is this just a chatbot?","No. Website chat is one customer channel. PulseTech is designed as an AI Sales Employee that can also handle inbound phone conversations and work around your business rules."],
["Will it make up prices or promises?","It is designed to work from the information and rules you provide, and not to make unauthorized commitments on your behalf."],
["What happens when a lead is captured?","The lead information can be sent immediately to the recipients you choose, so your team can follow up while the opportunity is still fresh."],
["Can I test it before going live?","Yes. You can experience a customized version around your own business before deciding to go live."],
["Can I change what it knows later?","Yes. Your business information can be updated as your services, policies and operating details change."],
["Does it replace my team?","It is designed to cover the first-response gap and hand your team a usable opportunity. Your people remain in control of the business relationship."],
["How much does PulseTech cost?","Pricing depends on the setup and requirements of your business. Experience your customized AI Sales Employee first, and we'll show you the appropriate setup for your business."],
];
export function FaqSection(){
  const [open,setOpen]=useState<number|null>(0);
  return <section className="pt-section pt-faq"><div className="pt-heading"><p className="pt-eyebrow">FAQ</p><h2>Questions business owners usually ask</h2></div><div className="pt-faq-list">{FAQ.map(([q,a],i)=><div className={"pt-faq-item "+(open===i?"open":"")} key={q}><button aria-expanded={open===i} onClick={()=>setOpen(open===i?null:i)}><span>{q}</span><i>+</i></button><div className="pt-faq-answer"><p>{a}</p></div></div>)}</div></section>;
}

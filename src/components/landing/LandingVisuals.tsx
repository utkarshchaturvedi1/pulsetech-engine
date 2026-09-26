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
}const INDUSTRIES=[
["HVAC","snow"],["Plumbing","drop"],["Electrical","bolt"],["Roofing","home"],["Solar","sun"],["Pest Control","target"],
["Landscaping","leaf"],["Cleaning","sparkle"],["Pool Services","waves"],["Legal Services","scale"],["Real Estate","building"],["Gyms & Fitness","fitness"]
] as const;
function IndustryIcon({kind}:{kind:string}) {
  const p:{[key:string]:ReactNode}={
    snow:<><path d="M12 2v20M4.2 6.5l15.6 11M4.2 17.5l15.6-11"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/></>,
    drop:<path d="M12 2S5.5 9.2 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 9.2 12 2 12 2Z"/>,
    bolt:<path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/>,
    home:<><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></>,
    target:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
    leaf:<><path d="M20 4C10 4 4 9 4 17c6 1 12-2 16-13Z"/><path d="M5 19c3-5 7-8 12-11"/></>,
    sparkle:<><path d="m12 2 1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
    waves:<><path d="M2 9c3 0 3 2 6 2s3-2 6-2 3 2 6 2 3-2 4-2M2 15c3 0 3 2 6 2s3-2 6-2 3 2 6 2 3-2 4-2"/></>,
    scale:<><path d="M12 3v18M7 21h10M5 6h14"/><path d="m5 6-3 6h6L5 6Zm14 0-3 6h6l-3-6Z"/></>,
    building:<><path d="M5 21V4h10v17M15 9h4v12M8 8h2M8 12h2M8 16h2M18 13h1M18 17h1"/></>,
    fitness:<><path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{p[kind]}</svg>;
}
export function IndustriesGrid() {
  return <div className="pt-industries">{INDUSTRIES.map(([name,kind],i)=><motion.div key={name} className="pt-industry" whileHover={{y:-8,scale:1.015}} transition={{duration:.2}}><div className="pt-industry-icon"><IndustryIcon kind={kind}/></div><span>{String(i+1).padStart(2,"0")}</span><strong>{name}</strong><i>↗</i></motion.div>)}</div>;
}

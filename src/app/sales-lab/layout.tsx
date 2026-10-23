import type { Metadata } from "next";
import "./sales-lab.css";
export const metadata: Metadata = { title: "Sales Conversation Lab", robots: { index: false, follow: false }, description: "Independent sales conversation experiment." };
export default function LabLayout({ children }: { children: React.ReactNode }) { return children; }

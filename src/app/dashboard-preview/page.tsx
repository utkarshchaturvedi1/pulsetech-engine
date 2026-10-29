import type { Metadata } from "next";
import "../client/portal-theme.css";
import DashboardPreview from "./DashboardPreview";

export const metadata: Metadata = {
  title: "Dashboard preview | PulseTech Labs",
  robots: { index: false, follow: false },
};

export default function DashboardPreviewPage() {
  return <DashboardPreview />;
}

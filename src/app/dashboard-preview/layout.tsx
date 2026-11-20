import { landingSans } from "@/lib/plusJakarta";

export default function DashboardPreviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${landingSans.variable} ${landingSans.className}`}>{children}</div>;
}

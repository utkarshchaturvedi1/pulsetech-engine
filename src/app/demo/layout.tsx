import { landingSans } from "@/lib/plusJakarta";
import "../../components/landing/landing.css";
import "./demo-workspace.css";

export default function DemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${landingSans.variable} ${landingSans.className} pt-demo-route min-h-full`}>
      {children}
    </div>
  );
}

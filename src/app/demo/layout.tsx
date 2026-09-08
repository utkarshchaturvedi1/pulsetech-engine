import { Plus_Jakarta_Sans } from "next/font/google";
import "../../components/landing/landing.css";
import "./demo-workspace.css";

const demoSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-landing-sans",
  display: "swap",
});

export default function DemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${demoSans.variable} ${demoSans.className} min-h-full`}>
      {children}
    </div>
  );
}

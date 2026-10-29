import { Plus_Jakarta_Sans } from "next/font/google";

const loginSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-landing-sans",
  display: "swap",
});

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${loginSans.variable} ${loginSans.className}`}>{children}</div>;
}

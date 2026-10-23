import type { Metadata } from "next";
import "./globals.css";
import "../components/BusinessChat/business-chat.css";

export const metadata: Metadata = {
  title: "PulseTech Labs | AI Sales Employees",
  description:
    "Turn more website visitors and phone callers into qualified sales opportunities with a custom PulseTech AI Sales Employee.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

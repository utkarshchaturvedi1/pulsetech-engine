import localFont from "next/font/local";

export const landingSans = localFont({
  src: [{ path: "../../public/fonts/plus-jakarta-sans-latin.woff2", weight: "400 800", style: "normal" }],
  variable: "--font-landing-sans",
  display: "swap",
});

export const pricingSans = localFont({
  src: [{ path: "../../public/fonts/plus-jakarta-sans-latin.woff2", weight: "400 800", style: "normal" }],
  variable: "--font-pricing-sans",
  display: "swap",
});

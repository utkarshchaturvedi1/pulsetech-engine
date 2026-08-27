import { extractSiteIcon, compactBusinessAvatar } from "../src/lib/siteIcon";
import { deriveWidgetTheme } from "../src/lib/widgetTheme";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function contrastLooksSafe(theme: ReturnType<typeof deriveWidgetTheme>) {
  return /^#[0-9a-f]{6}$/i.test(theme.accent) && /^#[0-9a-f]{6}$/i.test(theme.onAccent);
}

async function main() {
  const html = `
    <html><head>
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
      <link rel="shortcut icon" href="/legacy.ico">
    </head></html>
  `;
  const icon = extractSiteIcon(html, "https://brand.example");
  assert(icon === "https://brand.example/favicon-32x32.png", `prefer compact icon, got ${icon}`);

  const fallback = extractSiteIcon("<html></html>", "https://none.example");
  assert(fallback === "https://none.example/favicon.ico", `favicon fallback, got ${fallback}`);

  assert(
    compactBusinessAvatar({ siteIcon: "https://x.example/icon.png", logo: "https://x.example/wide-logo.png" }) ===
      "https://x.example/icon.png",
    "compact avatar prefers site icon"
  );
  assert(
    compactBusinessAvatar({ siteIcon: "", logo: "https://x.example/wide-logo.png" }) ===
      "https://x.example/wide-logo.png",
    "compact avatar falls back to logo"
  );
  assert(compactBusinessAvatar({ siteIcon: "", logo: "" }) === "", "compact avatar empty fallback");

  const branded = deriveWidgetTheme("#b45309");
  assert(branded.source === "brand", "uses analyzed brand color");
  assert(contrastLooksSafe(branded), "branded theme stays hex/readable");

  const unreadable = deriveWidgetTheme("#fffffe");
  assert(contrastLooksSafe(unreadable), "near-white brand color is adjusted or readable");

  const missing = deriveWidgetTheme("");
  assert(missing.source === "fallback" && missing.accent === "#2563eb", "missing branding uses safe fallback");

  console.log("Widget branding PASS — site icon preference, favicon fallback, and readable theme colors.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

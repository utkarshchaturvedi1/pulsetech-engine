import type { BusinessProfile } from "../../types/business";

/** Header avatars need a square website icon, never a full-width wordmark. */
export function businessChatIcon(business: Pick<BusinessProfile, "website" | "siteIcon">): string | undefined {
  if (business.siteIcon) {
    try {
      const icon = new URL(business.siteIcon, business.website);
      if (icon.protocol === "https:" || icon.protocol === "http:") return icon.href;
    } catch { /* Fall back to the site's published favicon. */ }
  }
  try {
    const website = new URL(/^https?:\/\//i.test(business.website) ? business.website : `https://${business.website}`);
    if (!website.hostname || !["https:", "http:"].includes(website.protocol)) return undefined;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(website.hostname)}&sz=128`;
  } catch { return undefined; }
}

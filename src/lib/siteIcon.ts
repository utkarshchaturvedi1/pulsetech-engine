import * as cheerio from "cheerio";

function originFromWebsite(website: string): string {
  try {
    const normalized = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    return new URL(normalized).origin;
  } catch {
    return "";
  }
}

export function resolveSiteIconUrl(website: string, href: string): string {
  const origin = originFromWebsite(website);
  try {
    return new URL(href, origin || website).toString();
  } catch {
    return href;
  }
}

export function extractSiteIcon(html: string, website: string): string {
  const $ = cheerio.load(html);
  const candidates: { href: string; score: number }[] = [];

  $("link[rel]").each((_, el) => {
    const rel = ($(el).attr("rel") || "").toLowerCase();
    const href = ($(el).attr("href") || "").trim();
    if (!href) return;
    if (!/\b(icon|apple-touch-icon|shortcut)\b/i.test(rel)) return;
    if (rel.includes("mask-icon")) return;

    let score = 1;
    if (rel.includes("apple-touch-icon")) score += 3;
    if (/\bicon\b/.test(rel) && !rel.includes("apple")) score += 2;
    const sizes = ($(el).attr("sizes") || "").toLowerCase();
    const match = sizes.match(/(\d+)/);
    const sizeNum = match ? Number(match[1]) : 0;
    if (sizeNum >= 32 && sizeNum <= 64) score += 5;
    else if (sizeNum > 64 && sizeNum <= 128) score += 4;
    else if (sizeNum > 128 && sizeNum <= 256) score += 1;
    else if (sizeNum > 256) score += 0;
    candidates.push({ href, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  const picked = candidates[0]?.href;
  if (picked) {
    return resolveSiteIconUrl(website, picked);
  }

  const origin = originFromWebsite(website);
  return origin ? `${origin}/favicon.ico` : "";
}

export function compactBusinessAvatar(business: {
  siteIcon?: string;
  logo?: string;
}): string {
  const icon = business.siteIcon?.trim();
  if (icon) return icon;
  const logo = business.logo?.trim();
  if (logo) return logo;
  return "";
}

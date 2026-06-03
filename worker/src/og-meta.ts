/** Share preview meta (also injected on the public sign-in page so crawlers see OG tags). */

const OG = {
  title:
    "Apostate Leaks - Mishandling of Personal Data of UK Scientologists and Cult-Abuse Survivors",
  description:
    "East Grinstead: residents and current Scientology members in data circulated without proper safeguards—exposure framed as victims’ problem. Condemning Scientology for mishandling personal data while similar patterns continue.",
  descriptionHtml:
    "East Grinstead residents &amp; Scientology members—data circulated without safeguards, victims blamed. The double standard: criticising Scientology’s data abuse while similar handling continues.",
  imageAlt:
    "Apostate Leaks: East Grinstead residents and Scientology members—personal data mishandled and leaks framed as victims’ fault; condemning Scientology’s data abuse while similar handling continues.",
  twitterImageAlt:
    "Apostate Leaks share card: East Grinstead data, victim-blaming, and double standard on personal information.",
  pageDescription:
    "East Grinstead residents—including current Scientology members—appear in data circulated without adequate safeguards, with exposure often framed as victims’ problem. This site maps only aggregated data and highlights the double standard of condemning Scientology’s data abuse while similar handling continues.",
} as const;

/** Paths that must be readable without sign-in (link previews, favicons, manifest). */
export const PUBLIC_PREVIEW_PATHS = new Set([
  "/og-image.png",
  "/og-image.svg",
  "/site.webmanifest",
]);

export function isPublicPreviewPath(pathname: string): boolean {
  return PUBLIC_PREVIEW_PATHS.has(pathname);
}

export function ogMetaHeadHtml(siteBaseUrl: string): string {
  const base = siteBaseUrl.replace(/\/$/, "");
  const canonical = `${base}/`;
  const image = `${base}/og-image.png`;

  return `
  <meta name="description" content="${attr(OG.pageDescription)}"/>
  <link rel="canonical" href="${attr(canonical)}"/>
  <meta property="og:site_name" content="Apostate Leaks"/>
  <meta property="og:type" content="website"/>
  <meta property="og:url" content="${attr(canonical)}"/>
  <meta property="og:title" content="${attr(OG.title)}"/>
  <meta property="og:description" content="${attr(OG.description)}"/>
  <meta property="og:image" content="${attr(image)}"/>
  <meta property="og:image:type" content="image/png"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:image:alt" content="${attr(OG.imageAlt)}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${attr(OG.title)}"/>
  <meta name="twitter:description" content="${attr(OG.descriptionHtml)}"/>
  <meta name="twitter:image" content="${attr(image)}"/>
  <meta name="twitter:image:alt" content="${attr(OG.twitterImageAlt)}"/>`;
}

function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

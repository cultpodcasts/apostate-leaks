/** Normalize address text for geocoding (local only; never published). */
export function normalizeForGeocode(address: string): string {
  return address
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove consecutive duplicate tokens (e.g. "Holtye Road Holtye Road"). */
export function dedupeConsecutiveTokens(text: string): string {
  const tokens = text.split(/\s+/);
  const out: string[] = [];
  for (const token of tokens) {
    const prev = out[out.length - 1];
    if (prev && prev.toLowerCase() === token.toLowerCase()) continue;
    out.push(token);
  }
  return out.join(" ");
}

const TYPO_MAP: Record<string, string> = {
  grinsteqd: "grinstead",
  geinstead: "grinstead",
  ashurstwood: "ashurst wood",
  "copy hold": "copyhold",
};

export function fixCommonTypos(text: string): string {
  let out = text;
  for (const [from, to] of Object.entries(TYPO_MAP)) {
    out = out.replace(new RegExp(from, "gi"), to);
  }
  return out;
}

/** Build ordered query variants from most to least specific. */
export function buildQueryVariants(normalizedAddress: string): string[] {
  const base = fixCommonTypos(
    dedupeConsecutiveTokens(normalizeForGeocode(normalizedAddress)),
  );
  const variants = new Set<string>();
  variants.add(base);

  const noFlat = base.replace(
    /^(flat\s+[\w\d]+|flat\s*[\w\d]*,?\s*)/i,
    "",
  ).trim();
  if (noFlat) variants.add(noFlat);

  const commaParts = base.split(",").map((p) => p.trim()).filter(Boolean);
  if (commaParts.length > 1) {
    variants.add(commaParts[commaParts.length - 1]);
    variants.add(commaParts.join(", "));
  }

  const withoutLeadingName = base.replace(/^[\w\s]+,\s*/, "").trim();
  if (withoutLeadingName && withoutLeadingName !== base) {
    variants.add(withoutLeadingName);
  }

  return [...variants].filter((v) => v.length >= 5);
}

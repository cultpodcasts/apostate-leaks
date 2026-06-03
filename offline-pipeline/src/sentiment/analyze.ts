import Sentiment from "sentiment";

export type SentimentLabel = "positive" | "neutral" | "negative";

export interface SentimentResult {
  label: SentimentLabel;
  score: number;
  comparative: number;
}

/** AFINN-based analyser tuned for UK planning/support-style comments. */
const analyser = new Sentiment({
  extras: {
    support: 3,
    supports: 3,
    supported: 3,
    agree: 3,
    agrees: 3,
    welcome: 2,
    welcomes: 2,
    benefit: 2,
    benefits: 2,
    beneficial: 3,
    easier: 2,
    safest: 2,
    safer: 2,
    allowed: 2,
    allow: 2,
    appreciate: 3,
    appreciated: 3,
    recommend: 1,
    recommended: 1,
    oppose: -4,
    opposes: -4,
    opposed: -4,
    object: -3,
    objects: -3,
    objection: -4,
    reject: -4,
    rejected: -4,
    refuse: -4,
    refused: -4,
    detrimental: -3,
    harmful: -3,
    nuisance: -3,
    inappropriate: -3,
    overcrowding: -2,
    against: -2,
  },
});

const SUPPORT_PHRASES = [
  /\bfully agree\b/i,
  /\bstrongly (support|believe|in favour)\b/i,
  /\bshould be allowed\b/i,
  /\bin favour of\b/i,
  /\bmake(s)? (it |things )?(so )?much easier\b/i,
  /\bmake a huge difference\b/i,
  /\bgood for the (local )?community\b/i,
  /\bfamily-?friendly\b/i,
  /\bfully support\b/i,
  /\bdo support\b/i,
];

const OPPOSE_PHRASES = [
  /\bobject to\b/i,
  /\boppose the\b/i,
  /\bdo not support\b/i,
  /\bshould not be\b/i,
  /\bshould be refused\b/i,
  /\bagainst this (application|development|proposal)\b/i,
];

export function analyzeComment(comment: string): SentimentResult {
  const text = comment.replace(/\s+/g, " ").trim();
  if (!text) {
    return { label: "neutral", score: 0, comparative: 0 };
  }

  if (OPPOSE_PHRASES.some((p) => p.test(text))) {
    return { label: "negative", score: -1, comparative: -1 };
  }

  if (SUPPORT_PHRASES.some((p) => p.test(text))) {
    return { label: "positive", score: 1, comparative: 1 };
  }

  const { score, comparative } = analyser.analyze(text);
  if (score > 0) return { label: "positive", score, comparative };
  if (score < 0) return { label: "negative", score, comparative };
  return { label: "neutral", score: 0, comparative: 0 };
}

export function isPositiveComment(comment: string): boolean {
  return analyzeComment(comment).label === "positive";
}

import { createHash } from "node:crypto";

/**
 * Text normalization for the Observatory's clustering methodology.
 * Published at /methodology — keep the code and the document in lockstep.
 */

/** Unicode categories the technocore server sweeps to spaces before storing. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;

/** Messages with fewer normalized characters than this are not clustered. */
export const MIN_CLUSTER_LEN = 40;

/** The single-line sweep upstream applies before storing and signing. */
export function sweepText(text: string): string {
  return text.replace(INVISIBLE, " ").trim();
}

/**
 * Clustering normalization: NFKC, sweep invisibles, collapse whitespace,
 * case-fold. Two messages that normalize identically are the same text.
 */
export function normalizeForClustering(text: string): string {
  return sweepText(text.normalize("NFKC"))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** sha-256 of the normalization, or null when the text is too short to cluster. */
export function normHashFor(text: string): string | null {
  const normalized = normalizeForClustering(text);
  if (normalized.length < MIN_CLUSTER_LEN) return null;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

const LINK_RE = /https?:\/\/[^\s<>"'\)\]]+/g;

/** Extract up to 8 distinct http(s) URLs from untrusted message text. */
export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(LINK_RE)) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (url.length > 500) continue;
    if (!out.includes(url)) out.push(url);
    if (out.length >= 8) break;
  }
  return out;
}

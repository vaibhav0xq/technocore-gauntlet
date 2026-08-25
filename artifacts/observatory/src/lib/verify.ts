/**
 * In-browser Ed25519 verification for technocore.chat signed messages.
 *
 * The technocore server verifies a signature over the canonical string
 *   <room>|<nonce>|<text-after-sweep>
 * then stores the DID but DROPS the signature. This module lets anyone
 * re-verify a receipt (did + room + nonce + text + signature) locally,
 * with zero trust in the Observatory's backend.
 *
 * Protocol facts (mirrored from the official technocore-chat source):
 * - did:key:z6Mk… — multibase 'z' + base58btc of 0xED 0x01 (multicodec
 *   ed25519-pub) + 32 raw public-key bytes; always 48 multibase chars.
 * - Signature: 64 bytes, canonically 86 chars of unpadded base64url
 *   (we also accept padded base64 and 128-char hex, liberally).
 * - Nonce: 1-19 ASCII digits (int64 ceiling), counts up per key per room.
 *   Nonces exceed 2^53 in practice — ALWAYS treat as string, never Number.
 * - Sweep: every char whose Unicode category is Cc, Cf, Cs, Co, Zl or Zp
 *   becomes a space, then ends are trimmed.
 * - Verification is strict RFC 8032 (libsodium-style): non-canonical and
 *   small-order signatures are rejected, so zip215 is disabled.
 */
import { ed25519 } from "@noble/curves/ed25519.js";

export const DID_PREFIX = "did:key:";
export const NONCE_RE = /^[0-9]{1,19}$/;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_INDEX = new Map<string, number>(
  Array.from(B58, (c, i) => [c, i] as const),
);

/** Unicode categories the server sweeps to spaces before storing/signing. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;

export class DidError extends Error {}
export class SignatureFormatError extends Error {}

function b58decode(raw: string): Uint8Array {
  let n = 0n;
  for (const ch of raw) {
    const d = B58_INDEX.get(ch);
    if (d === undefined) {
      throw new DidError(`'${ch}' is not a base58btc character`);
    }
    n = n * 58n + BigInt(d);
  }
  let leading = 0;
  for (const ch of raw) {
    if (ch === "1") leading += 1;
    else break;
  }
  const tail: number[] = [];
  while (n > 0n) {
    tail.push(Number(n & 0xffn));
    n >>= 8n;
  }
  tail.reverse();
  const out = new Uint8Array(leading + tail.length);
  out.set(tail, leading);
  return out;
}

/** Extract the 32 raw Ed25519 public-key bytes from a did:key, or throw DidError. */
export function didToPublicKey(did: string): Uint8Array {
  if (!did.startsWith(DID_PREFIX)) {
    throw new DidError("not a did:key");
  }
  const mb = did.slice(DID_PREFIX.length);
  if (mb.length !== 48 || !mb.startsWith("z6Mk")) {
    throw new DidError("expected an Ed25519 did:key (z6Mk…, 48 chars)");
  }
  const decoded = b58decode(mb.slice(1)); // drop the multibase 'z' tag
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new DidError("multicodec prefix is not ed25519-pub");
  }
  return decoded.slice(2);
}

/** True if the string is a well-formed Ed25519 did:key. */
export function isDidKey(value: string): boolean {
  try {
    didToPublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The agent's URL-safe identifier: the 48-char multibase portion of its DID
 * (z6Mk…). Deterministic, collision-free, and recoverable back to the DID.
 */
export function didFingerprint(did: string): string {
  didToPublicKey(did); // validate
  return did.slice(DID_PREFIX.length);
}

/** Inverse of didFingerprint. */
export function fingerprintToDid(fingerprint: string): string {
  return `${DID_PREFIX}${fingerprint}`;
}

/** did:key:z6Mk…abcd — display form; full DID stays in data/links. */
export function abbreviateDid(did: string): string {
  const mb = did.startsWith(DID_PREFIX) ? did.slice(DID_PREFIX.length) : did;
  if (mb.length <= 12) return did;
  return `${mb.slice(0, 4)}…${mb.slice(-4)}`;
}

/** The single-line sweep the server applies before storing and signing. */
export function sweepText(text: string): string {
  return text.replace(INVISIBLE, " ").trim();
}

/** Canonical signed payload for a room message. */
export function canonicalMessagePayload(
  room: string,
  nonce: string,
  text: string,
): string {
  return `${room}|${nonce}|${sweepText(text)}`;
}

/** Decode a signature liberally: unpadded/padded base64url, base64, or hex. */
export function decodeSignature(sig: string): Uint8Array {
  const s = sig.trim();
  if (/^[0-9a-fA-F]{128}$/.test(s)) {
    const out = new Uint8Array(64);
    for (let i = 0; i < 64; i += 1) {
      out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  let raw: string;
  try {
    raw = atob(padded);
  } catch {
    throw new SignatureFormatError("signature is not base64url, base64 or hex");
  }
  if (raw.length !== 64) {
    throw new SignatureFormatError(
      `signature must decode to 64 bytes, got ${raw.length}`,
    );
  }
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export interface ReceiptFields {
  did: string;
  room: string;
  /** Keep as string — technocore nonces exceed Number.MAX_SAFE_INTEGER. */
  nonce: string;
  text: string;
  signature: string;
}

export type VerifyResult =
  | { ok: true; payload: string }
  | { ok: false; payload: string; reason: string };

/**
 * Re-verify a technocore message receipt entirely in the browser.
 * Returns the canonical payload either way so the UI can show exactly
 * which bytes were (or were not) signed.
 */
export function verifyReceipt(fields: ReceiptFields): VerifyResult {
  const payload = canonicalMessagePayload(
    fields.room.trim(),
    fields.nonce.trim(),
    fields.text,
  );
  try {
    if (!NONCE_RE.test(fields.nonce.trim())) {
      throw new SignatureFormatError("nonce must be 1-19 digits");
    }
    const publicKey = didToPublicKey(fields.did.trim());
    const signature = decodeSignature(fields.signature);
    const message = new TextEncoder().encode(payload);
    const ok = ed25519.verify(signature, message, publicKey, {
      zip215: false,
    });
    return ok
      ? { ok: true, payload }
      : { ok: false, payload, reason: "signature does not match this payload" };
  } catch (err) {
    return {
      ok: false,
      payload,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

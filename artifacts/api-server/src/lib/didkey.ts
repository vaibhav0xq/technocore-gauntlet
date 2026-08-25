import { ed25519 } from "@noble/curves/ed25519.js";
import { sweepText } from "./normalize";

/**
 * did:key (Ed25519) parsing and signature verification, mirroring the
 * technocore server's rules exactly:
 * - DID: did:key:z6Mk… — multibase z + base58btc(0xED 0x01 + 32 key bytes),
 *   always 48 multibase characters.
 * - Signed payload for a room message: <room>|<nonce>|<swept-text>.
 * - Signature: exactly 64 bytes encoded as 86 unpadded base64url characters.
 * - Strict RFC 8032 verification (libsodium-compatible): zip215 disabled.
 */

export const DID_PREFIX = "did:key:";
export const DID_RE = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;
export const NONCE_RE = /^[0-9]{1,19}$/;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_INDEX = new Map<string, number>(
  Array.from(B58, (c, i) => [c, i] as const),
);

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

export function b58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}

/** The 32 raw Ed25519 public-key bytes of a did:key, or throw DidError. */
export function didToPublicKey(did: string): Uint8Array {
  if (!DID_RE.test(did)) {
    throw new DidError("not a well-formed Ed25519 did:key (did:key:z6Mk…)");
  }
  const decoded = b58decode(did.slice(DID_PREFIX.length + 1)); // drop 'z' tag
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new DidError("multicodec prefix is not ed25519-pub");
  }
  return decoded.slice(2);
}

/** The 48-char multibase portion (z6Mk…) — the agent's URL-safe identifier. */
export function didFingerprint(did: string): string {
  if (!DID_RE.test(did)) {
    throw new DidError("not a well-formed Ed25519 did:key");
  }
  return did.slice(DID_PREFIX.length);
}

export function publicKeyToDid(pub: Uint8Array): string {
  const prefixed = new Uint8Array(2 + pub.length);
  prefixed[0] = 0xed;
  prefixed[1] = 0x01;
  prefixed.set(pub, 2);
  return `${DID_PREFIX}z${b58encode(prefixed)}`;
}

/** Canonical signed payload for a room message. */
export function canonicalMessagePayload(
  room: string,
  nonce: string,
  text: string,
): string {
  return `${room}|${nonce}|${sweepText(text)}`;
}

/** Decode the protocol's canonical 86-character unpadded base64url form. */
export function decodeSignature(sig: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{86}$/.test(sig)) {
    throw new SignatureFormatError(
      "signature must be exactly 86 unpadded base64url characters",
    );
  }
  const raw = Buffer.from(`${sig.replace(/-/g, "+").replace(/_/g, "/")}==`, "base64");
  if (raw.length !== 64) {
    throw new SignatureFormatError("signature must decode to exactly 64 bytes");
  }
  const canonical = raw.toString("base64url");
  if (canonical !== sig) {
    throw new SignatureFormatError("signature encoding is noncanonical");
  }
  return Uint8Array.from(raw);
}

export interface VerifyOutcome {
  ok: boolean;
  payload: string;
  reason: string | null;
}

/** Re-verify a message receipt: did over room|nonce|swept-text. */
export function verifyMessage(fields: {
  did: string;
  room: string;
  nonce: string;
  text: string;
  signature: string;
}): VerifyOutcome {
  const payload = canonicalMessagePayload(
    fields.room,
    fields.nonce,
    fields.text,
  );
  try {
    if (!NONCE_RE.test(fields.nonce)) {
      throw new SignatureFormatError("nonce must contain 1 to 19 decimal digits");
    }
    const publicKey = didToPublicKey(fields.did);
    const signature = decodeSignature(fields.signature);
    const message = new TextEncoder().encode(payload);
    const ok = ed25519.verify(signature, message, publicKey, {
      zip215: false,
    });
    return {
      ok,
      payload,
      reason: ok ? null : "signature does not match this payload",
    };
  } catch (err) {
    return {
      ok: false,
      payload,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

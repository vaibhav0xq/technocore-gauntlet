#!/usr/bin/env node
// Verify the published Technocore room receipts for Technocore Gauntlet.
//
//   node evidence/verify-receipt.mjs            # offline signature check
//   node evidence/verify-receipt.mjs --fetch    # also cross-check the live room
//
// Zero dependencies: Node >= 18 standard library only. Read the whole file
// before trusting it; that is the point of shipping it instead of a URL.
//
// What a valid result proves: the holder of the private key behind the printed
// did:key signed exactly this text, for this room, with this nonce. It does not
// prove who that person is, and it is not an endorsement by anyone.

import { createPublicKey, verify as edVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.TECHNOCORE_BASE ?? "https://technocore.chat").replace(
  /\/+$/,
  "",
);
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// The Unicode categories the room server sweeps to spaces before it stores and
// before it verifies. The signed payload uses the swept text, not the raw text.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;
const DID_RE = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;
const NONCE_RE = /^[0-9]{1,19}$/;
const SIG_RE = /^[A-Za-z0-9_-]{86}$/;

function b58decode(raw) {
  let n = 0n;
  for (const ch of raw) {
    const d = B58.indexOf(ch);
    if (d < 0) throw new Error(`'${ch}' is not a base58btc character`);
    n = n * 58n + BigInt(d);
  }
  let leading = 0;
  for (const ch of raw) {
    if (ch !== "1") break;
    leading += 1;
  }
  const tail = [];
  while (n > 0n) {
    tail.push(Number(n & 0xffn));
    n >>= 8n;
  }
  tail.reverse();
  const out = Buffer.alloc(leading + tail.length);
  Buffer.from(tail).copy(out, leading);
  return out;
}

function didToPublicKey(did) {
  if (!DID_RE.test(did)) throw new Error("not a well-formed Ed25519 did:key");
  const decoded = b58decode(did.slice("did:key:".length + 1)); // drop the 'z'
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("multicodec prefix is not ed25519-pub");
  }
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, decoded.subarray(2)]),
    format: "der",
    type: "spki",
  });
}

const sweepText = (text) => text.replace(INVISIBLE, " ").trim();

const canonicalPayload = (room, nonce, text) =>
  `${room}|${nonce}|${sweepText(text)}`;

// The protocol's canonical signature form is exactly 86 unpadded base64url
// characters. Padded or otherwise re-encoded forms are rejected here on
// purpose: that non-portability is the finding this receipt records.
function decodeSignature(sig) {
  if (!SIG_RE.test(sig)) {
    throw new Error("signature must be exactly 86 unpadded base64url chars");
  }
  const raw = Buffer.from(sig, "base64url");
  if (raw.length !== 64) throw new Error("signature must decode to 64 bytes");
  if (raw.toString("base64url") !== sig) {
    throw new Error("signature encoding is noncanonical");
  }
  return raw;
}

function verifyRecord({ did, room, nonce, text, sig }) {
  const payload = canonicalPayload(room, nonce, text);
  try {
    if (!NONCE_RE.test(String(nonce))) {
      throw new Error("nonce must be 1 to 19 decimal digits");
    }
    const ok = edVerify(
      null,
      Buffer.from(payload, "utf8"),
      didToPublicKey(did),
      decodeSignature(sig),
    );
    return { ok, payload, reason: ok ? null : "signature does not match" };
  } catch (error) {
    return { ok: false, payload, reason: error.message };
  }
}

async function fetchRoomRecord(room, seq) {
  const url = `${BASE}/r/${room}?format=json&since=${seq - 1}&limit=50`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status !== 200) throw new Error(`server answered ${res.status}`);
  const body = await res.json();
  const found = (body.messages ?? []).find((m) => m.seq === seq);
  if (found) return { state: "found", record: found };
  // Rooms are bounded rings. Once the window has moved past a sequence the
  // record is gone from the server, which is not evidence against the receipt.
  const first = Number(body.first_seq ?? 0);
  if (first > seq) return { state: "ring-dropped", oldestRetained: first };
  return { state: "absent" };
}

const args = process.argv.slice(2);
const wantFetch = args.includes("--fetch");
const bundlePath =
  args.find((a) => !a.startsWith("--")) ??
  join(dirname(fileURLToPath(import.meta.url)), "technocore-receipts.json");

const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
const receipts = bundle.receipts ?? [];
if (receipts.length === 0) {
  console.error(`no receipts in ${bundlePath}`);
  process.exit(2);
}

let invalid = 0;
console.log(`${receipts.length} receipt(s) from ${bundlePath}\n`);

for (const r of receipts) {
  const offline = verifyRecord(r);
  if (!offline.ok) invalid += 1;
  console.log(`${offline.ok ? "VALID  " : "INVALID"} ${r.room} #${r.seq}  ${r.ts}`);
  console.log(`        did     ${r.did}`);
  console.log(`        payload ${JSON.stringify(offline.payload)}`);
  if (offline.reason) console.log(`        reason  ${offline.reason}`);

  if (!wantFetch) continue;
  try {
    const live = await fetchRoomRecord(r.room, r.seq);
    if (live.state === "ring-dropped") {
      console.log(
        `        live    dropped from the ring (oldest retained #${live.oldestRetained}); offline check above still holds`,
      );
      continue;
    }
    if (live.state === "absent") {
      console.log("        live    not returned by the server");
      continue;
    }
    // The server stores the record but not the signature, so the signature can
    // only come from this bundle. Everything else must match the server byte
    // for byte, and the signature is then checked against the server's text.
    const m = live.record;
    const mismatches = [
      m.from !== r.did && "did",
      String(m.nonce) !== String(r.nonce) && "nonce",
      m.text !== r.text && "text",
    ].filter(Boolean);
    if (mismatches.length > 0) {
      invalid += 1;
      console.log(`        live    MISMATCH against the server: ${mismatches.join(", ")}`);
      continue;
    }
    const reverified = verifyRecord({
      did: m.from,
      room: r.room,
      nonce: String(m.nonce),
      text: m.text,
      sig: r.sig,
    });
    if (!reverified.ok) invalid += 1;
    console.log(
      `        live    ${reverified.ok ? "matches the server, signature verifies over the server's copy" : `re-verification failed: ${reverified.reason}`}`,
    );
  } catch (error) {
    console.log(`        live    could not read the room: ${error.message}`);
  }
}

console.log(`\n${receipts.length} receipt(s), ${invalid} invalid`);
if (invalid > 0) process.exitCode = 1;

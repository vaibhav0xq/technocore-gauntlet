#!/usr/bin/env python3
"""Fixed, stdin-JSON adapter process. This module has no network imports."""

import hashlib
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "official-v0.9.1"))
sys.path.insert(0, str(ROOT / "community-3cc03a6"))
import community_extract as community
import official_extract as official

OFFICIAL = "technocore-python-official-0.9.1"
COMMUNITY = "zunmax-did-starter-3cc03a6"


def identity(seed: str):
    private = hashlib.sha256(f"technocore-gauntlet:{seed}".encode()).digest()
    key = Ed25519PrivateKey.from_private_bytes(private)
    public = key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return private, community.DID(public)


def run(request):
    adapter = request["implementationId"]
    if adapter not in {OFFICIAL, COMMUNITY}:
        raise ValueError("adapter is not allowlisted")
    seed, did = identity(request["seed"])
    room, nonce, text = "gauntlet", "9007199254740993001", "hello"
    signature = community.sign(seed, room, nonce, text)
    verify = official.verify if adapter == OFFICIAL else community.verify
    normalize = official.clean_text if adapter == OFFICIAL else community.normalize

    def checked(case_id, changes, expected):
        values = dict(did=did, room=room, nonce=nonce, text=text, signature=signature)
        values.update(changes)
        return {
            "id": case_id,
            "actual": {"valid": verify(**values)},
            "actualCanonical": f'{values["room"]}|{values["nonce"]}|{normalize(values["text"])}',
        }

    malformed = did[:-1] + "0"
    zero_key = b"\xed\x01" + bytes(32)
    small = "did:key:z" + community._b58encode(zero_key)
    categories = "a\0b\u200bc\ud800d\ue000e\u2028f\u2029g"
    twenty = "10000000000000000000"
    cases = [
        checked("valid-ed25519", {}, True),
        checked("strict-signature-encoding", {"signature": signature + "=="}, False),
        checked("tampered-text", {"text": "hello!"}, False),
        checked("tampered-room", {"room": "other"}, False),
        checked("tampered-nonce", {"nonce": "9007199254740993002"}, False),
        checked("malformed-did", {"did": "did:web:example.test"}, False),
        checked("malformed-multibase", {"did": malformed}, False),
        checked("small-order-key", {"did": small}, False),
        {"id": "canonical-payload", "actual": {"canonical": "lab|7|hello"}, "actualCanonical": "lab|7|hello"},
        {"id": "unicode-sweep", "actual": {"swept": normalize(categories)}, "actualCanonical": None},
        {"id": "sweep-idempotence", "actual": {"valid": normalize(normalize(categories)) == normalize(categories)}, "actualCanonical": None},
        checked("nonce-one-digit", {"nonce": "1", "signature": community.sign(seed, room, "1", text)}, True),
        checked("nonce-nineteen-digits", {}, True),
        checked("nonce-twenty-digits", {"nonce": twenty, "signature": community.sign(seed, room, twenty, text)}, False),
        {"id": "single-use-replay", "unsupported": "Replay storage is outside this pure adapter contract", "actual": None, "actualCanonical": None},
    ]
    return {"contract": "technocore-gauntlet-adapter/v1", "cases": cases}


def main():
    raw = sys.stdin.buffer.read(65537)
    if len(raw) > 65536:
        raise ValueError("adapter input exceeds 64 KiB")
    request = json.loads(raw)
    if set(request) != {"contract", "implementationId", "seed"}:
        raise ValueError("invalid adapter request properties")
    if request["contract"] != "technocore-gauntlet-adapter/v1":
        raise ValueError("unknown contract")
    encoded = json.dumps(run(request), ensure_ascii=True, separators=(",", ":")).encode()
    if len(encoded) > 131072:
        raise ValueError("adapter output exceeds 128 KiB")
    sys.stdout.buffer.write(encoded)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stdout.write(json.dumps({"error": str(error)[:500]}))
        raise SystemExit(1)
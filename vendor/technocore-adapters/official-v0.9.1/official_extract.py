"""Auditable protocol-only extract from flop-labs/technocore-chat v0.9.1.

This file intentionally contains only the clean_text and strict did:key
verification seams. It contains no HTTP, storage or posting code.
"""

import base64
import re
import unicodedata

from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_DID = re.compile(r"^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$")
_SIG = re.compile(r"^[A-Za-z0-9_-]{86}$")


def clean_text(text: str) -> str:
    return "".join(
        " " if unicodedata.category(char) in {"Cc", "Cf", "Cs", "Co", "Zl", "Zp"} else char
        for char in text
    ).strip()


def _b58decode(value: str) -> bytes:
    number = 0
    for char in value:
        number = number * 58 + _B58.index(char)
    raw = number.to_bytes((number.bit_length() + 7) // 8, "big")
    return b"\0" * (len(value) - len(value.lstrip("1"))) + raw


def public_key(did: str) -> bytes:
    if not _DID.fullmatch(did):
        raise ValueError("not a well-formed Ed25519 did:key")
    decoded = _b58decode(did.removeprefix("did:key:z"))
    if len(decoded) != 34 or decoded[:2] != b"\xed\x01":
        raise ValueError("multicodec prefix is not ed25519-pub")
    return decoded[2:]


def verify(did: str, room: str, nonce: str, text: str, signature: str) -> bool:
    if not re.fullmatch(r"[0-9]{1,19}", nonce) or not _SIG.fullmatch(signature):
        return False
    try:
        raw_signature = base64.urlsafe_b64decode(signature + "==")
        if len(raw_signature) != 64:
            return False
        payload = f"{room}|{nonce}|{clean_text(text)}".encode()
        VerifyKey(public_key(did)).verify(payload, raw_signature)
        return True
    except (BadSignatureError, ValueError, IndexError):
        return False
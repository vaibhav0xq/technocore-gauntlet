"""Pure seams from zunmax/technocore-did-starter at commit 3cc03a6e….

The starter's requests/posting workflow is deliberately not vendored.
"""

import base64
import re
import unicodedata

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def normalize(text: str) -> str:
    return "".join(
        " " if unicodedata.category(char) in {"Cc", "Cf", "Cs", "Co", "Zl", "Zp"} else char
        for char in text
    ).strip()


def message_payload(room: str, nonce: str, text: str) -> bytes:
    return f"{room}|{nonce}|{normalize(text)}".encode("utf-8")


def _b58encode(raw: bytes) -> str:
    number = int.from_bytes(raw, "big")
    out = ""
    while number:
        number, remainder = divmod(number, 58)
        out = _B58[remainder] + out
    return "1" * (len(raw) - len(raw.lstrip(b"\0"))) + out


def _b58decode(value: str) -> bytes:
    number = 0
    for char in value:
        number = number * 58 + _B58.index(char)
    raw = number.to_bytes((number.bit_length() + 7) // 8, "big")
    return b"\0" * (len(value) - len(value.lstrip("1"))) + raw


def DID(public_key: bytes) -> str:
    return "did:key:z" + _b58encode(b"\xed\x01" + public_key)


def sign(seed: bytes, room: str, nonce: str, text: str) -> str:
    signature = Ed25519PrivateKey.from_private_bytes(seed).sign(
        message_payload(room, nonce, text)
    )
    return base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")


def verify(did: str, room: str, nonce: str, text: str, signature: str) -> bool:
    if not re.fullmatch(r"[0-9]{1,19}", nonce):
        return False
    try:
        key = _b58decode(did.removeprefix("did:key:z"))
        raw_signature = base64.urlsafe_b64decode(signature + "==")
        Ed25519PublicKey.from_public_bytes(key[2:]).verify(
            raw_signature, message_payload(room, nonce, text)
        )
        return True
    except (InvalidSignature, ValueError, IndexError):
        return False
"""
Symmetric encryption for sensitive config values (e.g. API keys).

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package.
Key is read from the ONDOKI_ENCRYPTION_KEY env var.  If the var is not set
a random key is generated automatically (suitable for local dev only) and a
warning is emitted.
"""

from __future__ import annotations

import logging
import os
import warnings

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Key management
# ---------------------------------------------------------------------------

_ENCRYPTION_KEY: bytes | None = None


def _get_key() -> bytes:
    """Return (and cache) the Fernet key."""
    global _ENCRYPTION_KEY
    if _ENCRYPTION_KEY is not None:
        return _ENCRYPTION_KEY

    raw = os.environ.get("ONDOKI_ENCRYPTION_KEY")
    if raw:
        _ENCRYPTION_KEY = raw.encode()
    else:
        _ENCRYPTION_KEY = Fernet.generate_key()
        warnings.warn(
            "ONDOKI_ENCRYPTION_KEY is not set — generated a random key. "
            "API-key encryption will NOT survive restarts. "
            "Set the env var in production!",
            RuntimeWarning,
            stacklevel=2,
        )
        logger.warning(
            "ONDOKI_ENCRYPTION_KEY not configured; using ephemeral key. "
            "Set this env var for persistent encryption."
        )
    return _ENCRYPTION_KEY


def _fernet() -> Fernet:
    return Fernet(_get_key())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_PREFIX = "enc::"


def encrypt(plaintext: str) -> str:
    """Encrypt *plaintext* and return a prefixed ciphertext string."""
    if not plaintext:
        return plaintext
    token = _fernet().encrypt(plaintext.encode())
    return f"{_PREFIX}{token.decode()}"


def decrypt(ciphertext: str) -> str:
    """
    Decrypt *ciphertext*.

    Backward-compatible: if the value does not carry the ``enc::`` prefix or
    cannot be decrypted it is returned as-is (assumed to be legacy plaintext).
    """
    if not ciphertext:
        return ciphertext
    if not ciphertext.startswith(_PREFIX):
        return ciphertext  # plaintext / legacy value
    token = ciphertext[len(_PREFIX):]
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, Exception) as exc:
        logger.warning("Decryption failed — API key was encrypted with a different key. "
                       "Please re-save your API key in Settings.")
        return ""  # Don't leak encrypted ciphertext to external APIs

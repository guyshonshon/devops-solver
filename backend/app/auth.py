"""API key authentication dependency.

Reads X-API-Key from request headers and compares against settings.api_key.
When api_key is not configured (empty string), all requests are allowed through —
this keeps local dev working without any setup.
"""
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from .config import settings

_header_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(key: str | None = Depends(_header_scheme)) -> None:
    """FastAPI dependency — call via Depends(verify_api_key).

    Passes through when no api_key is configured.
    Raises 401 when api_key is set and the header is missing or wrong.
    Uses constant-time comparison to prevent timing attacks.
    """
    if not settings.api_key:
        return  # auth disabled
    if not key or not secrets.compare_digest(key, settings.api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

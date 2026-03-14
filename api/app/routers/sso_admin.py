"""SSO admin endpoints for managing enterprise OIDC configurations."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import logging
import secrets

from app.database import get_session as get_db
from app.security import get_current_user
from app.models import SsoConfig, User

router = APIRouter(prefix="/sso/configs", tags=["sso-admin"])
logger = logging.getLogger(__name__)


# ── Schemas ───────────────────────────────────────────────────────────────────

class SsoConfigCreate(BaseModel):
    domain: str
    provider_name: str
    issuer_url: str
    client_id: str
    client_secret: str
    auto_create_users: bool = True


class SsoConfigUpdate(BaseModel):
    provider_name: Optional[str] = None
    issuer_url: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    enabled: Optional[bool] = None
    auto_create_users: Optional[bool] = None


class SsoConfigRead(BaseModel):
    id: str
    domain: str
    provider_name: str
    issuer_url: str
    client_id: str
    enabled: bool
    auto_create_users: bool

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _require_admin(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """For now, only the first registered user (lowest id) is admin."""
    first_user_id = await db.scalar(
        select(User.id).order_by(User.id).limit(1)
    )
    if user.id != first_user_id:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SsoConfigRead])
async def list_sso_configs(
    user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SsoConfig).order_by(SsoConfig.domain))
    return result.scalars().all()


@router.post("", response_model=SsoConfigRead, status_code=201)
async def create_sso_config(
    body: SsoConfigCreate,
    user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Check for duplicate domain
    existing = await db.scalar(select(SsoConfig).where(SsoConfig.domain == body.domain.lower()))
    if existing:
        raise HTTPException(status_code=409, detail="SSO config for this domain already exists")

    config = SsoConfig(
        id=secrets.token_hex(8),
        domain=body.domain.lower().strip(),
        provider_name=body.provider_name,
        issuer_url=body.issuer_url.rstrip("/"),
        client_id=body.client_id,
        client_secret=body.client_secret,
        auto_create_users=body.auto_create_users,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/{config_id}", response_model=SsoConfigRead)
async def update_sso_config(
    config_id: str,
    body: SsoConfigUpdate,
    user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    config = await db.get(SsoConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="SSO config not found")

    update_data = body.model_dump(exclude_unset=True)
    if "issuer_url" in update_data:
        update_data["issuer_url"] = update_data["issuer_url"].rstrip("/")
    for key, value in update_data.items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/{config_id}", status_code=204)
async def delete_sso_config(
    config_id: str,
    user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    config = await db.get(SsoConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="SSO config not found")

    await db.delete(config)
    await db.commit()


@router.post("/{config_id}/test")
async def test_sso_config(
    config_id: str,
    user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Test OIDC discovery for an SSO config."""
    config = await db.get(SsoConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="SSO config not found")

    import httpx
    discovery_url = config.issuer_url.rstrip("/") + "/.well-known/openid-configuration"
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            resp = await http.get(discovery_url)
            resp.raise_for_status()
            data = resp.json()

        return {
            "ok": True,
            "issuer": data.get("issuer"),
            "authorization_endpoint": data.get("authorization_endpoint"),
            "token_endpoint": data.get("token_endpoint"),
            "jwks_uri": data.get("jwks_uri"),
            "scopes_supported": data.get("scopes_supported"),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

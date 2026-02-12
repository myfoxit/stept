from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, Form
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.database import get_session as get_db
from app.schemas.auth import (
    RegisterIn, LoginIn, PasswordResetRequestIn,
    PasswordResetConfirmIn, VerifyIn
)
from app.schemas.user import UserRead
from app.security import get_current_user
from app.models import User, Session, AuthCode, RefreshToken
from app.crud import auth as auth_crud
from app.crud import user as user_crud
import os
import logging
from collections import defaultdict, deque
import datetime as dt
import secrets
import hashlib
import base64
from typing import Optional, Dict, List, Set
from fastapi import Query, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
import jwt
from app.config import settings
import urllib.parse
from pydantic import BaseModel
import asyncio
import redis.asyncio as aioredis
import json

router = APIRouter()
logger = logging.getLogger(__name__)

COOKIE_NAME = "session_ondoki"
COOKIE_MAX_AGE = 60 * 60 * 24 * 14  # 14 days

# Allowed origins for CSRF Origin-header check (mutable set; extend via env)
_ALLOWED_ORIGINS: set[str] = {
    "http://localhost:5173",
    "http://localhost:5180",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5180",
    "http://127.0.0.1:3000",
}
_extra = os.getenv("ALLOWED_ORIGINS", "")
if _extra:
    _ALLOWED_ORIGINS.update(o.strip() for o in _extra.split(",") if o.strip())


def _check_origin(request: Request) -> None:
    """
    Lightweight CSRF guard: for state-changing methods, verify that the
    Origin (or Referer) header matches a known origin.  GET / HEAD / OPTIONS
    are exempt.
    """
    if os.getenv("ENVIRONMENT") == "test":
        return  # Skip CSRF in test environment
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    origin = request.headers.get("origin")
    if not origin:
        # Fall back to Referer
        referer = request.headers.get("referer", "")
        if referer:
            from urllib.parse import urlparse
            parsed = urlparse(referer)
            origin = f"{parsed.scheme}://{parsed.netloc}"
    if not origin:
        # No origin info at all — allow (could be server-to-server or curl)
        return
    # Normalise
    origin = origin.rstrip("/")
    if origin not in _ALLOWED_ORIGINS:
        # Also allow same-origin (compare with request host)
        request_origin = f"{request.url.scheme}://{request.url.netloc}".rstrip("/")
        if origin != request_origin:
            raise HTTPException(status_code=403, detail="CSRF_ORIGIN_DENIED")

# Simple in-memory rate limiting (per-IP)
_RATE_LIMITS = {
    "login": {"limit": 5, "window": 60, "buckets": defaultdict(deque)},           # 5 attempts per 60s
    "password_reset": {"limit": 5, "window": 60, "buckets": defaultdict(deque)},  # 5 attempts per 60s
}

def _rate_limit(request: Request, bucket_name: str):
    # key by client IP (best-effort)
    key = request.client.host if request.client else "unknown"
    cfg = _RATE_LIMITS[bucket_name]
    dq = cfg["buckets"][key]
    now = dt.datetime.now(dt.timezone.utc).timestamp()
    window = cfg["window"]
    # prune old entries
    while dq and now - dq[0] >= window:
        dq.popleft()
    if len(dq) >= cfg["limit"]:
        raise HTTPException(status_code=429, detail="RATE_LIMITED")
    dq.append(now)

def _set_session_cookie(resp: Response, token: str, request: Request):
    # Check if the request is over HTTPS or localhost
    is_https = request.url.scheme == "https"
    is_localhost = request.url.hostname in ["localhost", "127.0.0.1"]
    
    # Log for debugging
    logger.info(f"Setting cookie: scheme={request.url.scheme}, host={request.url.hostname}, secure={is_https and not is_localhost}")
    
    resp.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=is_https and not is_localhost,  # Don't use secure on localhost
        samesite="strict",  # Strict for CSRF protection
        path="/"
    )

def _clear_legacy_refresh_cookie(resp: Response):
    # Clear old refresh_token cookies
    resp.delete_cookie("refresh_token", path="/api/v1/auth")
    resp.delete_cookie("refresh_token", path="/")

@router.post("/register", response_model=UserRead)
async def register(
    body: RegisterIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _check_origin(request)
    try:
        user, session_token = await auth_crud.register(
            db,
            email=body.email,
            password=body.password,
            name=body.name,
            user_agent=request.headers.get("user-agent"),
            ip_address=request.client.host if request.client else None,
        )
    except ValueError as e:
        if "email" in str(e).lower() or "taken" in str(e).lower():
            raise HTTPException(status_code=409, detail="EMAIL_TAKEN")
        raise HTTPException(status_code=400, detail=str(e))
    
    # Avoid touching lazy relationships during serialization
    payload = UserRead.model_validate(user, from_attributes=True).model_dump()
    resp = JSONResponse(payload)
    _set_session_cookie(resp, session_token, request)
    _clear_legacy_refresh_cookie(resp)
    return resp

@router.post("/login", response_model=UserRead)
async def login(
    body: LoginIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _check_origin(request)
    # Apply rate limiting
    _rate_limit(request, "login")
    session_token = await auth_crud.authenticate(
        db,
        email=body.email,
        password=body.password,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="BAD_CREDENTIALS")
    
    user = await user_crud.get_user_by_email(db, body.email)
    resp_payload = UserRead.model_validate(user, from_attributes=True).model_dump()
    resp = JSONResponse(resp_payload)
    _set_session_cookie(resp, session_token, request)
    _clear_legacy_refresh_cookie(resp)
    return resp

# New: Redis-backed WebSocket connection manager for multi-server support
class RedisConnectionManager:
    """
    Manages WebSocket connections across multiple servers using Redis pub/sub.
    Each server maintains its own local connections but can broadcast to all servers.
    """
    def __init__(self):
        # Local connections for this server instance
        self.active_connections: Dict[str, List[WebSocket]] = defaultdict(list)
        self._lock = asyncio.Lock()
        
        # Redis clients for pub/sub
        self.redis_client: Optional[aioredis.Redis] = None
        self.pubsub: Optional[aioredis.client.PubSub] = None
        self.redis_url = settings.REDIS_URL if hasattr(settings, 'REDIS_URL') else "redis://localhost:6379"
        
        # Server instance ID (unique per server process)
        import uuid
        self.server_id = str(uuid.uuid4())
        
        # Background task for Redis subscription
        self._subscription_task: Optional[asyncio.Task] = None
        
        logger.info(f"WebSocket ConnectionManager initialized with server_id: {self.server_id}")
    
    async def startup(self):
        """Initialize Redis connections and start subscription listener"""
        try:
            # Create Redis client for publishing
            self.redis_client = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            
            # Create separate Redis connection for subscription
            redis_sub_client = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            self.pubsub = redis_sub_client.pubsub()
            
            # Start subscription listener in background
            self._subscription_task = asyncio.create_task(self._redis_subscription_listener())
            
            logger.info(f"Redis connection established for WebSocket manager on server {self.server_id}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            # Fallback to in-memory only mode if Redis is not available
            logger.warning("WebSocket manager running in single-server mode (Redis unavailable)")
    
    async def shutdown(self):
        """Clean up Redis connections"""
        try:
            if self._subscription_task:
                self._subscription_task.cancel()
                try:
                    await self._subscription_task
                except asyncio.CancelledError:
                    pass
            
            if self.pubsub:
                await self.pubsub.close()
            
            if self.redis_client:
                await self.redis_client.close()
                
            logger.info(f"Redis connections closed for server {self.server_id}")
        except Exception as e:
            logger.error(f"Error during Redis shutdown: {e}")
    
    async def _redis_subscription_listener(self):
        """Listen for Redis pub/sub messages and forward to local WebSocket connections"""
        try:
            # Subscribe to the broadcast channel
            await self.pubsub.subscribe("websocket:broadcast")
            logger.info(f"Server {self.server_id} subscribed to Redis broadcast channel")
            
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    try:
                        # Parse the broadcast message
                        data = json.loads(message["data"])
                        sender_server_id = data.get("server_id")
                        
                        # Don't process our own broadcasts (we handle them locally)
                        if sender_server_id == self.server_id:
                            continue
                        
                        user_id = data.get("user_id")
                        msg_content = data.get("message")
                        
                        if user_id and msg_content:
                            # Send to local connections for this user
                            await self._send_to_local_connections(msg_content, user_id)
                            
                    except json.JSONDecodeError:
                        logger.error(f"Invalid JSON in Redis message: {message['data']}")
                    except Exception as e:
                        logger.error(f"Error processing Redis message: {e}")
                        
        except asyncio.CancelledError:
            logger.info(f"Redis subscription listener cancelled for server {self.server_id}")
        except Exception as e:
            logger.error(f"Redis subscription listener error: {e}")
    
    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept and register a new WebSocket connection"""
        await websocket.accept()
        async with self._lock:
            self.active_connections[user_id].append(websocket)
            connection_count = len(self.active_connections[user_id])
            logger.info(f"WebSocket connected for user {user_id} on server {self.server_id}. Local connections: {connection_count}")
            
            # Store connection count in Redis for monitoring (optional)
            if self.redis_client:
                try:
                    await self.redis_client.hincrby(f"ws:connections:{user_id}", self.server_id, 1)
                except Exception as e:
                    logger.warning(f"Failed to update Redis connection count: {e}")
    
    async def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove a WebSocket connection"""
        async with self._lock:
            if user_id in self.active_connections:
                if websocket in self.active_connections[user_id]:
                    self.active_connections[user_id].remove(websocket)
                    connection_count = len(self.active_connections[user_id])
                    logger.info(f"WebSocket disconnected for user {user_id} on server {self.server_id}. Remaining local connections: {connection_count}")
                    
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
                
                # Update connection count in Redis (optional)
                if self.redis_client:
                    try:
                        count = await self.redis_client.hincrby(f"ws:connections:{user_id}", self.server_id, -1)
                        if count <= 0:
                            await self.redis_client.hdel(f"ws:connections:{user_id}", self.server_id)
                    except Exception as e:
                        logger.warning(f"Failed to update Redis connection count: {e}")
    
    async def _send_to_local_connections(self, message: str, user_id: str):
        """Send a message to local WebSocket connections for a specific user"""
        async with self._lock:
            connections = self.active_connections.get(user_id, [])
            if connections:
                disconnected = []
                for connection in connections[:]:  # Copy list to avoid modification during iteration
                    try:
                        await connection.send_text(message)
                    except Exception as e:
                        logger.warning(f"Failed to send message to local WebSocket: {e}")
                        disconnected.append(connection)
                
                # Clean up disconnected sockets
                for conn in disconnected:
                    if conn in self.active_connections[user_id]:
                        self.active_connections[user_id].remove(conn)
    
    async def send_personal_message(self, message: str, user_id: str):
        """
        Send a message to all WebSocket connections for a specific user across all servers.
        This broadcasts via Redis pub/sub to reach connections on other servers.
        """
        # Send to local connections immediately
        await self._send_to_local_connections(message, user_id)
        
        # Broadcast to other servers via Redis
        if self.redis_client:
            try:
                broadcast_data = json.dumps({
                    "server_id": self.server_id,
                    "user_id": user_id,
                    "message": message
                })
                await self.redis_client.publish("websocket:broadcast", broadcast_data)
                logger.debug(f"Broadcasted message for user {user_id} to Redis")
            except Exception as e:
                logger.error(f"Failed to broadcast message via Redis: {e}")
        else:
            logger.warning("Redis not available, message only sent to local connections")
    
    async def get_total_connections(self, user_id: str) -> int:
        """Get total connection count for a user across all servers (for monitoring)"""
        if self.redis_client:
            try:
                connections = await self.redis_client.hgetall(f"ws:connections:{user_id}")
                return sum(int(count) for count in connections.values())
            except Exception as e:
                logger.error(f"Failed to get total connections from Redis: {e}")
        
        # Fallback to local count
        return len(self.active_connections.get(user_id, []))

# Initialize the Redis-backed connection manager
manager = RedisConnectionManager()

# Add startup and shutdown events for the manager
@router.on_event("startup")
async def startup_event():
    """Initialize Redis connections on router startup"""
    await manager.startup()

@router.on_event("shutdown")
async def shutdown_event():
    """Clean up Redis connections on router shutdown"""
    await manager.shutdown()

def _generate_auth_code() -> str:
    """Generate a secure authorization code"""
    return secrets.token_urlsafe(48)

def _verify_pkce(verifier: str, challenge: str, method: str = "S256") -> bool:
    """Verify PKCE code challenge"""
    if method != "S256":
        return False
    
    # Calculate SHA256 hash of verifier
    hash_digest = hashlib.sha256(verifier.encode()).digest()
    # Base64url encode (no padding)
    computed_challenge = base64.urlsafe_b64encode(hash_digest).decode().rstrip("=")
    
    return computed_challenge == challenge

def _create_access_token(user_id: str, expires_delta: dt.timedelta = dt.timedelta(hours=1)) -> str:
    """Create a short-lived access token (JWT)"""
    expire = dt.datetime.now(dt.timezone.utc) + expires_delta
    payload = {
        "sub": user_id,
        "exp": expire,
        "type": "access"
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

@router.get("/authorize")
async def authorize(
    response_type: str = Query(...),
    code_challenge: str = Query(...),
    code_challenge_method: str = Query(...),
    redirect_uri: str = Query(...),
    state: Optional[str] = Query(None),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """OAuth 2.0 Authorization endpoint with PKCE"""
    
    # Validate parameters
    if response_type != "code":
        return JSONResponse(
            status_code=400,
            content={"error": "unsupported_response_type"}
        )
    
    if code_challenge_method != "S256":
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "error_description": "Only S256 is supported"}
        )
    
    # Check for existing web session (SSO)
    try:
        current_user = await get_current_user(request, db)
    except HTTPException:
        # User not logged in, redirect to web frontend login with return URL
        # Build the full authorization URL to return to after login
        auth_params = {
            "response_type": response_type,
            "code_challenge": code_challenge,
            "code_challenge_method": code_challenge_method,
            "redirect_uri": redirect_uri,
        }
        if state:
            auth_params["state"] = state
            
        auth_url = f"{request.url.scheme}://{request.url.netloc}/api/v1/auth/authorize?" + urllib.parse.urlencode(auth_params)
        
        # Get frontend URL from environment or use default
        frontend_url = settings.FRONTEND_URL
        login_url = f"{frontend_url}/login?return_to={urllib.parse.quote(auth_url)}"
        
        # Add device indicator for better UX
        login_url += "&device_auth=true"
        
        return RedirectResponse(url=login_url, status_code=302)
    
    # User is logged in, generate authorization code
    auth_code = _generate_auth_code()
    expires_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(minutes=10)
    
    code_obj = AuthCode(
        code=auth_code,
        user_id=current_user.id,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        redirect_uri=redirect_uri,
        expires_at=expires_at
    )
    db.add(code_obj)
    await db.commit()
    
    # Build redirect URL with code (and state if provided)
    redirect_params = {"code": auth_code}
    if state:
        redirect_params["state"] = state
    
    redirect_url = redirect_uri
    if "?" in redirect_url:
        redirect_url += "&"
    else:
        redirect_url += "?"
    redirect_url += urllib.parse.urlencode(redirect_params)
    
    return RedirectResponse(url=redirect_url, status_code=302)

# Add a device authorization info endpoint
@router.get("/device/info")
async def device_info(
    code_challenge: str = Query(...),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Get info about a pending device authorization"""
    if not current_user:
        return {"authenticated": False}
    
    return {
        "authenticated": True,
        "user_email": current_user.email,
        "device_name": "ProcessRecorder Desktop"
    }

@router.post("/token")
async def token(
    grant_type: str = Form(...),
    code: Optional[str] = Form(None),
    code_verifier: Optional[str] = Form(None),
    redirect_uri: Optional[str] = Form(None),
    refresh_token: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """OAuth 2.0 Token endpoint"""
    
    if grant_type == "authorization_code":
        if not all([code, code_verifier, redirect_uri]):
            raise HTTPException(status_code=400, detail="Missing required parameters")
        
        # Find and validate auth code
        now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
        auth_code_obj = await db.scalar(
            select(AuthCode).where(
                AuthCode.code == code,
                AuthCode.expires_at > now
            )
        )
        
        if not auth_code_obj:
            raise HTTPException(status_code=400, detail="Invalid or expired code")
        
        # Verify PKCE
        if not _verify_pkce(code_verifier, auth_code_obj.code_challenge, auth_code_obj.code_challenge_method):
            # Delete the code to prevent reuse attempts
            await db.delete(auth_code_obj)
            await db.commit()
            raise HTTPException(status_code=400, detail="Invalid code verifier")
        
        # Verify redirect_uri matches
        if auth_code_obj.redirect_uri != redirect_uri:
            await db.delete(auth_code_obj)
            await db.commit()
            raise HTTPException(status_code=400, detail="Redirect URI mismatch")
        
        user_id = auth_code_obj.user_id
        
        # Delete auth code (single use)
        await db.delete(auth_code_obj)
        
        # Create refresh token
        refresh_token_str = secrets.token_urlsafe(48)
        refresh_token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
        
        refresh_token_obj = RefreshToken(
            user_id=user_id,
            token_hash=refresh_token_hash,
            client_name="desktop"
        )
        db.add(refresh_token_obj)
        await db.commit()
        
        # Create access token
        access_token = _create_access_token(user_id)
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token_str,
            "token_type": "Bearer",
            "expires_in": 3600
        }
    
    elif grant_type == "refresh_token":
        if not refresh_token:
            raise HTTPException(status_code=400, detail="Missing refresh token")
        
        # Validate refresh token
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        refresh_obj = await db.scalar(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False
            )
        )
        
        if not refresh_obj:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        
        # Update last used timestamp
        refresh_obj.last_used_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
        await db.commit()
        
        # Create new access token
        access_token = _create_access_token(refresh_obj.user_id)
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,  # Return same refresh token
            "token_type": "Bearer",
            "expires_in": 3600
        }
    
    else:
        raise HTTPException(status_code=400, detail="Unsupported grant type")

@router.websocket("/ws/notifications")
async def websocket_notifications(
    websocket: WebSocket,
    token: str = Query(...),  # Require access token for authentication
    db: AsyncSession = Depends(get_db),
):
    """
    WebSocket endpoint for real-time notifications to desktop clients.
    Supports multiple servers and reverse proxy configurations via Redis pub/sub.
    """
    user_id = None
    try:
        # Validate the JWT access token
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("sub")
            token_type = payload.get("type")
            
            if not user_id or token_type != "access":
                await websocket.close(code=1008, reason="Invalid token")
                return
            
            # Verify user exists
            user = await db.scalar(select(User).where(User.id == user_id))
            if not user:
                await websocket.close(code=1008, reason="User not found")
                return
                
        except jwt.ExpiredSignatureError:
            await websocket.close(code=1008, reason="Token expired")
            return
        except jwt.InvalidTokenError:
            await websocket.close(code=1008, reason="Invalid token")
            return
        
        # Accept and register the connection
        await manager.connect(websocket, user_id)
        logger.info(f"WebSocket connection established for user {user_id} on server {manager.server_id}")
        
        # Keep connection alive and listen for messages (ping/pong)
        while True:
            try:
                # Wait for any message from client (used as keep-alive)
                message = await websocket.receive_text()
                
                # Echo back ping messages for keep-alive
                if message == "ping":
                    await websocket.send_text("pong")
                    
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected for user {user_id}")
                break
            except Exception as e:
                logger.error(f"WebSocket error for user {user_id}: {e}")
                break
                
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        # Clean up connection
        if user_id:
            await manager.disconnect(websocket, user_id)

# New: Device-specific logout endpoint for desktop clients
class RevokeTokenRequest(BaseModel):
    refresh_token: str

@router.post("/revoke")
async def revoke_token(
    body: RevokeTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke a specific refresh token (device-specific logout).
    Used by desktop clients to invalidate their specific session.
    """
    if not body.refresh_token:
        raise HTTPException(status_code=400, detail="Missing refresh token")
    
    # Hash the token to match storage format
    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    
    # Find and revoke the specific token
    refresh_token_obj = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False
        )
    )
    
    if refresh_token_obj:
        refresh_token_obj.revoked = True
        await db.commit()
        logger.info(f"Revoked refresh token for user {refresh_token_obj.user_id}")
        return {"ok": True, "message": "Token revoked successfully"}
    else:
        # Return success even if token not found (security best practice)
        return {"ok": True, "message": "Token revoked successfully"}

@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_origin(request)
    token = request.cookies.get(COOKIE_NAME)
    if token:
        await auth_crud.logout(db, token)
    
    # Global logout: revoke all refresh tokens for this user
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == current_user.id, RefreshToken.revoked == False)
        .values(revoked=True)
    )
    await db.commit()
    
    # Send FORCE_LOGOUT notification once
    await manager.send_personal_message("FORCE_LOGOUT", current_user.id)
    
    # remove both new and legacy cookies
    response.delete_cookie(COOKIE_NAME, path="/")
    _clear_legacy_refresh_cookie(response)
    return {"ok": True}

@router.post("/verify")
async def verify(body: VerifyIn, db: AsyncSession = Depends(get_db)):
    if not await auth_crud.verify_email(db, body.token):
        raise HTTPException(status_code=400, detail="INVALID_TOKEN")
    return {"ok": True}

@router.post("/password-reset/request")
async def password_reset_request(body: PasswordResetRequestIn, db: AsyncSession = Depends(get_db), request: Request = None):
    # Apply rate limiting
    _rate_limit(request, "password_reset")
    # Always return a generic response to prevent email enumeration
    try:
        await auth_crud.request_password_reset(db, body.email)
    except Exception:
        # Intentionally swallow errors to keep response generic
        pass
    return {"ok": True}

@router.post("/password-reset/confirm")
async def password_reset_confirm(body: PasswordResetConfirmIn, db: AsyncSession = Depends(get_db)):
    if not await auth_crud.reset_password(db, body.token, body.new_password):
        raise HTTPException(status_code=400, detail="INVALID_TOKEN")
    return {"ok": True}

@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
# ─────────────────────────────────────────────────────────────────────────────
# Test utilities (E2E only)
# DELETE /api/v1/auth/test-utils/users/{email}
# Protected: only allowed on localhost or when E2E_ENABLE_DELETE_USER=1
# ─────────────────────────────────────────────────────────────────────────────
@router.delete("/test-utils/users/{email}")
async def test_delete_user(
    email: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    host = request.url.hostname
    is_local = host in {"localhost", "127.0.0.1"}
    if not (is_local or os.getenv("E2E_ENABLE_DELETE_USER") == "1"):
        raise HTTPException(status_code=403, detail="FORBIDDEN")# remove both new and legacy cookies
    deleted = await user_crud.delete_user_by_email(db, email, path="/")
    return {"deleted": deleted}

# ─────────────────────────────────────────────────────────────────────────────
# OAuth 2.0 PKCE Flow Endpoints@router.post("/verify")
# ─────────────────────────────────────────────────────────────────────────────VerifyIn, db: AsyncSession = Depends(get_db)):
    if not await auth_crud.verify_email(db, body.token):
        raise HTTPException(status_code=400, detail="INVALID_TOKEN")
    return {"ok": True}

@router.post("/password-reset/request")
async def password_reset_request(body: PasswordResetRequestIn, db: AsyncSession = Depends(get_db), request: Request = None):
    # Apply rate limiting
    _rate_limit(request, "password_reset")
    # Always return a generic response to prevent email enumeration
    try:
        await auth_crud.request_password_reset(db, body.email)
    except Exception:
        # Intentionally swallow errors to keep response generic
        pass
    return {"ok": True}

@router.post("/password-reset/confirm")
async def password_reset_confirm(body: PasswordResetConfirmIn, db: AsyncSession = Depends(get_db)):
    if not await auth_crud.reset_password(db, body.token, body.new_password):
        raise HTTPException(status_code=400, detail="INVALID_TOKEN")
    return {"ok": True}

@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)):
    return current_user

# ─────────────────────────────────────────────────────────────────────────────
# Test utilities (E2E only)
# DELETE /api/v1/auth/test-utils/users/{email}
# Protected: only allowed on localhost or when E2E_ENABLE_DELETE_USER=1
# ─────────────────────────────────────────────────────────────────────────────
@router.delete("/test-utils/users/{email}")
async def test_delete_user(
    email: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    host = request.url.hostname
    is_local = host in {"localhost", "127.0.0.1"}
    if not (is_local or os.getenv("E2E_ENABLE_DELETE_USER") == "1"):
        raise HTTPException(status_code=403, detail="FORBIDDEN")
    deleted = await user_crud.delete_user_by_email(db, email)
    return {"deleted": deleted}

# ─────────────────────────────────────────────────────────────────────────────
# OAuth 2.0 PKCE Flow Endpoints
# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES = BASE_DIR / "templates" / "email"

env = Environment(
    loader=FileSystemLoader(str(TEMPLATES)),
    autoescape=select_autoescape(["html", "xml"]),
)


def _render(template_name: str, **ctx) -> str:
    return env.get_template(template_name).render(**ctx)


def _send(to_addr: str, subject: str, html_body: str) -> bool:
    """Send an HTML email. Returns True on success, False on failure."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_addr
    msg.attach(MIMEText(html_body, "html"))

    try:
        if settings.SMTP_USE_SSL and settings.SMTP_PORT == 465:
            # Implicit SSL (port 465)
            with smtplib.SMTP_SSL(host=settings.SMTP_HOST, port=settings.SMTP_PORT) as s:
                if settings.SMTP_USER:
                    s.login(settings.SMTP_USER, settings.SMTP_PASS)
                s.send_message(msg)
        elif settings.SMTP_USE_TLS:
            # STARTTLS (port 587)
            with smtplib.SMTP(host=settings.SMTP_HOST, port=settings.SMTP_PORT) as s:
                s.starttls()
                if settings.SMTP_USER:
                    s.login(settings.SMTP_USER, settings.SMTP_PASS)
                s.send_message(msg)
        else:
            # Plain SMTP (port 25 / dev)
            with smtplib.SMTP(host=settings.SMTP_HOST, port=settings.SMTP_PORT) as s:
                if settings.SMTP_USER:
                    s.login(settings.SMTP_USER, settings.SMTP_PASS)
                s.send_message(msg)
        return True
    except Exception as exc:
        logger.error(
            "Email send failed to=%s subject=%r: %s", to_addr, subject, exc, exc_info=True
        )
        return False


def send_verification_email(email: str, token: str) -> bool:
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    html = _render(
        "verify.html",
        verify_token=token,
        frontend_url=frontend_url,
    )
    return _send(email, "Verify your Stept account", html)


def send_reset_email(email: str, token: str) -> bool:
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    html = _render(
        "reset.html",
        reset_token=token,
        frontend_url=frontend_url,
    )
    return _send(email, "Reset your Stept password", html)


def send_invite_email(email: str, token: str, inviter_name: str) -> bool:
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    html = _render(
        "invite.html",
        invite_token=token,
        inviter_name=inviter_name,
        frontend_url=frontend_url,
    )
    return _send(email, f"{inviter_name} invited you to Stept", html)

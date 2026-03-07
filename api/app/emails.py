import os, smtplib, logging
from email.mime.text import MIMEText
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

BASE_DIR   = Path(__file__).resolve().parent
TEMPLATES  = BASE_DIR / "templates" / "email"

env = Environment(
    loader=FileSystemLoader(str(TEMPLATES)),
    autoescape=select_autoescape(["html", "xml"])
)

SMTP_HOST = os.getenv("SR_SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SR_SMTP_PORT", 25))
SMTP_USER = os.getenv("SR_SMTP_USER", "")
SMTP_PASS = os.getenv("SR_SMTP_PASS", "")
FROM_ADDR = os.getenv("SR_FROM_EMAIL", "noreply@ondoki.local")

def _render(template_name: str, **ctx) -> str:
    return env.get_template(template_name).render(**ctx)

def _send(to_addr: str, subject: str, html_body: str) -> None:
    msg = MIMEText(html_body, "html")
    msg["Subject"] = subject
    msg["From"]    = FROM_ADDR
    msg["To"]      = to_addr
    try:
        with smtplib.SMTP(host=SMTP_HOST, port=SMTP_PORT) as s:
            if SMTP_USER:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
    except Exception as exc:
        logger.error("Email send failed to=%s subject=%r: %s", to_addr, subject, exc, exc_info=True)

def send_verification_email(email: str, token: str) -> None:
    html = _render("verify.html", verify_token=token)
    _send(email, "Verify your SnapRow account", html)

def send_reset_email(email: str, token: str) -> None:
    html = _render("reset.html", reset_token=token)
    _send(email, "Reset your SnapRow password", html)

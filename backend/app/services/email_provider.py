"""Sending email, behind one small interface.

The default provider is a MOCK: it records that an email would have been sent and sends nothing.
Real sending (SMTP) is only used when an administrator sets BOTH EMAIL_PROVIDER=smtp and
EMAIL_REAL_SENDING_ENABLED=true and provides credentials. Either one alone keeps the mock.
Nothing here is reachable without an approved ApprovalRequest (see services/approvals.py).
"""

import logging
import smtplib
import uuid
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol

from app.core.config import get_settings

log = logging.getLogger(__name__)


class EmailSendError(Exception):
    """Sending failed. The message is safe to show to users (no credentials, no addresses)."""


@dataclass
class SendReceipt:
    provider: str  # "mock" | "smtp"
    message_id: str
    simulated: bool


class EmailProvider(Protocol):
    name: str
    simulated: bool

    def send(self, *, to: str, subject: str, body: str, from_name: str) -> SendReceipt: ...


class MockEmailProvider:
    name = "mock"
    simulated = True

    def send(self, *, to: str, subject: str, body: str, from_name: str) -> SendReceipt:
        # Log that it happened, never the address or content.
        log.info("MOCK email 'sent' (%d chars)", len(body))
        return SendReceipt("mock", f"mock-{uuid.uuid4().hex[:12]}", simulated=True)


class SmtpEmailProvider:
    name = "smtp"
    simulated = False

    def __init__(self, host: str, port: int, username: str | None, password: str | None, from_address: str):
        self._host, self._port, self._user, self._password, self._from = host, port, username, password, from_address

    def send(self, *, to: str, subject: str, body: str, from_name: str) -> SendReceipt:
        msg = EmailMessage()  # EmailMessage rejects header values containing line breaks
        try:
            msg["From"] = f"{from_name.replace(chr(10), ' ')} <{self._from}>"
            msg["To"] = to
            msg["Subject"] = subject
        except ValueError:
            raise EmailSendError("The email contained invalid header text.") from None
        msg.set_content(body)
        try:
            with smtplib.SMTP(self._host, self._port, timeout=15) as smtp:
                smtp.starttls()
                if self._user and self._password:
                    smtp.login(self._user, self._password)
                smtp.send_message(msg)
        except (smtplib.SMTPException, OSError) as e:
            log.error("SMTP send failed: %s", type(e).__name__)
            raise EmailSendError("The email server could not send the message.") from None
        return SendReceipt("smtp", str(msg["Message-ID"] or uuid.uuid4().hex), simulated=False)


def get_email_provider() -> EmailProvider:
    s = get_settings()
    if s.email_provider == "smtp" and s.email_real_sending_enabled and s.smtp_host and s.smtp_from_address:
        return SmtpEmailProvider(s.smtp_host, s.smtp_port, s.smtp_username, s.smtp_password, s.smtp_from_address)
    return MockEmailProvider()
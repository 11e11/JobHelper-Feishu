"""RFC email parsing, HTML-to-text cleanup and URL extraction."""

import html
import re
from datetime import datetime, timezone
from email import message_from_bytes, policy
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parsedate_to_datetime
from typing import Iterable, List

from models import ParsedEmail


URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
SCRIPT_STYLE_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
BREAK_RE = re.compile(r"</?(?:p|div|br|li|tr|h[1-6])\b[^>]*>", re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")


def decode_text(value: str) -> str:
    try:
        return str(make_header(decode_header(value or "")))
    except (LookupError, UnicodeDecodeError):
        return value or ""


def html_to_text(value: str) -> str:
    value = SCRIPT_STYLE_RE.sub(" ", value)
    value = BREAK_RE.sub("\n", value)
    value = TAG_RE.sub(" ", value)
    value = html.unescape(value).replace("\xa0", " ")
    lines = [" ".join(line.split()) for line in value.splitlines()]
    return "\n".join(line for line in lines if line).strip()


def _decode_part(part: Message) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        raw = part.get_payload()
        return raw if isinstance(raw, str) else ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except LookupError:
        return payload.decode("utf-8", errors="replace")


def _unique(items: Iterable[str]) -> List[str]:
    result: List[str] = []
    seen = set()
    for item in items:
        cleaned = item.rstrip(".,;:!?)]}，。；：！？）】")
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def parse_email(raw: bytes, uid: int) -> ParsedEmail:
    msg = message_from_bytes(raw, policy=policy.default)
    plain_parts: List[str] = []
    html_parts: List[str] = []
    attachments: List[str] = []
    parts = msg.walk() if msg.is_multipart() else [msg]
    for part in parts:
        if part.is_multipart():
            continue
        disposition = part.get_content_disposition()
        filename = part.get_filename()
        if disposition == "attachment" or filename:
            if filename:
                attachments.append(decode_text(filename))
            continue
        content_type = part.get_content_type()
        if content_type == "text/plain":
            plain_parts.append(_decode_part(part))
        elif content_type == "text/html":
            html_parts.append(_decode_part(part))

    plain = "\n".join(plain_parts).strip()
    html_text = html_to_text("\n".join(html_parts))
    body = plain or html_text
    if plain and html_text and len(plain) < 80:
        body = plain + "\n" + html_text
    body = body.replace("\x00", "").strip()[:30000]

    try:
        received_at = parsedate_to_datetime(msg.get("Date", ""))
        if received_at is None:
            raise ValueError
        if received_at.tzinfo is None:
            received_at = received_at.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError, OverflowError):
        received_at = datetime.now(timezone.utc)

    subject = decode_text(msg.get("Subject", "")).strip()
    sender = decode_text(msg.get("From", "")).strip()
    message_id = (msg.get("Message-ID") or msg.get("Message-Id") or "").strip()
    if not message_id:
        message_id = "imap:{}".format(uid)
    urls = _unique(URL_RE.findall("\n".join([plain, "\n".join(html_parts)])))
    return ParsedEmail(uid, message_id[:500], subject[:1000], sender[:1000],
                       received_at, body, urls[:50], attachments[:50])


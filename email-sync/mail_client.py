"""Read new messages from an IMAP mailbox without changing read state."""

import imaplib
from contextlib import contextmanager
from typing import Iterator, List, Tuple

from config import Config
from mail_parser import parse_email
from models import ParsedEmail


class MailError(RuntimeError):
    pass


class ImapClient:
    def __init__(self, config: Config):
        self.config = config

    @contextmanager
    def connection(self) -> Iterator[imaplib.IMAP4_SSL]:
        client = None
        try:
            # Python 3.8's IMAP4_SSL has no timeout keyword (added in 3.9).
            client = imaplib.IMAP4_SSL(
                self.config.mail_imap_host, self.config.mail_imap_port
            )
            client.login(self.config.mail_username, self.config.mail_auth_code)
            # NetEase/163 requires RFC 2971 client identification after LOGIN;
            # otherwise SELECT is rejected with "Unsafe Login".
            if b"ID" in client.capabilities or "ID" in client.capabilities:
                imaplib.Commands.setdefault("ID", ("AUTH",))
                client._simple_command(
                    "ID", '("name" "JobRecruitmentEmailSync" "version" "1.0" '
                          '"vendor" "local-user")'
                )
            status, detail = client.select(self.config.mail_folder, readonly=True)
            if status != "OK":
                reason = " ".join(
                    item.decode("utf-8", errors="replace") if isinstance(item, bytes) else str(item)
                    for item in (detail or [])
                )
                raise MailError("无法只读打开邮箱目录 {}：{}".format(
                    self.config.mail_folder, reason[:300] or "未知原因"))
            yield client
        except imaplib.IMAP4.error as exc:
            raise MailError("163邮箱认证或IMAP访问失败：{}".format(str(exc)[:300])) from exc
        finally:
            if client is not None:
                try:
                    client.logout()
                except (imaplib.IMAP4.error, OSError):
                    pass

    def highest_uid(self) -> int:
        with self.connection() as client:
            status, data = client.uid("search", None, "ALL")
            if status != "OK" or not data or not data[0]:
                return 0
            return max(int(item) for item in data[0].split())

    def fetch_after(self, cursor: int, limit: int = 100) -> List[ParsedEmail]:
        messages: List[ParsedEmail] = []
        with self.connection() as client:
            status, data = client.uid("search", None, "UID", "{}:*".format(cursor + 1))
            if status != "OK" or not data or not data[0]:
                return messages
            uids = [int(item) for item in data[0].split() if int(item) > cursor][:limit]
            for uid in uids:
                status, parts = client.uid("fetch", str(uid), "(BODY.PEEK[])")
                if status != "OK":
                    raise MailError("读取邮件 UID {} 失败".format(uid))
                raw = next((item[1] for item in parts if isinstance(item, tuple)), None)
                if raw is None:
                    raise MailError("邮件 UID {} 没有正文".format(uid))
                messages.append(parse_email(raw, uid))
        return messages

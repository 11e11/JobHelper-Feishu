"""SQLite state: idempotency, cursor and retry/audit information."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


class Repository:
    def __init__(self, path: Path):
        self.connection = sqlite3.connect(str(path))
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA busy_timeout=5000")
        self._migrate()

    def _migrate(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                message_id TEXT PRIMARY KEY,
                uid INTEGER NOT NULL,
                subject TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                error TEXT NOT NULL DEFAULT '',
                feishu_record_ids TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );
            """
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def get_cursor(self, account: str, folder: str) -> Optional[int]:
        key = "cursor:{}:{}".format(account.lower(), folder)
        row = self.connection.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
        return int(row["value"]) if row else None

    def set_cursor(self, account: str, folder: str, uid: int) -> None:
        key = "cursor:{}:{}".format(account.lower(), folder)
        self.connection.execute(
            "INSERT INTO state(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(uid))
        )
        self.connection.commit()

    def is_terminal(self, message_id: str) -> bool:
        row = self.connection.execute(
            "SELECT status FROM messages WHERE message_id = ?", (message_id,)
        ).fetchone()
        return bool(row and row["status"] in ("completed", "ignored"))

    def mark(self, message_id: str, uid: int, subject: str, status: str,
             error: str = "", feishu_record_ids: str = "") -> None:
        now = datetime.now(timezone.utc).isoformat()
        safe_error = " ".join(error.split())[:1000]
        self.connection.execute(
            """
            INSERT INTO messages(message_id, uid, subject, status, retry_count, error,
                                 feishu_record_ids, updated_at)
            VALUES(?, ?, ?, ?, CASE WHEN ? = 'failed' THEN 1 ELSE 0 END, ?, ?, ?)
            ON CONFLICT(message_id) DO UPDATE SET
              status=excluded.status,
              retry_count=messages.retry_count + CASE WHEN excluded.status = 'failed' THEN 1 ELSE 0 END,
              error=excluded.error,
              feishu_record_ids=CASE WHEN excluded.feishu_record_ids = ''
                                THEN messages.feishu_record_ids ELSE excluded.feishu_record_ids END,
              updated_at=excluded.updated_at
            """,
            (message_id, uid, subject[:500], status, status, safe_error,
             feishu_record_ids, now),
        )
        self.connection.commit()

    def recent_messages(self, limit: int = 10) -> List[Dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT message_id, uid, subject, status, retry_count, error, "
            "feishu_record_ids, updated_at FROM messages ORDER BY updated_at DESC LIMIT ?",
            (max(1, min(limit, 100)),),
        ).fetchall()
        return [dict(row) for row in rows]

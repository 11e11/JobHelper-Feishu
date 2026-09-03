"""Configuration loading with no third-party dependencies."""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict


class ConfigError(ValueError):
    pass


def _read_env(path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not path.exists():
        raise ConfigError("配置文件不存在：{}".format(path))
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


@dataclass(frozen=True)
class Config:
    mail_username: str
    mail_auth_code: str
    mail_imap_host: str
    mail_imap_port: int
    mail_folder: str
    deepseek_api_key: str
    deepseek_model: str
    feishu_app_id: str
    feishu_app_secret: str
    feishu_app_token: str
    feishu_process_table_id: str
    poll_interval_minutes: int
    timezone: str
    db_path: Path

    @classmethod
    def load(cls, env_path: Path) -> "Config":
        data = _read_env(env_path)
        required = [
            "MAIL_USERNAME", "MAIL_AUTH_CODE", "MAIL_IMAP_HOST", "MAIL_IMAP_PORT",
            "MAIL_FOLDER", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "FEISHU_APP_ID",
            "FEISHU_APP_SECRET", "FEISHU_APP_TOKEN", "FEISHU_PROCESS_TABLE_ID",
            "POLL_INTERVAL_MINUTES", "TIMEZONE",
        ]
        missing = [key for key in required if not data.get(key)]
        if missing:
            raise ConfigError("以下配置未填写：{}".format(", ".join(missing)))
        try:
            port = int(data["MAIL_IMAP_PORT"])
            interval = int(data["POLL_INTERVAL_MINUTES"])
        except ValueError as exc:
            raise ConfigError("MAIL_IMAP_PORT 和 POLL_INTERVAL_MINUTES 必须是整数") from exc
        if not 1 <= port <= 65535:
            raise ConfigError("MAIL_IMAP_PORT 超出有效范围")
        if interval < 1:
            raise ConfigError("POLL_INTERVAL_MINUTES 必须大于等于 1")
        return cls(
            mail_username=data["MAIL_USERNAME"], mail_auth_code=data["MAIL_AUTH_CODE"],
            mail_imap_host=data["MAIL_IMAP_HOST"], mail_imap_port=port,
            mail_folder=data["MAIL_FOLDER"], deepseek_api_key=data["DEEPSEEK_API_KEY"],
            deepseek_model=data["DEEPSEEK_MODEL"], feishu_app_id=data["FEISHU_APP_ID"],
            feishu_app_secret=data["FEISHU_APP_SECRET"],
            feishu_app_token=data["FEISHU_APP_TOKEN"],
            feishu_process_table_id=data["FEISHU_PROCESS_TABLE_ID"],
            poll_interval_minutes=interval, timezone=data["TIMEZONE"],
            db_path=env_path.parent / "email_sync.sqlite3",
        )


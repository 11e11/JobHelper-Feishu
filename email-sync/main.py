"""CLI entry point for the recruitment email synchronizer."""

import argparse
import json
import logging
from logging.handlers import RotatingFileHandler
import sys
from datetime import datetime, timezone
from pathlib import Path

from config import Config, ConfigError
from repository import Repository
from models import ParsedEmail
from service import SyncService


BASE_DIR = Path(__file__).resolve().parent


def parse_args():
    parser = argparse.ArgumentParser(description="163招聘邮件 → DeepSeek → 飞书流程记录")
    parser.add_argument("command", choices=("check", "init", "status", "test-ai", "run-once"),
                        help="check=连接检查，init=建立新邮件游标，status=最近处理结果，test-ai=合成邮件提取测试，run-once=执行一次同步")
    parser.add_argument("--env", type=Path, default=BASE_DIR / ".env")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    log_format = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    if not root_logger.handlers:
        console = logging.StreamHandler()
        console.setFormatter(log_format)
        root_logger.addHandler(console)
        file_handler = RotatingFileHandler(
            str(BASE_DIR / "email-sync.log"), maxBytes=1_000_000,
            backupCount=3, encoding="utf-8"
        )
        file_handler.setFormatter(log_format)
        root_logger.addHandler(file_handler)
    repository = None
    try:
        config = Config.load(args.env.resolve())
        repository = Repository(config.db_path)
        service = SyncService(config, repository)
        if args.command == "check":
            result = service.check_connections()
            print(json.dumps(result, ensure_ascii=False, indent=2))
        elif args.command == "init":
            cursor = service.initialize_cursor()
            print("初始化完成，当前邮件UID游标：{}".format(cursor))
        elif args.command == "test-ai":
            sample = ParsedEmail(
                uid=0, message_id="<local-ai-test>",
                subject="XX科技后端开发工程师一面邀请",
                sender="XX科技招聘团队 <recruit@example.com>",
                received_at=datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc),
                body=("您好，邀请您参加后端开发工程师岗位第一轮面试。"
                      "面试时间：2026年9月10日14:30（北京时间）；面试方式：线上视频；"
                      "会议地址：https://example.com/interview/123。请提前10分钟进入会议。"),
                urls=["https://example.com/interview/123"],
            )
            result = service.deepseek.analyze(sample)
            print(json.dumps({
                "is_recruitment_email": result.is_recruitment_email,
                "confidence": result.confidence,
                "events": [event.__dict__ for event in result.events],
            }, ensure_ascii=False, indent=2))
        elif args.command == "status":
            recent = repository.recent_messages()
            records_by_id = {item.get("record_id"): item for item in service.feishu.list_records()}
            output = []
            for item in recent:
                record_ids = [value for value in item.get("feishu_record_ids", "").split(",") if value]
                output.append({
                    "message_id": item["message_id"], "uid": item["uid"],
                    "subject": item["subject"], "status": item["status"],
                    "retry_count": item["retry_count"], "error": item["error"],
                    "feishu_records": [records_by_id[value] for value in record_ids if value in records_by_id],
                    "updated_at": item["updated_at"],
                })
            print(json.dumps(output, ensure_ascii=False, indent=2))
        else:
            result = service.run_once()
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ConfigError, RuntimeError, ValueError) as exc:
        logging.error("%s", str(exc))
        return 1
    finally:
        if repository is not None:
            repository.close()


if __name__ == "__main__":
    sys.exit(main())

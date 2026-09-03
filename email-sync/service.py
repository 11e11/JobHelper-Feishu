"""End-to-end orchestration and conservative Feishu upsert rules."""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from classifier import might_be_recruitment
from config import Config
from deepseek_client import DeepSeekClient
from feishu_client import FeishuClient, FeishuError
from mail_client import ImapClient
from models import AnalysisResult, ParsedEmail, ProcessEvent
from repository import Repository


LOGGER = logging.getLogger("email-sync")

FIELD_NAMES = {
    "process_name": "流程名称", "meeting_url": "会议或测评链接",
    "company": "公司", "next_action": "后续动作", "remark": "备注",
    "completed_at": "完成时间", "job_name": "岗位名称", "process_status": "当前状态",
    "stage_type": "环节类型", "process_result": "环节结果",
    "assessment_content": "考察内容", "planned_at": "计划时间",
    "method": "进行方式", "interview_round": "面试轮次",
    "message_id": "邮件唯一ID", "subject": "邮件主题", "sender": "邮件发件人",
    "received_at": "邮件收取时间", "confidence": "AI置信度",
    "recognition_status": "识别状态", "summary": "邮件摘要",
    "contact": "面试官或联系人",
}

SELECT_ALIASES = {
    "当前状态": {
        "未开始": ["待进行", "待处理"], "待进行": ["未开始", "待处理"],
        "待参加": ["待进行", "未开始", "待处理"], "待通知": ["等待通知"],
        "已完成": ["完成"], "已取消": ["取消"], "待确认": ["需确认", "人工确认"],
    },
    "环节类型": {
        "性格测评": ["性格", "性格测试"], "编程测评": ["编程", "在线编程", "代码测评"],
        "能力测评": ["测评", "在线测评", "能力测试"], "笔试": ["在线笔试", "笔试"],
        "HR面": ["HR面试", "人力面试"], "其他": ["结果通知", "Offer", "录用", "通知"],
    },
    "环节结果": {
        "等待结果": ["待定", "待通知"], "无结果": ["未知"],
        "通过": ["已通过", "成功"],
        "未通过": ["拒绝", "淘汰"], "已取消": ["取消"],
    },
    "进行方式": {
        "视频面试": ["线上", "在线", "视频", "远程"],
        "现场面试": ["线下面试", "现场"], "电话": ["电话面试"],
        "在线测评": ["线上测评", "在线笔试"], "现场笔试": ["线下笔试"],
    },
    "识别状态": {
        "已确认": ["自动确认", "已识别"], "待确认": ["需确认", "人工确认"],
        "处理失败": ["失败"],
    },
}


def _text_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get("text") or value.get("name") or "").strip()
    if isinstance(value, list):
        return "".join(_text_value(item) for item in value).strip()
    return str(value).strip()


def _normalize_identity(value: str) -> str:
    return "".join(value.lower().split()).replace("有限公司", "").replace("股份", "")


def _parse_timestamp(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        # The configured deployment timezone is Asia/Shanghai. Treat a rare
        # timezone-less model value as China Standard Time, never UTC.
        parsed = parsed.replace(tzinfo=timezone(timedelta(hours=8)))
    return int(parsed.timestamp() * 1000)


def _valid_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except ValueError:
        return False


class SyncService:
    def __init__(self, config: Config, repository: Repository):
        self.config = config
        self.repository = repository
        self.mail = ImapClient(config)
        self.deepseek = DeepSeekClient(config)
        self.feishu = FeishuClient(config)

    def initialize_cursor(self) -> int:
        current = self.repository.get_cursor(self.config.mail_username, self.config.mail_folder)
        if current is not None:
            return current
        highest = self.mail.highest_uid()
        self.repository.set_cursor(self.config.mail_username, self.config.mail_folder, highest)
        LOGGER.info("首次初始化完成；从下一封新邮件开始处理（当前UID=%s）", highest)
        return highest

    def check_connections(self) -> Dict[str, Any]:
        highest = self.mail.highest_uid()
        deepseek_reply = self.deepseek.check()
        schema = self.feishu.check_schema()
        field_summary = []
        for name in sorted(schema):
            field = schema[name]
            item = {"name": name, "type": field.get("type")}
            options = sorted(self.feishu.select_options(field))
            if options:
                item["options"] = options
            field_summary.append(item)
        return {
            "mail": "ok", "mail_highest_uid": highest,
            "deepseek": "ok" if deepseek_reply else "ok",
            "feishu": "ok", "feishu_field_count": len(schema),
            "feishu_fields": field_summary,
        }

    def run_once(self) -> Dict[str, int]:
        cursor = self.initialize_cursor()
        messages = self.mail.fetch_after(cursor)
        counts = {"fetched": len(messages), "completed": 0, "ignored": 0, "failed": 0}
        last_safe_uid = cursor
        failure_seen = False
        for message in messages:
            if self.repository.is_terminal(message.message_id):
                if not failure_seen:
                    last_safe_uid = message.uid
                continue
            try:
                status, record_ids = self.process_message(message)
                self.repository.mark(message.message_id, message.uid, message.subject, status,
                                     feishu_record_ids=",".join(record_ids))
                counts[status] += 1
                if not failure_seen:
                    last_safe_uid = message.uid
            except Exception as exc:  # boundary: preserve mail for retry
                failure_seen = True
                LOGGER.error("处理邮件UID %s失败：%s", message.uid, str(exc)[:500])
                self.repository.mark(message.message_id, message.uid, message.subject,
                                     "failed", error=str(exc))
                counts["failed"] += 1
        if last_safe_uid > cursor:
            self.repository.set_cursor(self.config.mail_username, self.config.mail_folder, last_safe_uid)
        return counts

    def process_message(self, message: ParsedEmail) -> Tuple[str, List[str]]:
        if not might_be_recruitment(message):
            return "ignored", []
        analysis = self.deepseek.analyze(message)
        if not analysis.is_recruitment_email or not analysis.events:
            return "ignored", []
        schema = self.feishu.check_schema()
        existing = self.feishu.list_records()
        record_ids: List[str] = []
        event_count = len(analysis.events)
        for index, event in enumerate(analysis.events, start=1):
            event_message_id = ("{}#{}".format(message.message_id, index)
                                if event_count > 1 else message.message_id)
            fields = self._to_fields(message, analysis, event, schema, event_message_id)
            if not fields.get("流程名称"):
                fields["流程名称"] = "招聘流程待确认"
            if not fields.get("公司"):
                fields["公司"] = "待确认"
            if not fields.get("岗位名称"):
                fields["岗位名称"] = "待确认"
            duplicate = self._find_by_message_id(existing, event_message_id)
            target = duplicate or self._find_updatable(existing, event)
            if target:
                record_id = self.feishu.update_record(target["record_id"], fields)
            else:
                record_id = self.feishu.create_record(fields)
                existing.append({"record_id": record_id, "fields": fields})
            record_ids.append(record_id)
        return "completed", record_ids

    def _select_value(self, field_name: str, requested: str,
                      schema: Dict[str, Dict[str, Any]]) -> Optional[str]:
        if not requested or field_name not in schema or schema[field_name].get("type") != 3:
            return None
        options = self.feishu.select_options(schema[field_name])
        if requested in options:
            return requested
        aliases = SELECT_ALIASES.get(field_name, {})
        normalized = requested.lower().replace(" ", "")
        for option in options:
            candidates = [option] + aliases.get(option, [])
            if any(normalized == str(item).lower().replace(" ", "") for item in candidates):
                return option
        return None

    def _put(self, output: Dict[str, Any], schema: Dict[str, Dict[str, Any]],
             name: str, value: Any) -> None:
        if name in schema and value not in (None, ""):
            output[name] = value

    def _to_fields(self, message: ParsedEmail, analysis: AnalysisResult,
                   event: ProcessEvent, schema: Dict[str, Dict[str, Any]],
                   event_message_id: Optional[str] = None) -> Dict[str, Any]:
        fields: Dict[str, Any] = {}
        self._put(fields, schema, "流程名称", event.process_name)
        self._put(fields, schema, "公司", event.company)
        self._put(fields, schema, "岗位名称", event.job_name)
        self._put(fields, schema, "后续动作", event.next_action)
        self._put(fields, schema, "备注", event.remark)
        self._put(fields, schema, "考察内容", event.assessment_content)
        # Do not promote the From header into a business contact. A contact is
        # writable only when the extracted text has direct evidence in body.
        contact = event.contact if event.contact and event.contact in message.body else ""
        self._put(fields, schema, "面试官或联系人", contact)
        self._put(fields, schema, "面试轮次", event.interview_round)
        self._put(fields, schema, "计划时间", _parse_timestamp(event.planned_at))
        self._put(fields, schema, "完成时间", _parse_timestamp(event.completed_at))
        if _valid_url(event.meeting_url):
            self._put(fields, schema, "会议或测评链接",
                      {"text": event.meeting_url, "link": event.meeting_url})
        resolved_stage = self._resolve_stage_type(event)
        resolved_method = self._resolve_method(event, resolved_stage)
        for field_name, requested in (
            ("当前状态", event.process_status), ("环节类型", resolved_stage),
            ("环节结果", event.process_result), ("进行方式", event.method),
        ):
            if field_name == "进行方式":
                requested = resolved_method
            value = self._select_value(field_name, requested, schema)
            self._put(fields, schema, field_name, value)
        confidence_status = "已确认" if analysis.confidence >= 0.80 else "待确认"
        recognition = self._select_value("识别状态", confidence_status, schema)
        self._put(fields, schema, "识别状态", recognition)
        self._put(fields, schema, "邮件唯一ID", event_message_id or message.message_id)
        self._put(fields, schema, "邮件主题", message.subject)
        self._put(fields, schema, "邮件发件人", message.sender)
        self._put(fields, schema, "邮件收取时间", int(message.received_at.timestamp() * 1000))
        self._put(fields, schema, "AI置信度", round(analysis.confidence, 4))
        self._put(fields, schema, "邮件摘要", event.summary)
        return fields

    @staticmethod
    def _resolve_stage_type(event: ProcessEvent) -> str:
        requested = event.stage_type.strip()
        lowered = requested.lower()
        if "hr" in lowered or "人力" in requested:
            return "HR面"
        if requested in {"面试", "技术面试"} and event.interview_round in (1, 2, 3):
            return {1: "一面", 2: "二面", 3: "三面"}[event.interview_round]
        if requested in {"在线测评", "测评"}:
            content = "{} {}".format(event.process_name, event.assessment_content)
            if "性格" in content:
                return "性格测评"
            if any(word in content for word in ("编程", "代码", "算法题")):
                return "编程测评"
            return "能力测评"
        if requested in {"Offer", "结果通知", "录用"}:
            return "其他"
        return requested

    @staticmethod
    def _resolve_method(event: ProcessEvent, stage_type: str) -> str:
        requested = event.method.strip()
        if requested in {"线上", "在线", "远程"}:
            return "在线测评" if stage_type in {"性格测评", "编程测评", "能力测评", "笔试"} else "视频面试"
        if requested in {"线下", "现场"}:
            return "现场笔试" if stage_type == "笔试" else "现场面试"
        return requested

    @staticmethod
    def _find_by_message_id(records: List[Dict[str, Any]], message_id: str) -> Optional[Dict[str, Any]]:
        for record in records:
            if _text_value((record.get("fields") or {}).get("邮件唯一ID")) == message_id:
                return record
        return None

    @staticmethod
    def _find_updatable(records: List[Dict[str, Any]], event: ProcessEvent) -> Optional[Dict[str, Any]]:
        if event.event_kind not in {"reminder", "reschedule", "cancellation", "result"}:
            return None
        company = _normalize_identity(event.company)
        job = _normalize_identity(event.job_name)
        matches: List[Dict[str, Any]] = []
        for record in records:
            fields = record.get("fields") or {}
            if company and _normalize_identity(_text_value(fields.get("公司"))) != company:
                continue
            if job and _normalize_identity(_text_value(fields.get("岗位名称"))) != job:
                continue
            resolved_stage = SyncService._resolve_stage_type(event)
            if resolved_stage and _text_value(fields.get("环节类型")) != resolved_stage:
                continue
            if event.interview_round is not None:
                try:
                    if int(fields.get("面试轮次")) != event.interview_round:
                        continue
                except (TypeError, ValueError):
                    continue
            matches.append(record)
        return matches[0] if len(matches) == 1 else None

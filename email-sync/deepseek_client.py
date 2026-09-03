"""DeepSeek structured extraction with strict local validation."""

import json
from typing import Any, Dict

from config import Config
from http_json import HttpJsonError, request_json
from models import AnalysisResult, ParsedEmail


SYSTEM_PROMPT = """你是招聘流程邮件信息提取器。请只输出合法JSON对象。
只提取邮件中明确表达的事实，不得编造公司、岗位、时间、链接、轮次或结果。
区分面试时间、确认截止时间和邮件收件时间。相对日期以邮件时间为基准，默认时区为Asia/Shanghai。
拒绝和Offer必须有明确原文依据。不要把“收到通知”判断为环节已经完成。
contact仅在邮件正文明确说明面试官、HR或联系人时提取；不得仅凭From发件人头生成联系人。
一封邮件若同时表示上一轮通过和安排下一轮，应输出两个events。
event_kind仅允许 invitation, reminder, reschedule, cancellation, result, offer, other。
stage_type优先使用：一面、二面、三面、HR面、性格测评、编程测评、能力测评、笔试、其他。
process_status优先使用：待参加、待通知、已完成、已取消。
process_result优先使用：等待结果、通过、未通过、主动放弃、无结果。
method优先使用：视频面试、现场面试、电话、在线测评、现场笔试、其他。
无法确定的字符串返回空字符串，时间返回null，轮次返回null。
输出结构：
{
  "is_recruitment_email": true,
  "confidence": 0.0,
  "events": [{
    "company": "", "job_name": "", "process_name": "",
    "event_kind": "invitation", "stage_type": "", "interview_round": null,
    "process_status": "", "process_result": "", "planned_at": null,
    "completed_at": null, "method": "", "meeting_url": "",
    "next_action": "", "assessment_content": "", "contact": "",
    "remark": "", "summary": ""
  }]
}
planned_at与completed_at必须为含时区的ISO 8601时间。confidence表示整封邮件提取可靠度。"""


class DeepSeekError(RuntimeError):
    pass


class DeepSeekClient:
    def __init__(self, config: Config):
        self.config = config

    def analyze(self, message: ParsedEmail) -> AnalysisResult:
        user_payload: Dict[str, Any] = {
            "mail_received_at": message.received_at.isoformat(),
            "subject": message.subject,
            "sender": message.sender,
            "body": message.body[:24000],
            "urls": message.urls,
            "attachment_names": message.attachment_names,
        }
        request_body: Dict[str, Any] = {
            "model": self.config.deepseek_model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
            "max_tokens": 1800,
        }
        if self.config.deepseek_model.startswith("deepseek-v4"):
            request_body["thinking"] = {"type": "disabled"}
        try:
            response = request_json(
                "https://api.deepseek.com/chat/completions", method="POST", body=request_body,
                headers={"Authorization": "Bearer {}".format(self.config.deepseek_api_key)},
                timeout=90,
            )
            content = response["choices"][0]["message"]["content"]
            if not content:
                raise DeepSeekError("DeepSeek返回内容为空")
            return AnalysisResult.from_dict(json.loads(content))
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise DeepSeekError("DeepSeek返回结构无效：{}".format(str(exc)[:300])) from exc
        except HttpJsonError as exc:
            raise DeepSeekError("DeepSeek调用失败：{}".format(exc)) from exc

    def check(self) -> str:
        body: Dict[str, Any] = {
            "model": self.config.deepseek_model,
            "messages": [{"role": "user", "content": "只回复OK"}],
            "max_tokens": 10,
            "temperature": 0,
        }
        if self.config.deepseek_model.startswith("deepseek-v4"):
            body["thinking"] = {"type": "disabled"}
        try:
            response = request_json(
                "https://api.deepseek.com/chat/completions", method="POST", body=body,
                headers={"Authorization": "Bearer {}".format(self.config.deepseek_api_key)},
                timeout=60,
            )
            return str(response["choices"][0]["message"]["content"] or "").strip()
        except (HttpJsonError, KeyError, IndexError, TypeError) as exc:
            raise DeepSeekError("DeepSeek连接测试失败：{}".format(exc)) from exc

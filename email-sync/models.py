"""Small validated domain models used between system boundaries."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


ALLOWED_EVENT_KINDS = {
    "invitation", "reminder", "reschedule", "cancellation", "result", "offer", "other"
}


def clean_text(value: Any, limit: int = 4000) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("\x00", "").split())[:limit]


@dataclass
class ParsedEmail:
    uid: int
    message_id: str
    subject: str
    sender: str
    received_at: datetime
    body: str
    urls: List[str] = field(default_factory=list)
    attachment_names: List[str] = field(default_factory=list)


@dataclass
class ProcessEvent:
    company: str
    job_name: str
    process_name: str
    event_kind: str = "other"
    stage_type: str = ""
    interview_round: Optional[int] = None
    process_status: str = ""
    process_result: str = ""
    planned_at: Optional[str] = None
    completed_at: Optional[str] = None
    method: str = ""
    meeting_url: str = ""
    next_action: str = ""
    assessment_content: str = ""
    contact: str = ""
    remark: str = ""
    summary: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProcessEvent":
        if not isinstance(data, dict):
            raise ValueError("事件必须是 JSON 对象")
        round_value = data.get("interview_round")
        if round_value in (None, ""):
            parsed_round = None
        else:
            parsed_round = int(round_value)
            if parsed_round < 0 or parsed_round > 20:
                raise ValueError("面试轮次超出合理范围")
        kind = clean_text(data.get("event_kind"), 30).lower() or "other"
        if kind not in ALLOWED_EVENT_KINDS:
            kind = "other"
        return cls(
            company=clean_text(data.get("company"), 200),
            job_name=clean_text(data.get("job_name"), 200),
            process_name=clean_text(data.get("process_name"), 300),
            event_kind=kind,
            stage_type=clean_text(data.get("stage_type"), 100),
            interview_round=parsed_round,
            process_status=clean_text(data.get("process_status"), 100),
            process_result=clean_text(data.get("process_result"), 100),
            planned_at=data.get("planned_at") or None,
            completed_at=data.get("completed_at") or None,
            method=clean_text(data.get("method"), 100),
            meeting_url=clean_text(data.get("meeting_url"), 2000),
            next_action=clean_text(data.get("next_action"), 1000),
            assessment_content=clean_text(data.get("assessment_content"), 2000),
            contact=clean_text(data.get("contact"), 500),
            remark=clean_text(data.get("remark"), 2000),
            summary=clean_text(data.get("summary"), 1000),
        )


@dataclass
class AnalysisResult:
    is_recruitment_email: bool
    confidence: float
    events: List[ProcessEvent]

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AnalysisResult":
        if not isinstance(data, dict):
            raise ValueError("模型输出必须是 JSON 对象")
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0))))
        events = [ProcessEvent.from_dict(item) for item in (data.get("events") or [])]
        return cls(bool(data.get("is_recruitment_email")), confidence, events)

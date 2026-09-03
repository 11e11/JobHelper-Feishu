import sys
import tempfile
import unittest
from datetime import timezone
from email.message import EmailMessage
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from mail_parser import html_to_text, parse_email
from models import AnalysisResult, ParsedEmail
from feishu_client import FeishuClient
from repository import Repository
from service import SyncService, _parse_timestamp, _valid_url


class MailParserTests(unittest.TestCase):
    def test_parses_encoded_html_mail_without_marking_state(self):
        msg = EmailMessage()
        msg["Subject"] = "XX科技后端开发一面邀请"
        msg["From"] = "招聘团队 <hr@example.com>"
        msg["Date"] = "Thu, 3 Sep 2026 10:00:00 +0800"
        msg["Message-ID"] = "<test-1@example.com>"
        msg.set_content("您好，请参加面试。")
        msg.add_alternative('<p>时间：9月10日14:30</p><a href="https://meet.example/x">进入</a>', subtype="html")
        parsed = parse_email(msg.as_bytes(), 12)
        self.assertEqual(parsed.message_id, "<test-1@example.com>")
        self.assertIn("面试", parsed.body)
        self.assertIn("https://meet.example/x", parsed.urls)
        self.assertEqual(parsed.received_at.utcoffset().total_seconds(), 8 * 3600)

    def test_html_cleanup(self):
        self.assertEqual(html_to_text("<p>A&nbsp;B</p><script>x</script><div>C</div>"), "A B\nC")


class ModelTests(unittest.TestCase):
    def test_multiple_events_validate(self):
        result = AnalysisResult.from_dict({
            "is_recruitment_email": True,
            "confidence": 1.7,
            "events": [{"company": "A", "job_name": "B", "process_name": "一面", "interview_round": "1"}],
        })
        self.assertEqual(result.confidence, 1.0)
        self.assertEqual(result.events[0].interview_round, 1)

    def test_time_and_url_validation(self):
        self.assertEqual(_parse_timestamp("2026-09-10T14:30:00+08:00"), 1789021800000)
        self.assertTrue(_valid_url("https://example.com/a"))
        self.assertFalse(_valid_url("javascript:alert(1)"))


class RepositoryTests(unittest.TestCase):
    def test_cursor_and_idempotency(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Repository(Path(directory) / "state.db")
            self.assertIsNone(repo.get_cursor("a@163.com", "INBOX"))
            repo.set_cursor("a@163.com", "INBOX", 9)
            self.assertEqual(repo.get_cursor("a@163.com", "INBOX"), 9)
            repo.mark("id", 10, "subject", "completed")
            self.assertTrue(repo.is_terminal("id"))
            repo.close()


class MatchingTests(unittest.TestCase):
    def test_only_unique_existing_process_is_updated(self):
        event = AnalysisResult.from_dict({
            "is_recruitment_email": True, "confidence": .9,
            "events": [{"company": "示例科技有限公司", "job_name": "后端", "process_name": "后端一面",
                        "event_kind": "reschedule", "stage_type": "面试", "interview_round": 1}],
        }).events[0]
        records = [{"record_id": "r1", "fields": {
            "公司": "示例科技", "岗位名称": "后端", "环节类型": "一面", "面试轮次": 1,
        }}]
        self.assertEqual(SyncService._find_updatable(records, event)["record_id"], "r1")
        self.assertIsNone(SyncService._find_updatable(records + [records[0]], event))

    def test_sender_is_not_written_as_contact_without_body_evidence(self):
        event = AnalysisResult.from_dict({
            "is_recruitment_email": True, "confidence": .9,
            "events": [{"company": "A", "job_name": "B", "process_name": "一面",
                        "contact": "Sender <sender@example.com>"}],
        }).events[0]
        message = ParsedEmail(1, "id", "", "Sender <sender@example.com>",
                              __import__("datetime").datetime.now(timezone.utc), "请参加面试")
        service = object.__new__(SyncService)
        service.feishu = FeishuClient.__new__(FeishuClient)
        schema = {
            "流程名称": {"type": 1}, "公司": {"type": 1}, "岗位名称": {"type": 1},
            "面试官或联系人": {"type": 1},
        }
        fields = service._to_fields(message, AnalysisResult(True, .9, [event]), event, schema)
        self.assertNotIn("面试官或联系人", fields)


if __name__ == "__main__":
    unittest.main()

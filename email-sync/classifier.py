"""Cheap local screening before an email is sent to the model."""

import re

from models import ParsedEmail


POSITIVE = re.compile(
    r"招聘|校招|应聘|申请进度|候选人|简历|岗位|职位|笔试|测评|面试|面谈|"
    r"录用|offer|入职|感谢.{0,8}(关注|申请|应聘)|未能.{0,8}(通过|进入)", re.IGNORECASE
)
STRONG_NEGATIVE = re.compile(
    r"验证码|账单|发票|支付成功|物流|订阅确认|广告推广|营销邮件", re.IGNORECASE
)


def might_be_recruitment(message: ParsedEmail) -> bool:
    sample = "{}\n{}\n{}".format(message.subject, message.sender, message.body[:12000])
    if POSITIVE.search(sample):
        return True
    if STRONG_NEGATIVE.search(sample):
        return False
    # Unknown mail is intentionally passed to the model. This avoids silently
    # missing terse invitations such as an English-only scheduling email.
    return bool(message.body.strip())


"""Feishu Bitable Open API client and schema-aware serialization."""

import time
from typing import Any, Dict, List, Optional, Set
from urllib.parse import quote, urlencode

from config import Config
from http_json import HttpJsonError, request_json


API_BASE = "https://open.feishu.cn/open-apis"
FIELD_TYPES = {1: "文本", 2: "数字", 3: "单选", 5: "日期", 15: "超链接", 18: "单向关联"}


class FeishuError(RuntimeError):
    pass


class FeishuClient:
    def __init__(self, config: Config):
        self.config = config
        self._token = ""
        self._expires_at = 0.0

    def _get_token(self) -> str:
        if self._token and time.time() < self._expires_at:
            return self._token
        try:
            data = request_json(
                API_BASE + "/auth/v3/tenant_access_token/internal", method="POST",
                body={"app_id": self.config.feishu_app_id,
                      "app_secret": self.config.feishu_app_secret}, timeout=30,
            )
        except HttpJsonError as exc:
            raise FeishuError("飞书鉴权失败：{}".format(exc)) from exc
        if data.get("code") != 0 or not data.get("tenant_access_token"):
            raise FeishuError("飞书鉴权失败（code {}）：{}".format(data.get("code"), data.get("msg")))
        self._token = data["tenant_access_token"]
        self._expires_at = time.time() + max(60, int(data.get("expire", 7200)) - 300)
        return self._token

    def _request(self, path: str, method: str = "GET", body: Any = None,
                 retried: bool = False) -> Dict[str, Any]:
        try:
            data = request_json(API_BASE + path, method=method, body=body,
                                headers={"Authorization": "Bearer {}".format(self._get_token())})
        except HttpJsonError as exc:
            if exc.status == 401 and not retried:
                self._token = ""
                return self._request(path, method, body, True)
            raise FeishuError("飞书请求失败：{}".format(exc)) from exc
        if data.get("code") != 0:
            code = data.get("code")
            if code in (99991661, 99991663, 99991664, 99991665, 99991668) and not retried:
                self._token = ""
                return self._request(path, method, body, True)
            raise FeishuError("飞书接口错误（code {}）：{}".format(code, data.get("msg")))
        return data.get("data") or {}

    @property
    def table_path(self) -> str:
        return "/bitable/v1/apps/{}/tables/{}".format(
            quote(self.config.feishu_app_token, safe=""),
            quote(self.config.feishu_process_table_id, safe=""),
        )

    def list_fields(self) -> List[Dict[str, Any]]:
        fields: List[Dict[str, Any]] = []
        page_token = ""
        while True:
            params = {"page_size": 100}
            if page_token:
                params["page_token"] = page_token
            data = self._request(self.table_path + "/fields?" + urlencode(params))
            fields.extend(data.get("items") or [])
            if not data.get("has_more"):
                break
            page_token = data.get("page_token") or ""
        return fields

    def list_records(self) -> List[Dict[str, Any]]:
        records: List[Dict[str, Any]] = []
        page_token = ""
        while True:
            params = {"page_size": 500}
            if page_token:
                params["page_token"] = page_token
            data = self._request(self.table_path + "/records?" + urlencode(params))
            records.extend(data.get("items") or [])
            if not data.get("has_more"):
                break
            page_token = data.get("page_token") or ""
        return records

    def create_record(self, fields: Dict[str, Any]) -> str:
        data = self._request(self.table_path + "/records", "POST", {"fields": fields})
        return data["record"]["record_id"]

    def update_record(self, record_id: str, fields: Dict[str, Any]) -> str:
        data = self._request(self.table_path + "/records/{}".format(quote(record_id, safe="")),
                             "PUT", {"fields": fields})
        return data["record"]["record_id"]

    @staticmethod
    def schema(fields: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        return {item.get("field_name", ""): item for item in fields if item.get("field_name")}

    @staticmethod
    def select_options(field: Dict[str, Any]) -> Set[str]:
        options = (field.get("property") or {}).get("options") or []
        return {str(item.get("name")) for item in options if item.get("name")}

    def check_schema(self) -> Dict[str, Dict[str, Any]]:
        schema = self.schema(self.list_fields())
        required = {"流程名称": 1, "公司": 1, "岗位名称": 1}
        missing = [name for name in required if name not in schema]
        wrong = ["{}（实际{}）".format(name, FIELD_TYPES.get(schema[name].get("type"), schema[name].get("type")))
                 for name, expected in required.items()
                 if name in schema and schema[name].get("type") != expected]
        if missing:
            raise FeishuError("流程记录表缺少必要字段：{}".format("、".join(missing)))
        if wrong:
            raise FeishuError("以下字段必须是文本：{}".format("、".join(wrong)))
        return schema


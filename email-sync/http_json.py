"""Minimal JSON HTTP client using the Python standard library."""

import json
import socket
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class HttpJsonError(RuntimeError):
    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


def request_json(url: str, method: str = "GET", body: Any = None,
                 headers: Optional[Dict[str, str]] = None, timeout: int = 45) -> Dict[str, Any]:
    request_headers = {"Accept": "application/json"}
    request_headers.update(headers or {})
    payload = None
    if body is not None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json; charset=utf-8")
    request = Request(url, data=payload, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")[:1000]
        try:
            detail = json.loads(raw).get("error", {}).get("message") or json.loads(raw).get("msg")
        except (json.JSONDecodeError, AttributeError):
            detail = raw
        raise HttpJsonError("HTTP {}：{}".format(exc.code, detail or "请求失败"), exc.code) from exc
    except (URLError, socket.timeout, OSError) as exc:
        raise HttpJsonError("网络请求失败：{}".format(str(exc)[:500])) from exc
    except json.JSONDecodeError as exc:
        raise HttpJsonError("接口返回的不是合法JSON") from exc


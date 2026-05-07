"""Notion API クライアント（Streamlit UI用）"""
from __future__ import annotations

import requests

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


class NotionClient:
    def __init__(self, token: str, lp_db: str, runs_db: str, profiles_db: str):
        self.token = token
        self.lp_db = lp_db
        self.runs_db = runs_db
        self.profiles_db = profiles_db
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        }

    def _api(self, method: str, endpoint: str, json: dict | None = None) -> dict:
        url = f"{NOTION_API_BASE}{endpoint}"
        res = requests.request(method, url, headers=self.headers, json=json, timeout=15)
        res.raise_for_status()
        return res.json()

    @staticmethod
    def _text(prop: dict, key: str) -> str:
        v = prop.get(key, {})
        rt = v.get("rich_text") or v.get("title") or []
        return rt[0]["plain_text"] if rt else ""

    @staticmethod
    def _select(prop: dict, key: str) -> str:
        v = prop.get(key, {}).get("select") or {}
        return v.get("name", "") or ""

    @staticmethod
    def _url(prop: dict, key: str) -> str:
        return prop.get(key, {}).get("url", "") or ""

    @staticmethod
    def _number(prop: dict, key: str):
        return prop.get(key, {}).get("number")

    @staticmethod
    def _date(prop: dict, key: str) -> str:
        v = prop.get(key, {}).get("date") or {}
        return v.get("start", "") or ""

    @staticmethod
    def _relation_id(prop: dict, key: str) -> str | None:
        rel = prop.get(key, {}).get("relation") or []
        return rel[0]["id"] if rel else None

    def list_lps(self) -> list[dict]:
        """LP一覧。状態が「下書き」のものは除く"""
        data = self._api(
            "POST",
            f"/databases/{self.lp_db}/query",
            json={"page_size": 100},
        )
        out = []
        for page in data.get("results", []):
            p = page["properties"]
            out.append({
                "id": page["id"],
                "name": self._text(p, "Name"),
                "url": self._url(p, "URL"),
                "form_type": self._select(p, "フォーム形式"),
                "scenario_id": self._text(p, "シナリオID"),
                "status": self._select(p, "状態"),
                "memo": self._text(p, "メモ"),
                "profile_id": self._relation_id(p, "顧客プロファイル"),
            })
        return out

    def list_runs(self, limit: int = 30, lp_id: str | None = None) -> list[dict]:
        body = {
            "page_size": limit,
            "sorts": [{"property": "開始時刻", "direction": "descending"}],
        }
        if lp_id:
            body["filter"] = {"property": "LP", "relation": {"contains": lp_id}}
        data = self._api("POST", f"/databases/{self.runs_db}/query", json=body)
        out = []
        for page in data.get("results", []):
            p = page["properties"]
            out.append({
                "id": page["id"],
                "run_id": self._text(p, "実行ID"),
                "lp_id": self._relation_id(p, "LP"),
                "status": self._select(p, "ステータス"),
                "trigger": self._select(p, "トリガー"),
                "started_at": self._date(p, "開始時刻"),
                "completed_at": self._date(p, "完了時刻"),
                "customer_email": self._text(p, "顧客メアド"),
                "order_number": self._text(p, "注文番号"),
                "thank_you_match": self._text(p, "サンキュー検出"),
                "error": self._text(p, "エラー"),
                "duration_seconds": self._number(p, "所要時間(秒)"),
                "url": page.get("url", ""),
            })
        return out

    def list_profiles(self) -> list[dict]:
        data = self._api(
            "POST",
            f"/databases/{self.profiles_db}/query",
            json={"page_size": 100},
        )
        out = []
        for page in data.get("results", []):
            p = page["properties"]
            out.append({
                "id": page["id"],
                "name": self._text(p, "プロファイル名"),
                "last_name": self._text(p, "姓"),
                "first_name": self._text(p, "名"),
                "email_domain": self._text(p, "メアドドメイン"),
                "card_number_masked": self._mask_card(self._text(p, "カード番号")),
                "memo": self._text(p, "メモ"),
            })
        return out

    @staticmethod
    def _mask_card(num: str) -> str:
        if not num or len(num) < 8:
            return "****"
        return f"{num[:4]} **** **** {num[-4:]}"

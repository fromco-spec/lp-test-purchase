"""GitHub API クライアント（Actions ワークフロー起動）"""
from __future__ import annotations

import requests

GITHUB_API_BASE = "https://api.github.com"


class GitHubClient:
    def __init__(self, repo: str, token: str):
        self.repo = repo
        self.token = token
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def trigger_workflow(self, lp_scenario: str, trigger: str = "API") -> bool:
        """repository_dispatch でワークフロー起動"""
        url = f"{GITHUB_API_BASE}/repos/{self.repo}/dispatches"
        res = requests.post(
            url,
            headers=self.headers,
            json={
                "event_type": "run_test_purchase",
                "client_payload": {"lp_scenario": lp_scenario, "trigger": trigger},
            },
            timeout=15,
        )
        if res.status_code == 204:
            return True
        raise RuntimeError(f"GitHub trigger failed: {res.status_code} {res.text[:300]}")

    def list_recent_runs(self, limit: int = 5, event: str | None = None) -> list[dict]:
        url = f"{GITHUB_API_BASE}/repos/{self.repo}/actions/runs"
        params = {"per_page": limit}
        if event:
            params["event"] = event
        res = requests.get(url, headers=self.headers, params=params, timeout=15)
        res.raise_for_status()
        data = res.json()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "status": r["status"],
                "conclusion": r["conclusion"],
                "created_at": r["created_at"],
                "html_url": r["html_url"],
                "event": r["event"],
            }
            for r in data.get("workflow_runs", [])
        ]

    def get_run(self, run_id: int) -> dict:
        url = f"{GITHUB_API_BASE}/repos/{self.repo}/actions/runs/{run_id}"
        res = requests.get(url, headers=self.headers, timeout=15)
        res.raise_for_status()
        return res.json()

    def get_run_jobs(self, run_id: int) -> list[dict]:
        url = f"{GITHUB_API_BASE}/repos/{self.repo}/actions/runs/{run_id}/jobs"
        res = requests.get(url, headers=self.headers, timeout=15)
        res.raise_for_status()
        return res.json().get("jobs", [])

    def actions_url(self) -> str:
        return f"https://github.com/{self.repo}/actions"

#!/usr/bin/env python3
"""Fetch Kweichow Moutai financial report / announcement list.

First version records report events and basic financial report metadata.
It does not parse PDF financial metrics yet.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REPORT_FILE = DATA_DIR / "financialReports.json"
EVENT_FILE = DATA_DIR / "events.json"
STATUS_FILE = DATA_DIR / "dataSourceStatus.json"
DEFAULT_REPORT_URLS = [
    "https://www.moutaichina.com/mtgf/tzzgx/cwbg/index.html",
    "https://www.moutaichina.com/mtgf/tzzgx/gsgg/index.html",
]


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def update_status(success: bool, message: str, records: int = 0) -> None:
    status = read_json(STATUS_FILE, {})
    status["updatedAt"] = now_text()
    status["financialReports"] = {
        "success": success,
        "source": "贵州茅台官网",
        "updatedAt": now_text(),
        "message": message,
        "records": records,
    }
    write_json(STATUS_FILE, status)


def detect_report_type(title: str):
    if "年度报告" in title:
        return "annual"
    if "第一季度报告" in title:
        return "q1"
    if "半年度报告" in title:
        return "half"
    if "第三季度报告" in title:
        return "q3"
    return None


def detect_period(title: str, report_type: str | None):
    match = re.search(r"(20\d{2})", title)
    if not match:
        return None
    year = match.group(1)
    suffix = {"annual": "", "q1": "Q1", "half": "H1", "q3": "Q3"}.get(report_type, "")
    return f"{year}{suffix}"


def parse_date(text: str):
    match = re.search(r"(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2})", text)
    if not match:
        return datetime.now().strftime("%Y-%m-%d")
    raw = match.group(1).replace("年", "-").replace("月", "-").replace("/", "-").replace(".", "-")
    raw = raw.replace("日", "")
    return datetime.strptime(raw, "%Y-%m-%d").strftime("%Y-%m-%d")


def fetch_reports(url: str) -> list[dict]:
    response = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    response.encoding = response.apparent_encoding or response.encoding
    soup = BeautifulSoup(response.text, "lxml")
    reports = []
    for link in soup.find_all("a"):
        title = " ".join(link.get_text(" ", strip=True).split())
        href = link.get("href")
        if not title or not href:
            continue
        report_type = detect_report_type(title)
        if not report_type:
            continue
        full_url = urljoin(url, href)
        parent_text = link.parent.get_text(" ", strip=True) if link.parent else title
        reports.append({
            "title": title,
            "date": parse_date(parent_text),
            "url": full_url,
            "reportType": report_type,
            "period": detect_period(title, report_type),
        })
    return reports


def upsert_events(existing: list[dict], reports: list[dict]) -> list[dict]:
    rows = list(existing)
    keys = {(r.get("date"), r.get("title"), r.get("sourceUrl")) for r in rows}
    for report in reports:
        row = {
            "date": report["date"],
            "type": "financial",
            "title": report["title"],
            "description": "贵州茅台官网财务报告/公告列表自动抓取",
            "impact": "neutral",
            "source": "贵州茅台官网",
            "sourceUrl": report["url"],
            "verified": True,
            "sample": False,
            "note": "第一阶段仅抓取报告列表，暂未解析PDF财务指标",
        }
        key = (row["date"], row["title"], row["sourceUrl"])
        if key not in keys:
            rows.append(row)
            keys.add(key)
    return sorted(rows, key=lambda x: x.get("date", ""))


def upsert_financial_reports(existing: list[dict], reports: list[dict]) -> list[dict]:
    rows = list(existing)
    by_period = {r.get("period"): i for i, r in enumerate(rows) if r.get("period")}
    for report in reports:
        if not report.get("period"):
            continue
        row = {
            "period": report["period"],
            "reportType": report["reportType"],
            "source": "贵州茅台官网",
            "sourceUrl": report["url"],
            "updatedAt": now_text(),
            "sample": False,
            "verified": True,
            "note": report["title"],
        }
        if report["period"] in by_period:
            rows[by_period[report["period"]]] = {**rows[by_period[report["period"]]], **row}
        else:
            rows.append(row)
            by_period[report["period"]] = len(rows) - 1
    return sorted(rows, key=lambda x: x.get("period", ""))


def main() -> int:
    load_dotenv(ROOT / ".env")
    urls = [u.strip() for u in os.getenv("MOUTAI_REPORTS_URL", "").split(",") if u.strip()] or DEFAULT_REPORT_URLS
    old_reports = read_json(REPORT_FILE, [])
    old_events = read_json(EVENT_FILE, [])
    errors = []
    reports = []
    for url in urls:
        try:
            reports = fetch_reports(url)
            if reports:
                break
            errors.append(f"{url}: 未发现财报链接")
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    if not reports:
        update_status(False, f"财报列表更新失败：{'；'.join(errors)}", len(old_reports))
        print(f"[financial] failed: {'; '.join(errors)}")
        print("[financial] old financialReports.json and events.json preserved")
        return 1
    write_json(EVENT_FILE, upsert_events(old_events, reports))
    new_reports = upsert_financial_reports(old_reports, reports)
    write_json(REPORT_FILE, new_reports)
    update_status(True, "财报列表更新成功", len(new_reports))
    print(f"[financial] success: {len(reports)} report links, {len(new_reports)} report records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

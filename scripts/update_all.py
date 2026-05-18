#!/usr/bin/env python3
"""Run all data update tasks. One failure does not block the rest."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STATUS_FILE = DATA_DIR / "dataSourceStatus.json"
UPDATE_LOG_FILE = DATA_DIR / "updateLog.json"

TASKS = [
    ("stock", "update_stock_data.py"),
    ("winePrice", "update_wine_price.py"),
    ("financialReports", "update_financial_reports.py"),
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


def latest_by_date(rows: list[dict], key: str = "date") -> dict:
    clean = [row for row in rows if isinstance(row, dict) and row.get(key)]
    return sorted(clean, key=lambda row: row.get(key, ""))[-1] if clean else {}


def update_log_entry(summary: dict) -> dict:
    wine_rows = read_json(DATA_DIR / "winePrices.json", [])
    source_rows = read_json(DATA_DIR / "winePriceSourcePoints.json", [])
    events = read_json(DATA_DIR / "events.json", [])
    stock = read_json(DATA_DIR / "stockDaily.json", [])
    reports = read_json(DATA_DIR / "financialReports.json", [])
    wine_rows = wine_rows if isinstance(wine_rows, list) else []
    source_rows = source_rows if isinstance(source_rows, list) else []
    latest_wine = latest_by_date([row for row in source_rows if row.get("verified") is True and row.get("estimated") is False])
    failed = [key for key, item in summary.items() if item.get("failed")]
    skipped = [key for key, item in summary.items() if item.get("skipped")]
    if failed:
        title = "数据自动更新部分失败"
        status = "failed"
        summary_text = "脚本已运行，部分数据源失败，旧数据已保留。"
    elif skipped:
        title = "数据自动更新完成，部分来源跳过"
        status = "no_change"
        summary_text = "脚本已运行，部分数据源没有启用或没有发现新数据。"
    else:
        title = "数据自动更新完成"
        status = "success"
        summary_text = "脚本已运行，页面可通过本公告确认最近一次更新时间。"
    return {
        "updatedAt": now_text(),
        "title": title,
        "summary": summary_text,
        "changes": [f"{key}: {item.get('message', '')}" for key, item in summary.items()],
        "dataStats": {
            "winePrices": len(wine_rows),
            "wineEstimatedPoints": len([row for row in wine_rows if row.get("estimated") is True]),
            "wineRealDisplayPoints": len([row for row in wine_rows if row.get("estimated") is False and row.get("verified") is True]),
            "wineSourcePoints": len(source_rows),
            "events": len(events) if isinstance(events, list) else 0,
        },
        "latestData": {
            "latestWineDate": latest_wine.get("date"),
            "latestWinePrice": latest_wine.get("bottlePrice"),
            "latestStockDate": latest_by_date(stock if isinstance(stock, list) else []).get("date"),
            "latestFinancialPeriod": latest_by_date(reports if isinstance(reports, list) else [], "period").get("period"),
        },
        "source": "scripts/update_all.py",
        "status": status,
    }


def append_update_log(entry: dict) -> None:
    try:
        logs = read_json(UPDATE_LOG_FILE, [])
        logs = logs if isinstance(logs, list) else []
        write_json(UPDATE_LOG_FILE, (logs + [entry])[-30:])
    except Exception as exc:
        print(f"[update_all] updateLog write failed: {exc}")


def extract_failure_message(result: subprocess.CompletedProcess[str]) -> str:
    lines = []
    lines.extend(line.strip() for line in result.stderr.splitlines() if line.strip())
    lines.extend(line.strip() for line in result.stdout.splitlines() if line.strip())
    for line in reversed(lines):
        if "pip install -r requirements.txt" in line or "failed" in line.lower() or "失败" in line:
            return line
    return lines[-1] if lines else f"failed with code {result.returncode}"


def write_task_failure_status(key: str, message: str, script: str) -> None:
    status = read_json(STATUS_FILE, {})
    old = status.get(key, {}) if isinstance(status.get(key), dict) else {}
    status["updatedAt"] = now_text()
    status[key] = {
        **old,
        "success": False,
        "skipped": False,
        "updatedAt": now_text(),
        "message": message,
        "script": script,
        "records": old.get("records", 0),
    }
    write_json(STATUS_FILE, status)


def main() -> int:
    DATA_DIR.mkdir(exist_ok=True)
    summary = {}
    for key, script in TASKS:
        path = Path(__file__).resolve().parent / script
        print(f"==> running {script}")
        env = {**os.environ, "MOUTAI_SUPPRESS_CHILD_UPDATE_LOG": "1"}
        result = subprocess.run([sys.executable, str(path)], cwd=ROOT, text=True, capture_output=True, env=env)
        if result.stdout:
            print(result.stdout.strip())
        if result.stderr:
            print(result.stderr.strip())
        status_after_task = read_json(STATUS_FILE, {})
        task_status = status_after_task.get(key, {})
        skipped = bool(task_status.get("skipped"))
        success = result.returncode == 0 and not skipped
        failed = result.returncode != 0 and not skipped
        failure_message = extract_failure_message(result)
        if failed:
            status_message = task_status.get("message") if task_status.get("success") is False else failure_message
            write_task_failure_status(key, status_message, script)
            task_status = read_json(STATUS_FILE, {}).get(key, {})
        summary[key] = {
            "success": success,
            "skipped": skipped,
            "failed": failed,
            "script": script,
            "message": task_status.get("message") if (skipped or failed) else "ok" if success else failure_message,
        }

    status = read_json(STATUS_FILE, {})
    status["updatedAt"] = now_text()
    status["summary"] = summary
    write_json(STATUS_FILE, status)
    append_update_log(update_log_entry(summary))

    print("\nUpdate summary:")
    for key, result in summary.items():
        if result["skipped"]:
            label = "skipped"
        elif result["success"]:
            label = "success"
        else:
            label = "failed"
        print(f"- {key}: {label} - {result['message']}")
    return 0 if not any(item["failed"] for item in summary.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())

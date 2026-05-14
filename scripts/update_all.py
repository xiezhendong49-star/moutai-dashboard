#!/usr/bin/env python3
"""Run all data update tasks. One failure does not block the rest."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STATUS_FILE = DATA_DIR / "dataSourceStatus.json"
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


def main() -> int:
    DATA_DIR.mkdir(exist_ok=True)
    summary = {}
    for key, script in TASKS:
        path = Path(__file__).resolve().parent / script
        print(f"==> running {script}")
        result = subprocess.run([sys.executable, str(path)], cwd=ROOT, text=True, capture_output=True)
        if result.stdout:
            print(result.stdout.strip())
        if result.stderr:
            print(result.stderr.strip())
        summary[key] = {
            "success": result.returncode == 0,
            "script": script,
            "message": "ok" if result.returncode == 0 else f"failed with code {result.returncode}",
        }
    status = read_json(STATUS_FILE, {})
    status["updatedAt"] = now_text()
    status["summary"] = summary
    write_json(STATUS_FILE, status)
    print("\nUpdate summary:")
    for key, result in summary.items():
        print(f"- {key}: {'success' if result['success'] else result['message']}")
    return 0 if all(item["success"] for item in summary.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())

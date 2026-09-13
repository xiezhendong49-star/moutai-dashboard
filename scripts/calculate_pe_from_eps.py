#!/usr/bin/env python3
"""Calculate provisional PE reference values from stock close and report EPS."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STOCK_FILE = DATA_DIR / "stockDaily.json"
REPORT_FILE = DATA_DIR / "financialReports.json"
STATUS_FILE = DATA_DIR / "dataSourceStatus.json"
AUDIT_SCRIPT = ROOT / "scripts" / "audit_data_quality.py"


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        text = path.read_text(encoding="utf-8").strip()
        return json.loads(text) if text else default
    except Exception:
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def period_end(period: str) -> str | None:
    if not isinstance(period, str) or len(period) < 4:
        return None
    year = period[:4]
    if not year.isdigit():
        return None
    if period.endswith("Q1"):
        return f"{year}-03-31"
    if period.endswith("H1"):
        return f"{year}-06-30"
    if period.endswith("Q3"):
        return f"{year}-09-30"
    if len(period) == 4:
        return f"{year}-12-31"
    return None


def load_eps_reports(rows: list[dict]) -> list[dict]:
    reports = []
    for row in rows:
        end = period_end(row.get("period", ""))
        if end and is_number(row.get("eps")) and row.get("eps") > 0:
            reports.append({
                "period": row.get("period"),
                "periodEnd": end,
                "eps": row.get("eps"),
                "provisional": row.get("provisional") is True,
                "verified": row.get("verified") is True,
                "sourceType": row.get("sourceType"),
            })
    return sorted(reports, key=lambda item: item["periodEnd"])


def match_report(reports: list[dict], date: str) -> dict | None:
    matched = None
    for report in reports:
        if report["periodEnd"] <= date:
            matched = report
        else:
            break
    return matched


def coverage(rows: list[dict]) -> dict:
    total = len(rows)
    available = sum(1 for row in rows if is_number(row.get("peFromEps")))
    return {
        "available": available,
        "total": total,
        "rate": round(available / total, 4) if total else 0,
    }


def update_status(rows: list[dict], message: str, success: bool) -> None:
    status = read_json(STATUS_FILE, {})
    status["updatedAt"] = now_text()
    status["peFromEps"] = {
        "success": success,
        "updatedAt": now_text(),
        "source": "financialReports.eps",
        "message": message,
        "records": coverage(rows)["available"],
        "fieldCompleteness": coverage(rows),
        "provisional": True,
    }
    write_json(STATUS_FILE, status)


def run_quality_audit() -> None:
    if not AUDIT_SCRIPT.exists():
        return
    try:
        subprocess.run([sys.executable, str(AUDIT_SCRIPT)], cwd=ROOT, text=True, check=False)
    except Exception as exc:
        print(f"[peFromEps] data quality audit skipped: {exc}")


def main() -> int:
    stock_rows = read_json(STOCK_FILE, [])
    report_rows = read_json(REPORT_FILE, [])
    stock_rows = stock_rows if isinstance(stock_rows, list) else []
    report_rows = report_rows if isinstance(report_rows, list) else []
    reports = load_eps_reports(report_rows)
    if not stock_rows:
        update_status([], "stockDaily.json 没有可计算的股价记录，未写入 peFromEps", False)
        run_quality_audit()
        print("[peFromEps] skipped: no stock records")
        return 1
    if not reports:
        update_status(stock_rows, "financialReports.json 没有可用 EPS，未写入 peFromEps", False)
        run_quality_audit()
        print("[peFromEps] skipped: no EPS reports")
        return 1

    updated = []
    for row in stock_rows:
        item = dict(row)
        report = match_report(reports, str(item.get("date", "")))
        close = item.get("close")
        if report and is_number(close) and close > 0:
            item["epsUsed"] = report["eps"]
            item["epsPeriod"] = report["period"]
            item["peFromEps"] = round(close / report["eps"], 4)
            item["peSource"] = "financialReports.provisional"
            item["peProvisional"] = True
        updated.append(item)

    write_json(STOCK_FILE, updated)
    stats = coverage(updated)
    update_status(updated, f"peFromEps 已计算 {stats['available']}/{stats['total']} 条", stats["available"] > 0)
    run_quality_audit()
    print(f"[peFromEps] success: {stats['available']}/{stats['total']} records")
    return 0 if stats["available"] > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Audit whether the current data files are usable for analysis."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REPORT_FILE = DATA_DIR / "dataQualityReport.json"
STATUS_FILE = DATA_DIR / "dataSourceStatus.json"


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


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def count_available(rows: list[dict], field: str) -> int:
    return sum(1 for row in rows if is_number(row.get(field)))


def count_verified(rows: list[dict], field: str) -> int:
    return sum(1 for row in rows if is_number(row.get(field)) and row.get("verified") is True)


def completeness(rows: list[dict], field: str) -> dict:
    total = len(rows)
    available = count_available(rows, field)
    return {
        "field": field,
        "available": available,
        "total": total,
        "rate": round(available / total, 4) if total else 0,
    }


def sorted_by_key(rows: list[dict], key: str = "date") -> list[dict]:
    return sorted([row for row in rows if isinstance(row, dict) and row.get(key)], key=lambda row: str(row.get(key)))


def main() -> int:
    stock = read_json(DATA_DIR / "stockDaily.json", [])
    wine = read_json(DATA_DIR / "winePrices.json", [])
    wine_sources = read_json(DATA_DIR / "winePriceSourcePoints.json", [])
    reports = read_json(DATA_DIR / "financialReports.json", [])
    events = read_json(DATA_DIR / "events.json", [])
    stock = stock if isinstance(stock, list) else []
    wine = wine if isinstance(wine, list) else []
    wine_sources = wine_sources if isinstance(wine_sources, list) else []
    reports = reports if isinstance(reports, list) else []
    events = events if isinstance(events, list) else []

    stock_sorted = sorted_by_key(stock)
    stock_dates = {row.get("date") for row in stock if row.get("date") and is_number(row.get("close"))}
    real_wine_sources = [
        row for row in wine_sources
        if row.get("sample") is False and row.get("verified") is True and row.get("estimated") is False
    ]
    matched_wine_stock_dates = sorted({row.get("date") for row in real_wine_sources if row.get("date") in stock_dates})
    pe_ttm_available = count_available(stock, "peTtm")
    real_aligned_count = len(matched_wine_stock_dates)

    report = {
        "updatedAt": now_text(),
        "stock": {
            "records": len(stock),
            "dateRange": {
                "start": stock_sorted[0].get("date") if stock_sorted else None,
                "end": stock_sorted[-1].get("date") if stock_sorted else None,
            },
            "latestDate": stock_sorted[-1].get("date") if stock_sorted else None,
            "fieldCompleteness": {
                "close": completeness(stock, "close"),
                "pe": completeness(stock, "pe"),
                "peTtm": completeness(stock, "peTtm"),
                "peFromEps": completeness(stock, "peFromEps"),
                "pb": completeness(stock, "pb"),
                "dividendYield": completeness(stock, "dividendYield"),
                "totalMarketCap": completeness(stock, "totalMarketCap"),
            },
            "peTtmEnoughForFormalPercentile": pe_ttm_available >= 30,
        },
        "winePrice": {
            "displayRecords": len(wine),
            "sourcePointRecords": len(wine_sources),
            "estimatedTrendRecords": sum(1 for row in wine if row.get("estimated") is True),
            "realDisplayRecords": sum(1 for row in wine if row.get("estimated") is False and row.get("verified") is True),
            "matchedStockDateRecords": real_aligned_count,
            "matchedStockDates": matched_wine_stock_dates,
            "enoughForFormalCorrelation": real_aligned_count >= 5,
        },
        "financialReports": {
            "records": len(reports),
            "epsAvailable": count_available(reports, "eps"),
            "epsVerified": count_verified(reports, "eps"),
            "revenueAvailable": count_available(reports, "revenue"),
            "revenueVerified": count_verified(reports, "revenue"),
            "netProfitAvailable": count_available(reports, "netProfit"),
            "netProfitVerified": count_verified(reports, "netProfit"),
            "provisionalRecords": sum(1 for row in reports if row.get("provisional") is True),
            "officialVerifiedRecords": sum(1 for row in reports if row.get("sourceType") == "official_report" and row.get("verified") is True),
            "note": "当前财报结构化字段已补齐，但主要是 provisional 数据，正式研究需以官方报告核验。",
        },
        "events": {
            "records": len(events),
        },
        "warnings": [
            "估值字段不足，暂不输出正式 PE 分位" if pe_ttm_available < 30 else "",
            "真实有效样本不足，暂不输出正式相关性判断" if real_aligned_count < 5 else "",
        ],
    }
    report["warnings"] = [item for item in report["warnings"] if item]
    write_json(REPORT_FILE, report)

    status = read_json(STATUS_FILE, {})
    if isinstance(status, dict):
        status["dataQuality"] = {
            "success": True,
            "updatedAt": report["updatedAt"],
            "reportFile": "data/dataQualityReport.json",
            "peTtmAvailable": pe_ttm_available,
            "peTtmCompleteness": report["stock"]["fieldCompleteness"]["peTtm"]["rate"],
            "peFromEpsCompleteness": report["stock"]["fieldCompleteness"]["peFromEps"]["rate"],
            "pbCompleteness": report["stock"]["fieldCompleteness"]["pb"]["rate"],
            "dividendYieldCompleteness": report["stock"]["fieldCompleteness"]["dividendYield"]["rate"],
            "totalMarketCapCompleteness": report["stock"]["fieldCompleteness"]["totalMarketCap"]["rate"],
            "wineStockMatchedDates": real_aligned_count,
            "warnings": report["warnings"],
        }
        write_json(STATUS_FILE, status)

    print(f"[audit] wrote {REPORT_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

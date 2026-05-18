#!/usr/bin/env python3
"""Configurable wine price crawler.

The first version supports html_regex sources only. Failures preserve old data.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import datetime, timedelta
from importlib import import_module
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
WINE_FILE = DATA_DIR / "winePrices.json"
SOURCE_POINTS_FILE = DATA_DIR / "winePriceSourcePoints.json"
STATUS_FILE = DATA_DIR / "dataSourceStatus.json"
UPDATE_LOG_FILE = DATA_DIR / "updateLog.json"
SOURCES_FILE = Path(__file__).resolve().parent / "wine_sources.json"


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


def wine_metrics(wine_rows: list[dict], source_rows: list[dict], today_updated: bool | None = None) -> dict:
    real_display_rows = [row for row in wine_rows if row.get("estimated") is False and row.get("verified") is True]
    real_source_rows = [row for row in source_rows if row.get("estimated") is False and row.get("verified") is True and row.get("sample") is False]
    estimated_rows = [row for row in wine_rows if row.get("estimated") is True]
    latest_real = sorted(real_source_rows, key=lambda row: row.get("date", ""))[-1] if real_source_rows else {}
    return {
        "historyRange": {
            "start": min((row.get("date", "") for row in wine_rows), default=""),
            "end": max((row.get("date", "") for row in wine_rows), default=""),
        },
        "displayRecords": len(wine_rows),
        "estimatedRecords": len(estimated_rows),
        "realDisplayRecords": len(real_display_rows),
        "sourcePointLedgerRecords": len(source_rows),
        "sourcePointRecords": len(source_rows),
        "realRecords": len(real_source_rows),
        "latestRealDate": latest_real.get("date", ""),
        "latestRealBottlePrice": latest_real.get("bottlePrice"),
        "latestRealCasePrice": latest_real.get("casePrice"),
        "todayUpdated": latest_real.get("date") == datetime.now().strftime("%Y-%m-%d") if today_updated is None else today_updated,
        "predictionUsesRealSourcePointsOnly": True,
    }


def update_log_entry(status: str, title: str, summary: str, changes: list[str], source: str) -> dict:
    wine_rows = read_json(WINE_FILE, [])
    source_rows = read_json(SOURCE_POINTS_FILE, [])
    events = read_json(DATA_DIR / "events.json", [])
    stock = read_json(DATA_DIR / "stockDaily.json", [])
    reports = read_json(DATA_DIR / "financialReports.json", [])
    wine_rows = wine_rows if isinstance(wine_rows, list) else []
    source_rows = source_rows if isinstance(source_rows, list) else []
    latest_wine = latest_by_date([row for row in source_rows if row.get("verified") is True and row.get("estimated") is False])
    return {
        "updatedAt": now_text(),
        "title": title,
        "summary": summary,
        "changes": changes,
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
        "source": source,
        "status": status,
    }


def append_update_log(entry: dict) -> None:
    if os.environ.get("MOUTAI_SUPPRESS_CHILD_UPDATE_LOG") == "1":
        return
    try:
        logs = read_json(UPDATE_LOG_FILE, [])
        logs = logs if isinstance(logs, list) else []
        write_json(UPDATE_LOG_FILE, (logs + [entry])[-30:])
    except Exception as exc:
        print(f"[wine] updateLog write failed: {exc}")


def update_status(success: bool, message: str, records: int = 0, skipped: bool = False, today_updated: bool | None = None) -> None:
    status = read_json(STATUS_FILE, {})
    wine_rows = read_json(WINE_FILE, [])
    source_rows = read_json(SOURCE_POINTS_FILE, [])
    status["updatedAt"] = now_text()
    status["winePrice"] = {
        **wine_metrics(wine_rows if isinstance(wine_rows, list) else [], source_rows if isinstance(source_rows, list) else [], today_updated),
        "success": success,
        "skipped": skipped,
        "source": "configured_html_sources",
        "updatedAt": now_text(),
        "message": message,
        "records": records,
    }
    write_json(STATUS_FILE, status)


def dependency_error(package: str) -> str:
    return f"缺少依赖 {package}，请先运行：pip install -r requirements.txt"


def require_module(module_name: str, package_name: Optional[str] = None):
    try:
        return import_module(module_name)
    except ModuleNotFoundError as exc:
        missing = package_name or module_name.split(".")[0]
        if exc.name == module_name or exc.name == module_name.split(".")[0]:
            raise RuntimeError(dependency_error(missing)) from exc
        raise


def pick(pattern: str, text: str):
    if not pattern:
        return None
    match = re.search(pattern, text, re.S)
    return match.group(1) if match else None


def fetch_text(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        requests = require_module("requests")
        response = requests.get(url, timeout=20, headers=headers)
        response.raise_for_status()
        response.encoding = response.apparent_encoding or response.encoding
        return response.text
    except RuntimeError:
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace")


def parse_price(value: Optional[str]):
    if not value:
        return None
    return int(round(float(value.replace(",", ""))))


def html_to_text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def history_prices(url: str) -> dict[str, int]:
    text = html_to_text(fetch_text(url))
    matches = re.findall(
        r"￥\s*([0-9]+(?:\.[0-9]+)?)\s+500ml\s+53度\s+瓶\s+(\d{4}-\d{2}-\d{2})",
        text,
        re.S,
    )
    prices = {}
    for price, date in matches:
        prices.setdefault(date, parse_price(price))
    return prices


def recent_dates(dates: set[str], days: int) -> list[str]:
    parsed = []
    for date in dates:
        try:
            parsed.append(datetime.strptime(date, "%Y-%m-%d").date())
        except ValueError:
            continue
    if not parsed:
        return sorted(dates)[-days:]
    latest = max(parsed)
    cutoff = latest - timedelta(days=days - 1)
    return [d.isoformat() for d in sorted(parsed) if d >= cutoff]


def parse_jiangjiujie_moutai_2026(source: dict) -> dict:
    bottle_prices = history_prices(source["bottleHistoryUrl"])
    case_prices = history_prices(source["caseHistoryUrl"])
    if not bottle_prices and not case_prices:
        html = fetch_text(source["url"])
        bottle_price = parse_price(pick(source.get("bottlePricePattern"), html))
        case_price = parse_price(pick(source.get("casePricePattern"), html))
        bottle_date = pick(source.get("bottleDatePattern"), html)
        case_date = pick(source.get("caseDatePattern"), html)
        published_at = bottle_date or case_date or datetime.now().strftime("%Y-%m-%d")
        bottle_prices = {published_at[:10]: bottle_price} if bottle_price is not None else {}
        case_prices = {published_at[:10]: case_price} if case_price is not None else {}

    dates = recent_dates(set(bottle_prices) | set(case_prices), 1)
    if not dates:
        raise RuntimeError(f"{source.get('name')} 未匹配到散瓶或原箱价格")

    date = dates[-1]
    bottle_price = bottle_prices.get(date)
    case_price = case_prices.get(date)
    if bottle_price is not None and case_price is not None and case_price < bottle_price:
        raise RuntimeError(
            f"{source.get('name')} 价格校验失败：{date} 原箱价 {case_price} 低于散瓶价 {bottle_price}"
        )
    return {
        "date": date,
        "product": source.get("product", "53度飞天茅台 500ml 散瓶/散飞"),
        "year": source.get("year", "主口径"),
        "spec": source.get("spec", "500ml"),
        "bottlePrice": bottle_price,
        "casePrice": case_price,
        "priceType": source.get("priceType", "散瓶/散飞展示价"),
        "source": source.get("name"),
        "sourceUrl": source.get("url"),
        "publishedAt": date,
        "updatedAt": now_text(),
        "verified": True,
        "sample": False,
        "estimated": False,
        "sourcePoint": True,
        "stage": source.get("stage", "每日自动更新"),
        "estimationMethod": "actual_source_point",
        "confidence": source.get("confidence", "高"),
        "note": source.get("note", "每日自动抓取真实来源点；抓取失败不会生成估算数据"),
    }


def parse_html_regex(source: dict) -> dict:
    html = fetch_text(source["url"])
    date = pick(source.get("datePattern"), html) or datetime.now().strftime("%Y-%m-%d")
    bottle = pick(source.get("bottlePricePattern"), html)
    case = pick(source.get("casePricePattern"), html)
    if not bottle and not case:
        raise RuntimeError(f"{source.get('name')} 未匹配到散瓶或原箱价格")
    return {
        "date": date,
        "product": source.get("product", "53度飞天茅台"),
        "year": source.get("year", "当年"),
        "spec": source.get("spec", "500ml"),
        "bottlePrice": int(bottle) if bottle else None,
        "casePrice": int(case) if case else None,
        "priceType": source.get("priceType", "批价"),
        "source": source.get("name"),
        "sourceUrl": source.get("url"),
        "updatedAt": now_text(),
        "verified": True,
        "sample": False,
        "estimated": False,
        "sourcePoint": True,
        "note": "自动抓取，需结合来源口径复核",
    }


def upsert(rows: list[dict], row: dict) -> list[dict]:
    key = (row.get("date"), row.get("product"), row.get("year"), row.get("priceType"))
    output = []
    replaced = False
    for old in rows:
        old_key = (old.get("date"), old.get("product"), old.get("year"), old.get("priceType"))
        if old_key == key:
            output.append({**old, **row})
            replaced = True
        else:
            output.append(old)
    if not replaced:
        output.append(row)
    return sorted(output, key=lambda x: x.get("date", ""))


def upsert_many(rows: list[dict], new_rows: list[dict]) -> list[dict]:
    for row in new_rows:
        rows = upsert(rows, row)
    return rows


def main() -> int:
    DATA_DIR.mkdir(exist_ok=True)
    sources = read_json(SOURCES_FILE, [])
    enabled = [s for s in sources if s.get("enabled")]
    old_rows = read_json(WINE_FILE, [])
    old_source_points = read_json(SOURCE_POINTS_FILE, [])
    if not enabled:
        update_status(False, "未配置启用的酒价来源，继续使用最近一次成功数据", len(old_rows), skipped=True)
        append_update_log(update_log_entry(
            "no_change",
            "酒价更新跳过",
            "脚本已运行，但 scripts/wine_sources.json 中没有启用的酒价来源。",
            ["没有新增酒价数据", "旧 winePrices.json 和 winePriceSourcePoints.json 已保留"],
            "scripts/update_wine_price.py",
        ))
        print("[wine] skipped: no enabled source in scripts/wine_sources.json")
        return 0

    rows = old_rows
    source_points = old_source_points
    errors = []
    success_count = 0
    today_updated = False
    for source in enabled:
        try:
            if source.get("parserType") == "jiangjiujie_moutai_2026":
                row = parse_jiangjiujie_moutai_2026(source)
                rows = upsert(rows, row)
                source_points = upsert(source_points, row)
                today_updated = today_updated or row.get("date") == datetime.now().strftime("%Y-%m-%d")
            elif source.get("parserType") == "html_regex":
                row = parse_html_regex(source)
                rows = upsert(rows, row)
                source_points = upsert(source_points, row)
                today_updated = today_updated or row.get("date") == datetime.now().strftime("%Y-%m-%d")
            else:
                raise RuntimeError(f"暂不支持 parserType={source.get('parserType')}")
            success_count += 1
        except Exception as exc:
            errors.append(f"{source.get('name')}: {exc}")

    if success_count:
        write_json(WINE_FILE, rows)
        write_json(SOURCE_POINTS_FILE, source_points)
        added_display = max(0, len(rows) - len(old_rows))
        added_source = max(0, len(source_points) - len(old_source_points))
        log_status = "success" if added_display or added_source or today_updated else "no_change"
        msg = f"酒价更新成功 {success_count} 个来源"
        if errors:
            msg += f"，部分失败：{'；'.join(errors)}"
        update_status(True, msg, len(rows), skipped=False, today_updated=today_updated)
        append_update_log(update_log_entry(
            log_status,
            "酒价每日更新完成" if log_status == "success" else "酒价脚本已运行但没有发现新数据",
            msg if log_status == "success" else "脚本已运行，但没有发现新的酒价日期，当前使用最近一次成功数据。",
            [
                f"winePrices 新增 {added_display} 条，当前 {len(rows)} 条",
                f"winePriceSourcePoints 新增 {added_source} 条，当前 {len(source_points)} 条",
                "抓取失败不会新增 estimated=true 数据，也不会覆盖旧数据",
            ],
            "scripts/update_wine_price.py",
        ))
        print(f"[wine] success: {len(rows)} records")
        return 0

    fail_message = f"今日酒价未更新，当前使用最近一次成功数据：{'；'.join(errors)}"
    update_status(False, fail_message, len(old_rows), skipped=False)
    append_update_log(update_log_entry(
        "failed",
        "酒价每日更新失败",
        fail_message,
        ["未写入新的酒价记录", "旧 winePrices.json 和 winePriceSourcePoints.json 已保留"],
        "scripts/update_wine_price.py",
    ))
    print(f"[wine] failed: {'; '.join(errors)}")
    print("[wine] old winePrices.json preserved")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

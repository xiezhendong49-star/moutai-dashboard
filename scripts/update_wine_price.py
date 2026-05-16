#!/usr/bin/env python3
"""Configurable wine price crawler.

The first version supports html_regex sources only. Failures preserve old data.
"""

from __future__ import annotations

import json
import re
import urllib.request
from datetime import datetime, timedelta
from importlib import import_module
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
WINE_FILE = DATA_DIR / "winePrices.json"
STATUS_FILE = DATA_DIR / "dataSourceStatus.json"
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


def update_status(success: bool, message: str, records: int = 0, skipped: bool = False) -> None:
    status = read_json(STATUS_FILE, {})
    status["updatedAt"] = now_text()
    status["winePrice"] = {
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


def parse_jiangjiujie_moutai_2026(source: dict) -> list[dict]:
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

    dates = recent_dates(set(bottle_prices) | set(case_prices), int(source.get("historyLimitDays", 7)))
    if not dates:
        raise RuntimeError(f"{source.get('name')} 未匹配到散瓶或原箱价格")

    rows = []
    for date in dates:
        bottle_price = bottle_prices.get(date)
        case_price = case_prices.get(date)
        if bottle_price is not None and case_price is not None and case_price < bottle_price:
            raise RuntimeError(
                f"{source.get('name')} 价格校验失败：{date} 原箱价 {case_price} 低于散瓶价 {bottle_price}"
            )
        rows.append(
            {
                "date": date,
                "product": source.get("product", "2026年飞天茅台 53度 500ml"),
                "bottlePrice": bottle_price,
                "casePrice": case_price,
                "source": source.get("name"),
                "sourceUrl": source.get("url"),
                "publishedAt": date,
                "updatedAt": now_text(),
                "verified": True,
                "sample": False,
            }
        )
    return rows


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
        "note": "自动抓取，需结合来源口径复核",
    }


def upsert(rows: list[dict], row: dict) -> list[dict]:
    key = (row.get("date"), row.get("product"), row.get("priceType"), row.get("source"))
    output = []
    replaced = False
    for old in rows:
        old_key = (old.get("date"), old.get("product"), old.get("priceType"), old.get("source"))
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
    if not enabled:
        update_status(False, "未配置启用的酒价来源，继续使用最近一次成功数据", len(old_rows), skipped=True)
        print("[wine] skipped: no enabled source in scripts/wine_sources.json")
        return 0

    rows = old_rows
    errors = []
    success_count = 0
    for source in enabled:
        try:
            if source.get("parserType") == "jiangjiujie_moutai_2026":
                rows = upsert_many(rows, parse_jiangjiujie_moutai_2026(source))
            elif source.get("parserType") == "html_regex":
                rows = upsert(rows, parse_html_regex(source))
            else:
                raise RuntimeError(f"暂不支持 parserType={source.get('parserType')}")
            success_count += 1
        except Exception as exc:
            errors.append(f"{source.get('name')}: {exc}")

    if success_count:
        write_json(WINE_FILE, rows)
        msg = f"酒价更新成功 {success_count} 个来源"
        if errors:
            msg += f"，部分失败：{'；'.join(errors)}"
        update_status(True, msg, len(rows), skipped=False)
        print(f"[wine] success: {len(rows)} records")
        return 0

    update_status(False, f"今日酒价未更新，当前使用最近一次成功数据：{'；'.join(errors)}", len(old_rows), skipped=False)
    print(f"[wine] failed: {'; '.join(errors)}")
    print("[wine] old winePrices.json preserved")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

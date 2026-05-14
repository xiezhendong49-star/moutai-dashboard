#!/usr/bin/env python3
"""Configurable wine price crawler. Supports html_regex sources and preserves old data on failure."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

import requests

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


def update_status(success: bool, message: str, records: int = 0) -> None:
    status = read_json(STATUS_FILE, {})
    status["updatedAt"] = now_text()
    status["winePrice"] = {
        "success": success,
        "source": "configured_html_sources",
        "updatedAt": now_text(),
        "message": message,
        "records": records,
    }
    write_json(STATUS_FILE, status)


def pick(pattern: str, text: str):
    if not pattern:
        return None
    match = re.search(pattern, text, re.S)
    return match.group(1) if match else None


def parse_html_regex(source: dict) -> dict:
    response = requests.get(source["url"], timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    response.encoding = response.apparent_encoding or response.encoding
    html = response.text
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


def main() -> int:
    DATA_DIR.mkdir(exist_ok=True)
    sources = read_json(SOURCES_FILE, [])
    enabled = [s for s in sources if s.get("enabled")]
    old_rows = read_json(WINE_FILE, [])
    if not enabled:
        update_status(False, "没有启用的酒价来源，继续使用最近一次成功数据", len(old_rows))
        print("[wine] skipped: no enabled source in scripts/wine_sources.json")
        return 1
    rows = old_rows
    errors = []
    success_count = 0
    for source in enabled:
        try:
            if source.get("parserType") != "html_regex":
                raise RuntimeError(f"暂不支持 parserType={source.get('parserType')}")
            rows = upsert(rows, parse_html_regex(source))
            success_count += 1
        except Exception as exc:
            errors.append(f"{source.get('name')}: {exc}")
    if success_count:
        write_json(WINE_FILE, rows)
        msg = f"酒价更新成功 {success_count} 个来源"
        if errors:
            msg += f"，部分失败：{'；'.join(errors)}"
        update_status(True, msg, len(rows))
        print(f"[wine] success: {len(rows)} records")
        return 0
    update_status(False, f"今日酒价未更新，当前使用最近一次成功数据：{'；'.join(errors)}", len(old_rows))
    print(f"[wine] failed: {'; '.join(errors)}")
    print("[wine] old winePrices.json preserved")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

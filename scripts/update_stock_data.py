#!/usr/bin/env python3
"""Update Kweichow Moutai stock daily data.

Priority:
1. Tushare when TUSHARE_TOKEN is configured.
2. AkShare fallback when Tushare is unavailable.

Failures never clear existing data.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STOCK_FILE = DATA_DIR / "stockDaily.json"
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


def update_status(success: bool, message: str, records: int = 0, source: str = "tushare/akshare") -> None:
    status = read_json(STATUS_FILE, {})
    status["updatedAt"] = now_text()
    status["stock"] = {
        "success": success,
        "source": source,
        "updatedAt": now_text(),
        "message": message,
        "records": records,
    }
    write_json(STATUS_FILE, status)


def normalize_date(value) -> str:
    text = str(value)
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    return pd.to_datetime(text).strftime("%Y-%m-%d")


def finite(value):
    if value is None or value == "":
        return None
    try:
        if pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def load_from_tushare(token: str, stock_code: str, start_date: str) -> list[dict]:
    import tushare as ts

    ts.set_token(token)
    pro = ts.pro_api()
    end_date = datetime.now().strftime("%Y%m%d")
    daily = pro.daily(ts_code=stock_code, start_date=start_date, end_date=end_date)
    basic = pro.daily_basic(ts_code=stock_code, start_date=start_date, end_date=end_date)
    if daily.empty:
        raise RuntimeError("Tushare daily 返回空数据")

    merged = daily.merge(basic, on=["ts_code", "trade_date"], how="left", suffixes=("", "_basic"))
    rows = []
    updated_at = now_text()
    for _, r in merged.iterrows():
        total_mv = finite(r.get("total_mv"))
        rows.append({
            "date": normalize_date(r.get("trade_date")),
            "open": finite(r.get("open")),
            "high": finite(r.get("high")),
            "low": finite(r.get("low")),
            "close": finite(r.get("close")),
            "pctChange": finite(r.get("pct_chg")),
            "volume": finite(r.get("vol")),
            "amount": finite(r.get("amount")),
            "pe": finite(r.get("pe")),
            "peTtm": finite(r.get("pe_ttm")),
            "pb": finite(r.get("pb")),
            "dividendYield": finite(r.get("dv_ratio")),
            "dividendYieldTtm": finite(r.get("dv_ttm")),
            "totalMarketCap": total_mv,
            "marketCap": total_mv,
            "source": "tushare",
            "updatedAt": updated_at,
            "verified": True,
            "sample": False,
        })
    return sorted(rows, key=lambda x: x["date"])


def load_from_akshare(symbol: str, start_date: str) -> list[dict]:
    import akshare as ak

    end_date = datetime.now().strftime("%Y%m%d")
    hist = ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start_date, end_date=end_date, adjust="")
    if hist.empty:
        raise RuntimeError("AkShare 日线行情返回空数据")

    indicator = None
    try:
        indicator = ak.stock_a_indicator_lg(symbol=symbol)
    except Exception:
        indicator = None

    indicator_map = {}
    if indicator is not None and not indicator.empty:
        for _, r in indicator.iterrows():
            try:
                date = normalize_date(r.get("trade_date") or r.get("日期") or r.get("date"))
                indicator_map[date] = r
            except Exception:
                continue

    rows = []
    updated_at = now_text()
    for _, r in hist.iterrows():
        date = normalize_date(r.get("日期"))
        ind = indicator_map.get(date, {})
        total_mv = finite(ind.get("total_mv") if hasattr(ind, "get") else None)
        rows.append({
            "date": date,
            "open": finite(r.get("开盘")),
            "high": finite(r.get("最高")),
            "low": finite(r.get("最低")),
            "close": finite(r.get("收盘")),
            "pctChange": finite(r.get("涨跌幅")),
            "volume": finite(r.get("成交量")),
            "amount": finite(r.get("成交额")),
            "pe": finite(ind.get("pe") if hasattr(ind, "get") else None),
            "peTtm": finite(ind.get("pe_ttm") if hasattr(ind, "get") else None),
            "pb": finite(ind.get("pb") if hasattr(ind, "get") else None),
            "dividendYield": finite(ind.get("dv_ratio") if hasattr(ind, "get") else None),
            "dividendYieldTtm": finite(ind.get("dv_ttm") if hasattr(ind, "get") else None),
            "totalMarketCap": total_mv,
            "marketCap": total_mv,
            "source": "akshare",
            "updatedAt": updated_at,
            "verified": True,
            "sample": False,
        })
    return sorted(rows, key=lambda x: x["date"])


def main() -> int:
    load_dotenv(ROOT / ".env")
    DATA_DIR.mkdir(exist_ok=True)
    token = os.getenv("TUSHARE_TOKEN", "").strip()
    stock_code = os.getenv("STOCK_CODE", "600519.SH").strip()
    start_date = os.getenv("START_DATE", "20100101").strip()
    symbol = stock_code.split(".")[0]

    try:
        if token:
            rows = load_from_tushare(token, stock_code, start_date)
            source = "tushare"
        else:
            rows = load_from_akshare(symbol, start_date)
            source = "akshare"
        if not rows:
            raise RuntimeError("没有获取到可写入的股价数据")
        write_json(STOCK_FILE, rows)
        update_status(True, "股价和估值数据更新成功", len(rows), source)
        print(f"[stock] success: {len(rows)} records from {source}")
        return 0
    except Exception as exc:
        old_rows = read_json(STOCK_FILE, [])
        update_status(False, f"股价数据更新失败：{exc}", len(old_rows))
        print(f"[stock] failed: {exc}")
        print("[stock] old stockDaily.json preserved")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

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
import subprocess
import sys
from datetime import datetime
from importlib import import_module
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STOCK_FILE = DATA_DIR / "stockDaily.json"
STATUS_FILE = DATA_DIR / "dataSourceStatus.json"
AUDIT_SCRIPT = ROOT / "scripts" / "audit_data_quality.py"


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


def field_coverage(rows: list[dict], field: str) -> dict:
    total = len(rows)
    available = sum(1 for row in rows if is_number(row.get(field)))
    return {
        "available": available,
        "total": total,
        "rate": round(available / total, 4) if total else 0,
    }


def valuation_status(rows: list[dict], source: str) -> dict:
    fields = {
        "pe": field_coverage(rows, "pe"),
        "peTtm": field_coverage(rows, "peTtm"),
        "pb": field_coverage(rows, "pb"),
        "dividendYield": field_coverage(rows, "dividendYield"),
        "dividendYieldTtm": field_coverage(rows, "dividendYieldTtm"),
        "totalMarketCap": field_coverage(rows, "totalMarketCap"),
    }
    filled = any(item["available"] > 0 for item in fields.values())
    return {
        "source": "tushare daily_basic" if source == "tushare" else "akshare price only",
        "filled": filled,
        "message": "估值字段已尝试通过 Tushare daily_basic 补齐" if source == "tushare" else "AkShare 当前未补齐估值字段",
        "fields": fields,
    }


def update_status(success: bool, message: str, records: int = 0, source: str = "tushare/akshare", rows: list[dict] | None = None) -> None:
    status = read_json(STATUS_FILE, {})
    rows = rows if isinstance(rows, list) else []
    status["updatedAt"] = now_text()
    status["stock"] = {
        "success": success,
        "source": source,
        "updatedAt": now_text(),
        "message": message,
        "records": records,
        "valuationFields": valuation_status(rows, source),
    }
    summary = status.get("summary")
    if isinstance(summary, dict):
        summary["stock"] = {
            "success": success,
            "skipped": False,
            "failed": not success,
            "script": "update_stock_data.py",
            "message": message,
        }
    write_json(STATUS_FILE, status)


def run_quality_audit() -> None:
    if not AUDIT_SCRIPT.exists():
        return
    try:
        result = subprocess.run([sys.executable, str(AUDIT_SCRIPT)], cwd=ROOT, text=True, capture_output=True)
        if result.stdout:
            print(result.stdout.strip())
        if result.stderr:
            print(result.stderr.strip())
        if result.returncode != 0:
            print(f"[stock] data quality audit failed with code {result.returncode}")
    except Exception as exc:
        print(f"[stock] data quality audit skipped: {exc}")


def dependency_error(package: str) -> str:
    return f"缺少依赖 {package}，请先运行：pip install -r requirements.txt"


def require_module(module_name: str, package_name: str | None = None):
    try:
        return import_module(module_name)
    except ModuleNotFoundError as exc:
        missing = package_name or module_name.split(".")[0]
        if exc.name == module_name or exc.name == module_name.split(".")[0]:
            raise RuntimeError(dependency_error(missing)) from exc
        raise


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text or text.startswith("#") or "=" not in text:
            continue
        key, value = text.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def normalize_date(value) -> str:
    text = str(value)
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(text[:10], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return text[:10]


def finite(value):
    if value is None or value == "":
        return None
    try:
        if value != value:
            return None
        text = str(value).strip()
        if text.lower() in {"nan", "none", "null", "--"}:
            return None
        return float(text.replace(",", ""))
    except Exception:
        return None


def load_from_tushare(token: str, stock_code: str, start_date: str) -> list[dict]:
    ts = require_module("tushare")

    ts.set_token(token)
    pro = ts.pro_api()
    end_date = datetime.now().strftime("%Y%m%d")
    daily = pro.daily(ts_code=stock_code, start_date=start_date, end_date=end_date)
    if daily.empty:
        raise RuntimeError("Tushare daily 返回空数据")

    try:
        basic = pro.daily_basic(ts_code=stock_code, start_date=start_date, end_date=end_date)
    except Exception:
        basic = None

    if basic is not None and not basic.empty:
        merged = daily.merge(basic, on=["ts_code", "trade_date"], how="left", suffixes=("", "_basic"))
    else:
        merged = daily
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
    ak = require_module("akshare")

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
    if indicator is not None and not empty:
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
            "pctChange": finite(r.get("涊跌幅")),
            "volume": finite(r.get("成交量")),
            "amount": finite(r.get("成交颅")),
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
    DATA_DIR.mkdir(exist_ok=True)
    try:
        load_env_file(ROOT / ".env")

        token = os.getenv("TUSHARE_TOKEN", "").strip()
        stock_code = os.getenv("STOCK_CODE", "600519.SH").strip()
        start_date = os.getenv("START_DATE", "20100101").strip()
        symbol = stock_code.split(".")[0]

        if token:
            rows = load_from_tushare(token, stock_code, start_date)
            source = "tushare"
        else:
            rows = load_from_akshare(symbol, start_date)
            source = "akshare"
        if not rows:
            raise RuntimeError("没有获取到可写入的股价数据�)
        write_json(STOCK_FILE, rows)
        message = "股价和估值数据更新成功" if source == "tushare" else "股价数据更新成功；AkShare 当前未补齐估值字段"
        update_status(True, message, len(rows), source, rows)
        run_quality_audit()
        print(f"[stock] success: {len(rows)} records from {source}")
        return 0
    except Exception as exc:
        old_rows = read_json(STOCK_FILE, [])
        update_status(False, f"股价数据更新失败：{exc}", len(old_rows), rows=old_rows)
        run_quality_audit()
        print(f"[stock] failed: {exc}")
        print("[stock] old stockDaily.json preserved")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

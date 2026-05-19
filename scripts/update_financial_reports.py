#!/usr/bin/env python3
"""Update Kweichow Moutai financial report metadata and key metrics."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime
from importlib import import_module
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REPORT_FILE = DATA_DIR / "financialReports.json"
STATUS_FILE = DATA_DIR / "dataSourceStatus.json"
AUDIT_SCRIPT = ROOT / "scripts" / "audit_data_quality.py"
DEFAULT_REPORT_URLS = [
    "https://www.moutaichina.com/mtgf/tzzgx/cwbg/index.html",
    "https://www.moutaichina.com/mtgf/tzzgx/gsgg/index.html",
]
PUBLIC_METRICS = [
    {"period": "2024Q1", "reportType": "q1", "revenue": 46484738100, "revenueYoY": 18.04, "netProfit": 24065262400, "netProfitYoY": 15.73, "eps": 19.16, "roe": 10.5, "grossMargin": 92.6, "netMargin": 51.77, "operatingCashFlow": 9186000000},
    {"period": "2024H1", "reportType": "half", "revenue": 83451164600, "revenueYoY": 17.76, "netProfit": 41695611000, "netProfitYoY": 15.88, "eps": 33.18, "roe": 18.1, "grossMargin": 91.8, "netMargin": 49.96, "operatingCashFlow": 21000000000},
    {"period": "2024Q3", "reportType": "q3", "revenue": 123122542625, "revenueYoY": 16.95, "netProfit": 60827555210, "netProfitYoY": 15.04, "eps": 48.42, "roe": 27.2, "grossMargin": 91.53, "netMargin": 49.41, "operatingCashFlow": 44421380000},
    {"period": "2024", "reportType": "annual", "revenue": 174144070000, "revenueYoY": 15.66, "netProfit": 86228146400, "netProfitYoY": 15.38, "eps": 68.64, "roe": 38.43, "grossMargin": 91.93, "netMargin": 52.27, "operatingCashFlow": 92463692168},
    {"period": "2025Q1", "reportType": "q1", "revenue": 51443000000, "revenueYoY": 10.67, "netProfit": 26847000000, "netProfitYoY": 11.56, "eps": 21.372, "roe": 10.39, "grossMargin": 91.9, "netMargin": 52.19, "operatingCashFlow": 8809000000},
    {"period": "2025H1", "reportType": "half", "revenue": 91093762554, "revenueYoY": 9.16, "netProfit": 45403000000, "netProfitYoY": 8.89, "eps": 36.15, "roe": 17.65, "grossMargin": 91.5, "netMargin": 49.84, "operatingCashFlow": 13119000000},
    {"period": "2025Q3", "reportType": "q3", "revenue": 130903889635, "revenueYoY": 6.32, "netProfit": 64627000000, "netProfitYoY": 6.25, "eps": 51.53, "roe": 26.37, "grossMargin": 91.29, "netMargin": 51.11, "operatingCashFlow": 38197000000},
    {"period": "2025", "reportType": "annual", "revenue": 172054171891, "revenueYoY": -1.2, "netProfit": 82320000000, "netProfitYoY": -4.53, "eps": 65.53, "roe": 32.0, "grossMargin": 91.3, "netMargin": 47.84, "operatingCashFlow": None},
    {"period": "2026Q1", "reportType": "q1", "revenue": 53909252220.51, "revenueYoY": 6.54, "netProfit": 27243000000, "netProfitYoY": 1.47, "eps": 21.76, "roe": 10.59, "grossMargin": 89.91, "netMargin": 49.8, "operatingCashFlow": 26910000000},
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


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def metrics_coverage(rows: list[dict]) -> dict:
    return {
        "epsAvailable": sum(1 for row in rows if is_number(row.get("eps"))),
        "epsVerified": sum(1 for row in rows if is_number(row.get("eps")) and row.get("verified") is True),
        "revenueAvailable": sum(1 for row in rows if is_number(row.get("revenue"))),
        "revenueVerified": sum(1 for row in rows if is_number(row.get("revenue")) and row.get("verified") is True),
        "netProfitAvailable": sum(1 for row in rows if is_number(row.get("netProfit"))),
        "netProfitVerified": sum(1 for row in rows if is_number(row.get("netProfit")) and row.get("verified") is True),
        "provisionalRecords": sum(1 for row in rows if row.get("provisional") is True),
        "structuredRecords": sum(1 for row in rows if is_number(row.get("eps")) and is_number(row.get("revenue")) and is_number(row.get("netProfit"))),
    }


def update_status(success: bool, message: str, records: int = 0, source: str = "贵州茅台官网 + 公开财报摘要", rows: list[dict] | None = None) -> None:
    status = read_json(STATUS_FILE, {})
    rows = rows if isinstance(rows, list) else []
    coverage = metrics_coverage(rows)
    status["updatedAt"] = now_text()
    status["financialReports"] = {
        "success": success,
        "source": source,
        "updatedAt": now_text(),
        "message": message,
        "records": records,
        "structured": success and coverage["structuredRecords"] > 0,
        "provisional": coverage["provisionalRecords"] > 0,
        "note": "当前财报结构化字段已补齐，但主要是 provisional 数据，正式研究需以官方报告核验。",
        "metricsCoverage": coverage,
    }
    summary = status.get("summary")
    if isinstance(summary, dict):
        summary["financialReports"] = {
            "success": success,
            "skipped": False,
            "failed": not success,
            "script": "update_financial_reports.py",
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
            print(f"[financial] data quality audit failed with code {result.returncode}")
    except Exception as exc:
        print(f"[financial] data quality audit skipped: {exc}")


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


def detect_report_type(title: str):
    if "第一季度报告" in title:
        return "q1"
    if "半年度报告" in title:
        return "half"
    if "第三季度报告" in title:
        return "q3"
    if "年度报告" in title:
        return "annual"
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
    raw = match.group(1).replace("年", "-").replace("月", "-").replace("/", "-").replace(".", "-").replace("日", "")
    return datetime.strptime(raw, "%Y-%m-%d").strftime("%Y-%m-%d")


def fetch_reports(url: str) -> list[dict]:
    requests = require_module("requests")
    soup_cls = require_module("bs4", "beautifulsoup4").BeautifulSoup
    response = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    response.encoding = response.apparent_encoding or response.encoding
    soup = soup_cls(response.text, "lxml")
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
        reports.append({"title": title, "date": parse_date(parent_text), "url": full_url, "reportType": report_type, "period": detect_period(title, report_type)})
    return reports


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
            "provisional": False,
            "sourceType": "official_report",
            "note": report["title"],
        }
        if report["period"] in by_period:
            rows[by_period[report["period"]]] = {**rows[by_period[report["period"]]], **row}
        else:
            rows.append(row)
            by_period[report["period"]] = len(rows) - 1
    return sorted(rows, key=lambda x: x.get("period", ""))


def public_metric_rows() -> list[dict]:
    updated_at = now_text()
    return [{
        **row,
        "source": "公开财报摘要",
        "sourceUrl": "https://stock.quote.stockstar.com/finance_600519.shtml",
        "sourceType": "public_summary",
        "currency": "CNY",
        "unit": "yuan",
        "updatedAt": updated_at,
        "sample": False,
        "verified": False,
        "provisional": True,
        "note": "公开摘要保底数据，未逐项核验官方 PDF",
    } for row in PUBLIC_METRICS]


def fetch_metrics_from_akshare(symbol: str) -> list[dict]:
    ak = require_module("akshare")
    rows = []
    try:
        df = ak.stock_financial_analysis_indicator(symbol=symbol, start_year="2024")
    except Exception:
        return []
    if df is None or getattr(df, "empty", True):
        return []
    column_aliases = {
        "period": ["日期", "报告期", "报告日期"],
        "eps": ["摊薄每股收益(元)", "基本每股收益", "每股收益"],
        "roe": ["净资产收益率(%)", "加权净资产收益率(%)", "净资产收益率"],
        "grossMargin": ["销售毛利率(%)", "毛利率(%)", "毛利率"],
        "netMargin": ["销售净利率(%)", "净利率(%)", "净利率"],
    }

    def pick(record, names):
        for name in names:
            if name in record:
                return record.get(name)
        return None

    for _, record in df.iterrows():
        raw_period = pick(record, column_aliases["period"])
        if not raw_period:
            continue
        text = str(raw_period)[:10]
        period = text[:4]
        if text.endswith("-03-31"):
            period = f"{text[:4]}Q1"
        elif text.endswith("-06-30"):
            period = f"{text[:4]}H1"
        elif text.endswith("-09-30"):
            period = f"{text[:4]}Q3"
        item = {"period": period}
        for field in ("eps", "roe", "grossMargin", "netMargin"):
            value = pick(record, column_aliases[field])
            try:
                item[field] = float(str(value).replace(",", "")) if value not in (None, "") else None
            except Exception:
                item[field] = None
        rows.append(item)
    return rows


def merge_metrics(rows: list[dict], metric_rows: list[dict]) -> list[dict]:
    by_period = {row.get("period"): dict(row) for row in rows if row.get("period")}
    for metric in metric_rows:
        period = metric.get("period")
        if not period:
            continue
        current = by_period.get(period, {})
        report_source = current.get("source")
        report_source_url = current.get("sourceUrl")
        report_note = current.get("note")
        merged = {**current, **metric}
        if metric.get("sourceType") == "public_summary":
            merged.pop("metricSource", None)
            merged.pop("metricSourceUrl", None)
            merged.pop("reportSource", None)
            merged.pop("reportSourceUrl", None)
            merged.pop("reportNote", None)
            merged["verified"] = False
            merged["provisional"] = True
            merged["sourceType"] = "public_summary"
        if report_source_url and metric.get("sourceType") == "public_summary" and current.get("sourceType") == "official_report":
            merged["reportSource"] = report_source
            merged["reportSourceUrl"] = report_source_url
            merged["reportNote"] = report_note
        by_period[period] = merged
    return sorted(by_period.values(), key=lambda x: x.get("period", ""))


def main() -> int:
    DATA_DIR.mkdir(exist_ok=True)
    old_reports = read_json(REPORT_FILE, [])
    old_reports = old_reports if isinstance(old_reports, list) else []
    try:
        dotenv = require_module("dotenv", "python-dotenv")
        dotenv.load_dotenv(ROOT / ".env")
    except Exception:
        pass

    urls = [u.strip() for u in os.getenv("MOUTAI_REPORTS_URL", "").split(",") if u.strip()] or DEFAULT_REPORT_URLS
    errors = []
    report_links = []
    for url in urls:
        try:
            report_links = fetch_reports(url)
            if report_links:
                break
            errors.append(f"{url}: 未发现财报链接")
        except Exception as exc:
            errors.append(f"{url}: {exc}")

    rows = upsert_financial_reports(old_reports, report_links) if report_links else old_reports
    symbol = os.getenv("STOCK_CODE", "600519.SH").split(".")[0]
    metric_source = "公开财报摘要"
    try:
        akshare_metrics = fetch_metrics_from_akshare(symbol)
    except Exception as exc:
        errors.append(f"AkShare structured metrics: {exc}")
        akshare_metrics = []
    metric_rows = merge_metrics(public_metric_rows(), akshare_metrics) if akshare_metrics else public_metric_rows()
    if akshare_metrics:
        metric_source = "AkShare + 公开财报摘要"
    rows = merge_metrics(rows, metric_rows)

    if not rows or metrics_coverage(rows)["structuredRecords"] == 0:
        message = f"财报结构化更新失败，旧数据已保留：{'；'.join(errors)}"
        update_status(False, message, len(old_reports), rows=old_reports)
        run_quality_audit()
        print(f"[financial] failed: {'; '.join(errors)}")
        print("[financial] old financialReports.json preserved")
        return 1

    write_json(REPORT_FILE, rows)
    message = f"财报结构化字段已补齐；来源={metric_source}；当前主要为 provisional 数据，正式研究需以官方报告核验"
    if errors:
        message += f"；部分列表/自动源失败：{'；'.join(errors)}"
    update_status(True, message, len(rows), source=metric_source, rows=rows)
    run_quality_audit()
    coverage = metrics_coverage(rows)
    print(
        "[financial] success: "
        f"{len(rows)} records, eps={coverage['epsAvailable']}/{coverage['epsVerified']} verified, "
        f"revenue={coverage['revenueAvailable']}/{coverage['revenueVerified']} verified, "
        f"netProfit={coverage['netProfitAvailable']}/{coverage['netProfitVerified']} verified"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# 贵州茅台研究型数据看板

一个纯前端的贵州茅台研究型数据看板，用于同时观察飞天茅台酒价、贵州茅台股价、PE 估值、财务数据、业务结构和情景推演。

页面可以直接使用 `seed-data.js` 演示数据打开；运行数据脚本后，会优先读取 `data/*.json` 中的真实数据。

## 当前能力

- 飞天茅台散瓶/原箱价格与贵州茅台股价对比
- 双轴模式和涨跌幅归一化模式
- PE TTM、PE 静态和估值参考线
- 酒价与股价背离观察
- 财务趋势和业务结构看板
- 酒价、股价、财报、事件数据录入
- JSON 导入导出和 CSV 模板下载
- 基于 EPS、利润增速、目标 PE、酒价状态和安全边际的情景推演
- 自动读取 `data/stockDaily.json`、`data/winePrices.json`、`data/financialReports.json`、`data/events.json`
- 展示数据源状态和失败原因

## 安装依赖

```bash
pip install -r requirements.txt
```

## 配置 Tushare

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

填写：

```bash
TUSHARE_TOKEN=你的token
STOCK_CODE=600519.SH
START_DATE=20100101
```

如果不填写 `TUSHARE_TOKEN`，脚本会尝试使用 AkShare。

## 一键更新数据

```bash
python scripts/update_all.py
```

该命令会依次执行：

- `scripts/update_stock_data.py`
- `scripts/update_wine_price.py`
- `scripts/update_financial_reports.py`

某个数据源失败不会影响其他脚本继续执行，也不会清空旧数据。

## 启动本地服务

如果直接双击 `index.html`，浏览器可能因为 `file://` 限制无法读取 `data/*.json`。

推荐在项目根目录运行：

```bash
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

## 酒价抓取失败怎么办

酒价没有稳定官方接口，当前使用 `scripts/wine_sources.json` 配置网页抓取来源。

如果抓取失败：

- 检查 `scripts/wine_sources.json`；
- 更换或新增 `enabled=true` 的酒价来源；
- 调整 `datePattern`、`bottlePricePattern`、`casePricePattern`；
- 失败不会覆盖旧的 `data/winePrices.json`。

## 数据说明

项目内置数据为样例数据，不能作为投资依据。正式分析前需要导入或自动更新已核验的酒价、股价、估值、财报和事件数据。

核心预测、酒价股价相关性等计算只使用：

- `sample=false`
- `verified=true`

真实数据不足时，预测模块只展示模型框架，不输出正式判断。

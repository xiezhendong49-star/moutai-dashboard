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
- 展示“数据更新公告”，用于确认页面是否读取了最近一次自动更新结果

## 数据读取优先级

页面启动时按下面顺序读取数据：

1. 优先读取 `data/*.json`。
2. `stockDaily`、`winePrices`、`financialReports`、`events` 会按数据集分别判断。
3. 某个 `data/*.json` 是非空数组，就使用该数据集的真实数据。
4. 某个 `data/*.json` 为空数组、读取失败或格式错误，就只让这个数据集回退到 `seed-data.js`。
5. 如果 `data` 目录没有任何有效数据，再读取浏览器 `localStorage`。
6. 如果 `localStorage` 也没有，最后使用 `seed-data.js`。

`data/dataSourceStatus.json` 和 `data/updateLog.json` 会单独读取，读取失败不会影响页面打开。`data/updateLog.json` 为空时，页面会显示“暂无更新日志”。

`data/dataQualityReport.json` 保存数据质量审计结果，重点检查股价估值字段完整率、酒价真实来源点与股价日期对齐样本数，以及财报核心字段可用数量。运行 `python3 scripts/audit_data_quality.py` 可单独生成该报告；`python3 scripts/update_all.py` 会在数据更新后自动执行审计。

页面顶部会单独展示股价数据口径。正常读取到 `data/stockDaily.json` 后，应看到类似：

```text
股价数据：真实数据 / AkShare / 3,964条
stock.success=true｜source=akshare｜records=3964
```

如果酒价、财报或事件 JSON 仍是空数组，页面只会让这些数据集回退到 `seed-data.js`，不会影响股价图表继续使用真实 `stockDaily.json`。

酒价数据有两个文件：

- `data/winePrices.json`：历史日频展示数据，用于绘制 2001-08-27 至今的长期趋势曲线。
- `data/winePriceSourcePoints.json`：真实来源价格点，用于研究引用、真实锚点展示和核心分析。

酒价统计口径按文件直接计数：

- winePrices 展示数据总数：`data/winePrices.json.length`。
- winePrices 估算趋势点数量：`data/winePrices.json` 中 `estimated === true` 的数量。
- winePrices 真实展示点数量：`data/winePrices.json` 中 `estimated === false && verified === true` 的数量。
- winePriceSourcePoints 真实来源点底账数量：`data/winePriceSourcePoints.json.length`。

`data/winePrices.json` 中 `estimated=true` 的行是插值或前值填充得到的估算趋势价，只能用于长期趋势展示，不能视为真实成交价、真实批价或渠道报价。

## localStorage 说明

页面里的手动新增、JSON 导入、CSV 导入会写入浏览器 `localStorage`，方便临时维护自己的数据。

但为了避免本地缓存挡住自动更新后的真实数据，当前规则是：只在 `data` 目录没有任何有效数据时，`localStorage` 才会生效。只要 `data/stockDaily.json` 是非空数组，股价数据就优先使用该文件，本地缓存不会覆盖最新股价。

如果想强制重新读取真实数据，点击页面顶部：

```text
清除本地缓存并重读真实数据
```

该按钮会清除当前浏览器保存的看板缓存，然后刷新页面。

“恢复演示数据”只会临时展示 `seed-data.js`，不会再把演示数据写入 `localStorage`。

## 安装依赖

```bash
pip install -r requirements.txt
```

如果本机没有 `python` 命令，请使用 `python3` 运行下面的数据脚本。

如果依赖未安装，数据更新脚本会提示先运行上面的命令，并把失败原因写入 `data/dataSourceStatus.json`。依赖缺失、网络失败或抓取失败都不会把已有的 `data/*.json` 覆盖成空数组。

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

股价脚本的运行方式：

```bash
python scripts/update_stock_data.py
```

没有 `python` 命令时使用：

```bash
python3 scripts/update_stock_data.py
```

未配置 `TUSHARE_TOKEN` 时，脚本会优先用 AkShare 拉取 `600519` 日线行情；AkShare 当前只作为股价兜底来源，PE、PE TTM、PB、股息率、市值可能保留为空，不影响股价数据写入。配置 `TUSHARE_TOKEN` 后，脚本会优先使用 Tushare，并通过 `daily_basic` 尽量补齐 PE、PE TTM、PB、股息率和总市值。

如果需要完整的 PE/PB/市值分析，请在本地 `.env` 或 GitHub Actions Secret 中配置 `TUSHARE_TOKEN`。`scripts/update_stock_data.py` 每次运行后会自动执行 `scripts/audit_data_quality.py`，并把估值字段完整率写入 `data/dataQualityReport.json` 和 `data/dataSourceStatus.json`。

## 财报结构化数据

`data/financialReports.json` 保存贵州茅台财报列表和结构化核心指标，包括营收、归母净利润、EPS、ROE、毛利率、净利率和经营现金流等字段。`scripts/update_financial_reports.py` 会优先读取贵州茅台官网财报页和 AkShare 公开财务指标；如果自动源暂时失败，会保留已有财报列表，并使用公开财报摘要作为结构化指标保底，不会清空旧数据。

财报字段主要用于页面财务趋势和数据质量审计。不同公开源对“营业收入/营业总收入”、利润口径和发布时间可能存在差异，正式研究引用时应以贵州茅台公告 PDF 为准。

公开财报摘要只作为看板趋势和字段补齐，不作为最终核验口径；这类记录会标记为 `provisional=true`、`verified=false`。

## 一键更新数据

```bash
python scripts/update_all.py
```

该命令会依次执行：

- `scripts/update_stock_data.py`
- `scripts/update_wine_price.py`
- `scripts/update_financial_reports.py`

某个数据源失败不会影响其他脚本继续执行，也不会清空旧数据。

`update_wine_price.py` 每日只抓取最新真实酒价，按 `date + product + year + priceType` 增量追加或更新 `data/winePrices.json` 和 `data/winePriceSourcePoints.json`。它不会自动重新生成 2001-2026 的历史插值曲线；如果需要重算插值，应单独使用历史转换脚本。

第一次运行时，如果没有配置酒价来源，`update_wine_price.py` 会显示 `skipped`。这是正常现象，不代表整个更新失败。

运行后可查看 `data/dataSourceStatus.json` 中的 `summary`、`stock`、`winePrice`、`financialReports` 字段确认每个数据源的成功、失败或跳过原因。

## 数据更新公告

页面顶部核心指标下方有“数据更新公告”模块，用来判断图表看起来没变化时，项目是否已经读取了最新数据。

`data/updateLog.json` 保存最近 30 条更新日志，每条包含：

- `updatedAt`：脚本运行或数据接入时间。
- `title`、`summary`、`changes`：本次更新说明。
- `dataStats`：winePrices、estimated=true、真实展示点、sourcePoints 和 events 条数。
- `latestData`：最新真实酒价日期、最新真实酒价、最新股价日期、最新财报期。
- `status`：`success`、`no_change` 或 `failed`。

页面顶部还会显示：

```text
数据更新时间：2026-05-15 18:30:00｜当前数据源：data/*.json｜状态：真实数据已加载
```

如果读取不到 `data/*.json`，会提示“当前使用演示数据，未读取到 data/*.json”。如果酒价抓取失败或当天没有新报价，会提示“今日酒价未更新，当前使用最近一次成功数据”。

单独运行 `scripts/update_wine_price.py` 会追加一条酒价更新日志；运行 `scripts/update_all.py` 时会抑制子脚本日志，只追加一条汇总更新日志，避免同一次自动更新产生重复公告。成功、失败和无新增数据都会写日志；日志最多保留最近 30 条。日志写入失败不会影响主数据文件，抓取失败也不会覆盖旧数据。

## GitHub Actions 自动更新

仓库包含 `.github/workflows/update-data.yml`，用于在 GitHub Actions 中自动更新 `data/*.json`。

触发方式：

- 手动触发：进入 GitHub 仓库的 `Actions` 页面，选择 `Update dashboard data`，点击 `Run workflow`。
- 定时触发：每天自动运行一次。

Workflow 会执行：

```bash
pip install -r requirements.txt
python scripts/update_all.py
```

如果 `data/*.json` 有变化，GitHub Actions 会自动提交并推送回当前分支。提交范围只包含 `data/*.json`，不会提交 `.env`、token、账号、密码或 API Key。

如需使用 Tushare，在 GitHub 仓库中配置 Secret：

1. 打开仓库 `Settings`。
2. 进入 `Secrets and variables` -> `Actions`。
3. 新增 Repository secret，名称填写 `TUSHARE_TOKEN`，值填写你的 Tushare token。

如果没有配置 `TUSHARE_TOKEN`，股价脚本会继续使用 AkShare 兜底。某个数据源失败时，workflow 仍会继续到提交步骤，把失败原因写入并提交 `data/dataSourceStatus.json`。运行日志可在对应的 Actions run 页面查看，重点看 `Install dependencies`、`Run data update scripts` 和 `Commit updated data files` 三个步骤。

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

默认 `scripts/wine_sources.json` 里没有启用真实来源，因此第一次运行大概率会显示：

```text
winePrice: skipped
```

这表示“未配置启用的酒价来源，继续使用最近一次成功数据”，脚本不会清空旧的 `data/winePrices.json` 或 `data/winePriceSourcePoints.json`。

如需启用酒价抓取：

- 检查 `scripts/wine_sources.json`；
- 更换或新增 `enabled=true` 的酒价来源；
- 调整 `datePattern`、`bottlePricePattern`、`casePricePattern`；
- 失败不会覆盖旧的 `data/winePrices.json` 或 `data/winePriceSourcePoints.json`；
- 抓取失败不会新增 `estimated=true` 数据；
- 页面会提示“今日酒价未更新，当前使用最近一次成功数据”。

## 数据说明

项目内置数据为样例数据，不能作为投资依据。正式分析前需要导入或自动更新已核验的酒价、股价、估值、财报和事件数据。

酒价历史数据口径：

- `data/winePrices.json` 是历史日频展示数据，可用于长期趋势曲线。
- `estimated=true` 表示插值或估算趋势价，只能用于趋势展示。
- `estimated=true` 不能作为真实成交价、真实批价或预测输入。
- `estimated=false && verified=true && sample=false` 才是核心分析可用的真实来源点。
- `data/winePriceSourcePoints.json` 是真实来源点底账，核心分析会优先使用该文件。
- 每日自动更新只追加或更新最新真实来源点。
- 抓取失败不会覆盖旧数据。

核心预测、酒价股价相关性、酒价涨跌幅、当前酒价状态和数据质量中的真实样本数量只使用：

- `sample=false`
- `verified=true`
- `estimated=false`

真实有效样本不足 5 条时，预测和相关性模块只展示模型框架，不输出正式判断。

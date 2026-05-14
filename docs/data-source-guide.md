# 数据源说明

## 股价数据

- 推荐使用 Tushare。
- 可选使用 AkShare。
- Tushare `daily` 用于日线行情。
- Tushare `daily_basic` 用于 PE、PE TTM、PB、股息率、市值。
- 股票代码：Tushare 使用 `600519.SH`，AkShare 使用 `600519`。
- 脚本输出到 `data/stockDaily.json`。

## 酒价数据

- 飞天茅台酒价没有稳定、统一、官方公开接口。
- 第一版使用 `scripts/wine_sources.json` 配置网页抓取来源。
- 当前支持 `parserType=html_regex`。
- 每条数据必须保留 `source` 和 `sourceUrl`。
- 抓取失败不能覆盖旧数据。
- 不同口径不能混用：散瓶批价、原箱批价、电商零售价、回收价需要通过 `priceType` 区分。
- 如果“今日酒价”或“茅粉鲁智深”等来源页面结构变化，需要更新对应正则。

## 财报数据

- 优先使用贵州茅台官网财务报告/公告。
- 第一版只抓报告列表和报告链接。
- 后续再扩展 PDF 自动解析营收、净利润、EPS、毛利率、现金流等字段。
- 财务指标必须可追溯到具体报告，保留 `source` 和 `sourceUrl`。

## 数据质量规则

- `sample=true` 的数据不能参与核心预测。
- `verified=false` 的数据不能参与核心预测。
- 缺少 `source` 的数据要在页面提示。
- 酒价和股价做对比时，需要按日期对齐。
- 预测模块只能做情景推演，不能输出确定性投资建议。

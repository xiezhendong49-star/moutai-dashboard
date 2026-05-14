(function () {
  const storageKey = "moutai-research-state-v1";
  const emptyState = {
    winePrices: [],
    stockDaily: [],
    financialReports: [],
    events: [],
    dataSourceStatus: null,
    forecastParams: { currentEps: 65.7, growthRate: 6, targetPe: 22, winePriceState: "1600-1650", marginOfSafety: 10 },
  };

  let state = normalizeState(window.MOUTAI_SEED || emptyState);
  let dataMode = "demo";
  let loadMessage = "使用 seed-data.js 演示数据。";
  let datasetSources = { stockDaily: "seed", winePrices: "seed", financialReports: "seed", events: "seed" };
  let chartType = "price";
  let range = "all";
  let entryType = "winePrices";

  const $ = (id) => document.getElementById(id);
  const els = {
    error: $("errorBanner"),
    stockDataBanner: $("stockDataBanner"),
    spotPrice: $("spotPrice"),
    spotDelta: $("spotDelta"),
    casePrice: $("casePrice"),
    caseDelta: $("caseDelta"),
    stockPrice: $("stockPrice"),
    stockDelta: $("stockDelta"),
    peTtm: $("peTtm"),
    peNote: $("peNote"),
    pePercentile: $("pePercentile"),
    dividendYield: $("dividendYield"),
    actionSignal: $("actionSignal"),
    actionReason: $("actionReason"),
    chartRoot: $("chartRoot"),
    chartLegend: $("chartLegend"),
    miniPeChart: $("miniPeChart"),
    miniDivergenceChart: $("miniDivergenceChart"),
    miniFinancialChart: $("miniFinancialChart"),
    dataQualityPanel: $("dataQualityPanel"),
    dataSourcePanel: $("dataSourcePanel"),
    eventList: $("eventList"),
    relationshipPanel: $("relationshipPanel"),
    valuationPanel: $("valuationPanel"),
    financialPanel: $("financialPanel"),
    businessPanel: $("businessPanel"),
    forecastForm: $("forecastForm"),
    forecastPanel: $("forecastPanel"),
    dataEntryForm: $("dataEntryForm"),
    recentRows: $("recentRows"),
    reportRows: $("reportRows"),
    importType: $("importType"),
    resetData: $("resetData"),
    clearLocalCache: $("clearLocalCache"),
    exportData: $("exportData"),
    downloadTemplate: $("downloadTemplate"),
    importData: $("importData"),
    importCsv: $("importCsv"),
  };

  bind();
  init();

  async function init() {
    state = await loadState();
    render();
  }

  async function loadState() {
    const seed = normalizeState(window.MOUTAI_SEED || emptyState);
    const external = await loadExternalData(seed);
    if (external.hasExternalData) return external.state;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        dataMode = "local";
        loadMessage = "data 目录没有有效记录，使用浏览器 localStorage。";
        datasetSources = { stockDaily: "localStorage", winePrices: "localStorage", financialReports: "localStorage", events: "localStorage" };
        const localState = normalizeState(JSON.parse(saved));
        localState.meta = { datasetSources };
        return localState;
      }
    } catch (error) {
      loadMessage = `localStorage 读取失败，已回退演示数据：${error.message}`;
    }

    dataMode = "demo";
    datasetSources = { stockDaily: "seed", winePrices: "seed", financialReports: "seed", events: "seed" };
    seed.meta = { datasetSources };
    return seed;
  }

  async function loadExternalData(seed) {
    datasetSources = { stockDaily: "seed", winePrices: "seed", financialReports: "seed", events: "seed" };
    const [stockDaily, winePrices, financialReports, events, dataSourceStatus] = await Promise.all([
      fetchJsonSafe("data/stockDaily.json"),
      fetchJsonSafe("data/winePrices.json"),
      fetchJsonSafe("data/financialReports.json"),
      fetchJsonSafe("data/events.json"),
      fetchJsonSafe("data/dataSourceStatus.json"),
    ]);

    const next = normalizeState({
      stockDaily: pickDataSet(stockDaily.data, seed.stockDaily, "stockDaily"),
      winePrices: pickDataSet(winePrices.data, seed.winePrices, "winePrices"),
      financialReports: pickDataSet(financialReports.data, seed.financialReports, "financialReports"),
      events: pickDataSet(events.data, seed.events, "events"),
      dataSourceStatus: dataSourceStatus.data && !Array.isArray(dataSourceStatus.data) ? dataSourceStatus.data : seed.dataSourceStatus,
      forecastParams: seed.forecastParams,
    });
    next.meta = { datasetSources };

    const hasExternalData = Object.values(datasetSources).some((source) => source === "data");
    if (hasExternalData) {
      dataMode = "external";
      loadMessage = "优先读取 data/*.json；空数组或读取失败的数据集单独回退到 seed-data.js。";
    } else {
      const errors = [stockDaily, winePrices, financialReports, events].filter((item) => item.error).map((item) => item.error).join("；");
      dataMode = "demo";
      loadMessage = errors ? `data 目录未读取到有效数据：${errors}` : "data 目录没有有效记录，继续检查 localStorage。";
    }
    return { state: next, hasExternalData };
  }

  async function fetchJsonSafe(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status}`);
      return { data: await response.json(), error: "" };
    } catch (error) {
      return { data: null, error: `${url} ${error.message}` };
    }
  }

  function pickDataSet(dataRows, seedRows, key) {
    if (Array.isArray(dataRows) && dataRows.length > 0) {
      datasetSources[key] = "data";
      return dataRows;
    }
    datasetSources[key] = "seed";
    return Array.isArray(seedRows) ? seedRows : [];
  }

  function normalizeState(input) {
    return {
      winePrices: Array.isArray(input.winePrices) ? input.winePrices : [],
      stockDaily: Array.isArray(input.stockDaily) ? input.stockDaily : [],
      financialReports: Array.isArray(input.financialReports) ? input.financialReports : [],
      events: Array.isArray(input.events) ? input.events : [],
      dataSourceStatus: input.dataSourceStatus || null,
      meta: input.meta || {},
      forecastParams: { ...emptyState.forecastParams, ...(input.forecastParams || {}) },
    };
  }

  function bind() {
    document.querySelectorAll("[data-chart]").forEach((button) => button.addEventListener("click", () => {
      chartType = button.dataset.chart;
      document.querySelectorAll("[data-chart]").forEach((b) => b.classList.toggle("active", b === button));
      render();
    }));
    document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
      range = button.dataset.range;
      document.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("active", b === button));
      render();
    }));
    document.querySelectorAll("[data-entry]").forEach((button) => button.addEventListener("click", () => {
      entryType = button.dataset.entry;
      document.querySelectorAll("[data-entry]").forEach((b) => b.classList.toggle("active", b === button));
      renderEntryForm();
    }));
    document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b === button));
    }));
    els.resetData?.addEventListener("click", () => {
      dataMode = "demo";
      loadMessage = "临时展示 seed-data.js 演示数据；不会写入 localStorage。";
      datasetSources = { stockDaily: "seed", winePrices: "seed", financialReports: "seed", events: "seed" };
      state = normalizeState(window.MOUTAI_SEED || emptyState);
      state.meta = { datasetSources };
      render();
    });
    els.clearLocalCache?.addEventListener("click", () => {
      localStorage.removeItem(storageKey);
      location.reload();
    });
    els.exportData?.addEventListener("click", () => download("moutai-research-state.json", JSON.stringify(state, null, 2), "application/json"));
    els.downloadTemplate?.addEventListener("click", () => downloadTemplate(els.importType?.value || "stockDaily"));
    els.importData?.addEventListener("change", importJsonFile);
    els.importCsv?.addEventListener("change", importCsvFile);
    els.dataEntryForm?.addEventListener("submit", addManualEntry);
    els.forecastForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      state.forecastParams = { ...state.forecastParams, ...Object.fromEntries(new FormData(els.forecastForm).entries()) };
      renderForecast();
    });
    window.addEventListener("resize", drawChart);
  }

  function render() {
    try {
      hydrateForecastForm();
      drawStockDataBanner();
      drawTopMetrics();
      drawChart();
      drawMiniCharts();
      drawQuality();
      drawDataSourceStatus();
      drawEvents();
      drawMetricPanels();
      renderForecast();
      drawTables();
      renderEntryForm();
      if (els.error) els.error.hidden = true;
    } catch (error) {
      if (els.error) {
        els.error.hidden = false;
        els.error.textContent = `渲染失败：${error.message}`;
      }
      console.error(error);
    }
  }

  function drawStockDataBanner() {
    if (!els.stockDataBanner) return;
    const runtime = stockRuntimeStatus();
    els.stockDataBanner.className = `source-banner ${runtime.datasetSource}`;
    els.stockDataBanner.innerHTML = `<div><strong>股价数据：${stockHeadline(runtime)}</strong><span>${runtime.detail}</span></div><span>stock.success=${String(runtime.success)}｜source=${runtime.sourceCode}｜records=${runtime.records}</span>`;
  }

  function drawDataSourceStatus() {
    if (!els.dataSourcePanel) return;
    const runtime = stockRuntimeStatus();
    const status = state.dataSourceStatus || {};
    const wineStatus = status.winePrice || {};
    const reportStatus = status.financialReports || {};
    els.dataSourcePanel.innerHTML = [
      note("当前数据模式", `${dataModeLabel()}<br>${loadMessage}`),
      note("股价真实数据", stockHeadline(runtime)),
      note("stock 运行状态", `stock.success=${String(runtime.success)}<br>source=${runtime.sourceCode}<br>records=${runtime.records}`),
      note("股价数据来源", sourceName("stockDaily")),
      note("酒价数据来源", sourceName("winePrices")),
      note("财报数据来源", sourceName("financialReports")),
      note("事件数据来源", sourceName("events")),
      note("酒价状态", `${wineStatus.updatedAt || "--"}｜${wineStatus.message || "--"}`),
      note("财报状态", `${reportStatus.updatedAt || "--"}｜${reportStatus.message || "--"}`),
    ].join("");
  }

  function stockRuntimeStatus() {
    const datasetSource = state.meta?.datasetSources?.stockDaily || datasetSources.stockDaily || "seed";
    const stockStatus = state.dataSourceStatus?.stock || {};
    const latestStock = latest(state.stockDaily) || {};
    const loadedFromData = datasetSource === "data";
    const records = loadedFromData ? state.stockDaily.length : firstNumber(stockStatus.records, state.stockDaily.length, 0);
    const sourceCode = providerCode(loadedFromData ? (stockStatus.source || latestStock.source || "data") : datasetSource);
    const success = loadedFromData ? true : stockStatus.success === true;
    const detail = loadedFromData
      ? "页面已优先使用 data/stockDaily.json；localStorage 不会覆盖该股价数据。"
      : datasetSource === "localStorage"
        ? "data/stockDaily.json 当前没有有效记录，页面使用浏览器本地保存的数据。"
        : "data/stockDaily.json 当前没有有效记录，页面使用 seed-data.js 演示股价。";
    return { ...stockStatus, datasetSource, success, records, sourceCode, sourceLabel: providerLabel(sourceCode), typeLabel: loadedFromData ? "真实数据" : datasetSource === "localStorage" ? "本地数据" : "演示数据", detail };
  }

  function stockHeadline(runtime = stockRuntimeStatus()) {
    return `${runtime.typeLabel} / ${runtime.sourceLabel} / ${fmt(runtime.records, 0)}条`;
  }

  function drawTopMetrics() {
    const wine = latest(displayRows(state.winePrices));
    const prevWine = previous(displayRows(state.winePrices), wine?.date);
    const stock = latest(displayRows(state.stockDaily));
    const prevStock = previous(displayRows(state.stockDaily), stock?.date);
    fillPrice(els.spotPrice, els.spotDelta, wine, prevWine, "bottlePrice", 0, "元");
    fillPrice(els.casePrice, els.caseDelta, wine, prevWine, "casePrice", 0, "元");
    fillPrice(els.stockPrice, els.stockDelta, stock, prevStock, "close", 2, "元");
    const pe = stock?.peTtm ?? stock?.peStatic ?? stock?.pe;
    if (els.peTtm) els.peTtm.textContent = isNum(pe) ? `${fmt(pe, 1)}x` : "--";
    if (els.peNote) els.peNote.textContent = stockRuntimeStatus().datasetSource === "data" ? "真实数据口径" : "演示口径";
    if (els.pePercentile) els.pePercentile.textContent = percentileLabel(state.stockDaily.map((r) => r.peTtm ?? r.peStatic ?? r.pe).filter(isNum), pe);
    if (els.dividendYield) els.dividendYield.textContent = isNum(stock?.dividendYield) ? `${fmt(stock.dividendYield, 1)}%` : "--";
    if (els.actionSignal) els.actionSignal.textContent = stockRuntimeStatus().datasetSource === "data" ? "真实数据观察" : "演示数据";
    if (els.actionReason) els.actionReason.textContent = stockRuntimeStatus().datasetSource === "data" ? "股价来自 data/stockDaily.json" : "等待真实数据";
  }

  function drawChart() {
    if (!els.chartRoot) return;
    const rows = filterRange(sorted(state.stockDaily)).filter((row) => isNum(row.close));
    if (chartType === "financial") return drawFinancialChart(rows);
    if (!rows.length) {
      els.chartRoot.innerHTML = `<div class="empty">暂无可用股价数据</div>`;
      return;
    }
    const width = els.chartRoot.clientWidth || 1000;
    const height = els.chartRoot.clientHeight || 520;
    const pad = { l: 56, r: 18, t: 20, b: 36 };
    const plot = { x: pad.l, y: pad.t, w: width - pad.l - pad.r, h: height - pad.t - pad.b };
    const x = scale(0, Math.max(1, rows.length - 1), plot.x, plot.x + plot.w);
    const y = valueScale(rows.map((r) => chartType === "pe" ? (r.peTtm ?? r.peStatic ?? r.pe) : r.close).filter(isNum), plot);
    const fieldValue = (row) => chartType === "pe" ? (row.peTtm ?? row.peStatic ?? row.pe) : row.close;
    const points = rows.map((row, index) => [x(index), y.y(fieldValue(row)), row]).filter((p) => isNum(p[1]));
    const d = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const dots = points.slice(-60).map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="var(--blue)"/>`).join("");
    els.chartRoot.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><rect x="${plot.x}" y="${plot.y}" width="${plot.w}" height="${plot.h}" fill="#fffdf8"/>${grid(plot)}<path d="${d}" fill="none" stroke="var(--blue)" stroke-width="2.4"/>${dots}<text x="${plot.x}" y="${height - 10}" font-size="12" fill="#65716a">${rows[0].date || ""}</text><text x="${plot.x + plot.w}" y="${height - 10}" text-anchor="end" font-size="12" fill="#65716a">${rows.at(-1).date || ""}</text></svg>`;
    if (els.chartLegend) els.chartLegend.innerHTML = legend([chartType === "pe" ? "PE 估值" : "贵州茅台股价", stockHeadline()]);
  }

  function drawFinancialChart() {
    const rows = sorted(state.financialReports, "period");
    if (!rows.length) return els.chartRoot.innerHTML = `<div class="empty">暂无财务数据</div>`;
    els.chartRoot.innerHTML = `<div class="empty">财务数据 ${rows.length} 条，最近一期 ${rows.at(-1).period || "--"}</div>`;
  }

  function drawMiniCharts() {
    drawMini(els.miniPeChart, state.stockDaily, (r) => r.peTtm ?? r.peStatic ?? r.pe);
    drawMini(els.miniDivergenceChart, state.stockDaily, (r) => r.close);
    drawMini(els.miniFinancialChart, state.financialReports, (r) => r.netProfit, "period");
  }

  function drawMini(root, rows, getter, key = "date") {
    if (!root) return;
    const usable = sorted(rows, key).filter((row) => isNum(getter(row)));
    if (!usable.length) return root.innerHTML = `<div class="empty">暂无数据</div>`;
    const values = usable.map(getter);
    const width = root.clientWidth || 240;
    const height = root.clientHeight || 110;
    const y = valueScale(values, { x: 6, y: 8, w: width - 12, h: height - 18 });
    const x = scale(0, Math.max(1, usable.length - 1), 6, width - 6);
    const d = usable.map((row, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y.y(getter(row)).toFixed(1)}`).join(" ");
    root.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="var(--gold)" stroke-width="2"/></svg>`;
  }

  function drawQuality() {
    if (!els.dataQualityPanel) return;
    els.dataQualityPanel.innerHTML = [
      note("股价数据", `${state.stockDaily.length} 条`),
      note("酒价数据", `${state.winePrices.length} 条`),
      note("财报数据", `${state.financialReports.length} 条`),
      note("事件数据", `${state.events.length} 条`),
      note("最近股价", latest(state.stockDaily)?.date || "--"),
    ].join("");
  }

  function drawEvents() {
    if (!els.eventList) return;
    const rows = sorted(state.events).slice(-5).reverse();
    els.eventList.innerHTML = rows.length ? rows.map((row) => note(row.title || row.date || "事件", `${row.date || "--"}｜${row.impact || row.type || "--"}`)).join("") : note("暂无事件", "事件数据为空时页面保持可用");
  }

  function drawMetricPanels() {
    const stock = latest(state.stockDaily) || {};
    const wine = latest(state.winePrices) || {};
    setHtml(els.relationshipPanel, [metric("股价记录", fmt(state.stockDaily.length, 0)), metric("酒价记录", fmt(state.winePrices.length, 0)), metric("当前来源", stockRuntimeStatus().sourceLabel)].join(""));
    setHtml(els.valuationPanel, [metric("PE TTM", display(stock.peTtm ?? stock.peStatic ?? stock.pe, 1)), metric("股息率", isNum(stock.dividendYield) ? `${fmt(stock.dividendYield, 1)}%` : "--")].join(""));
    setHtml(els.financialPanel, [metric("财报记录", fmt(state.financialReports.length, 0)), metric("最近期间", latest(state.financialReports, "period")?.period || "--")].join(""));
    setHtml(els.businessPanel, [metric("散瓶价", display(wine.bottlePrice)), metric("原箱价", display(wine.casePrice))].join(""));
  }

  function renderForecast() {
    if (!els.forecastPanel) return;
    const p = state.forecastParams;
    const target = num(p.currentEps) * (1 + num(p.growthRate) / 100) * num(p.targetPe);
    const safe = target * (1 - num(p.marginOfSafety) / 100);
    els.forecastPanel.innerHTML = [
      scenario("基准股价区间", isNum(target) ? `${fmt(safe, 0)}-${fmt(target, 0)} 元` : "--", "仅为情景推演"),
      scenario("数据状态", stockHeadline(), "真实股价优先使用 data/stockDaily.json"),
    ].join("");
  }

  function drawTables() {
    if (els.recentRows) els.recentRows.innerHTML = sorted(state.stockDaily).slice(-12).reverse().map((s) => `<tr><td>${s.date || "--"}</td><td>--</td><td>--</td><td>${display(s.close, 2)}</td><td>${display(s.peTtm ?? s.peStatic ?? s.pe, 1)}</td><td>${s.source || stockRuntimeStatus().sourceLabel}</td></tr>`).join("");
    if (els.reportRows) els.reportRows.innerHTML = sorted(state.financialReports, "period").slice(-8).reverse().map((r) => `<tr><td>${r.period || "--"}</td><td>${display(toYi(r.revenue), 1)}</td><td>${display(toYi(r.netProfit), 1)}</td><td>${display(r.eps, 2)}</td><td>${display(r.grossMargin, 1)}</td><td>${display(r.netMargin, 1)}</td></tr>`).join("");
  }

  function renderEntryForm() {
    if (!els.dataEntryForm) return;
    const today = new Date().toISOString().slice(0, 10);
    const fields = {
      winePrices: `${field("日期", "date", "date", today)}${field("散瓶价", "bottlePrice", "number")}${field("原箱价", "casePrice", "number")}${field("来源", "source", "text")}`,
      stockDaily: `${field("日期", "date", "date", today)}${field("收盘价", "close", "number")}${field("来源", "source", "text")}`,
      financialReports: `${field("报告期", "period", "text", "2026Q1")}${field("EPS", "eps", "number")}${field("净利润", "netProfit", "number")}`,
      events: `${field("日期", "date", "date", today)}${field("标题", "title", "text")}${field("类型", "type", "text")}`,
    };
    els.dataEntryForm.innerHTML = `${fields[entryType] || fields.winePrices}<button type="submit">保存</button>`;
  }

  function addManualEntry(event) {
    event.preventDefault();
    const row = Object.fromEntries(new FormData(els.dataEntryForm).entries());
    if (entryType === "stockDaily") row.close = num(row.close);
    if (entryType === "winePrices") { row.bottlePrice = num(row.bottlePrice); row.casePrice = num(row.casePrice); }
    state[entryType].push(row);
    localStorage.setItem(storageKey, JSON.stringify(state));
    render();
  }

  async function importJsonFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    state = normalizeState(JSON.parse(await file.text()));
    localStorage.setItem(storageKey, JSON.stringify(state));
    render();
  }

  async function importCsvFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const rows = parseCsv(await file.text());
    const target = els.importType?.value || "stockDaily";
    rows.forEach((row) => state[target]?.push(row));
    localStorage.setItem(storageKey, JSON.stringify(state));
    render();
  }

  function hydrateForecastForm() {
    if (!els.forecastForm) return;
    Object.entries(state.forecastParams || {}).forEach(([key, value]) => {
      if (els.forecastForm.elements[key]) els.forecastForm.elements[key].value = value ?? "";
    });
  }

  function fillPrice(priceEl, deltaEl, row, prev, field, digits, unit) {
    if (priceEl) priceEl.textContent = isNum(row?.[field]) ? `${fmt(row[field], digits)} ${unit}` : "--";
    if (!deltaEl) return;
    if (!row || !prev || !isNum(row[field]) || !isNum(prev[field])) return deltaEl.textContent = "--";
    const diff = Number(row[field]) - Number(prev[field]);
    const sign = diff > 0 ? "+" : "";
    deltaEl.textContent = `${sign}${fmt(diff, digits)} ${unit}`;
    deltaEl.className = diff > 0 ? "positive" : diff < 0 ? "negative" : "";
  }

  function sorted(array, key = "date") { return [...(array || [])].sort((a, b) => String(a[key] || "").localeCompare(String(b[key] || ""))); }
  function displayRows(array) { return sorted(array).filter((row) => row.sample !== true); }
  function latest(array, key = "date") { return sorted(array, key).at(-1); }
  function previous(array, date, key = "date") { return sorted(array, key).filter((row) => row[key] < date).at(-1); }
  function filterRange(rows) {
    if (range === "all" || rows.length < 2) return rows;
    const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, "2y": 24, "3y": 36, "5y": 60, "10y": 120 }[range];
    if (!months) return rows;
    const end = new Date(rows.at(-1).date);
    const start = new Date(end);
    start.setMonth(start.getMonth() - months);
    return rows.filter((row) => new Date(row.date) >= start);
  }
  function sourceName(key) { return { data: "data/*.json", seed: "seed-data.js", localStorage: "localStorage" }[state.meta?.datasetSources?.[key] || datasetSources[key]] || "--"; }
  function dataModeLabel() { return dataMode === "external" ? "真实数据" : dataMode === "local" ? "本地保存数据" : "演示数据"; }
  function providerCode(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw.includes("akshare")) return "akshare";
    if (raw.includes("tushare")) return "tushare";
    if (raw === "localstorage") return "localStorage";
    return raw || "--";
  }
  function providerLabel(code) { return { akshare: "AkShare", tushare: "Tushare", data: "data/stockDaily.json", seed: "seed-data.js", localStorage: "localStorage" }[providerCode(code)] || code; }
  function percentileLabel(values, value) { return values.length && isNum(value) ? `${fmt((values.filter((v) => Number(v) <= Number(value)).length / values.length) * 100, 0)}%` : "--"; }
  function valueScale(values, plot) {
    const clean = values.filter(isNum).map(Number);
    const minRaw = Math.min(...clean);
    const maxRaw = Math.max(...clean);
    const span = maxRaw - minRaw || 1;
    const min = minRaw - span * 0.12;
    const max = maxRaw + span * 0.12;
    return { min, max, y: scale(min, max, plot.y + plot.h, plot.y) };
  }
  function grid(plot) {
    return Array.from({ length: 6 }, (_, i) => {
      const y = plot.y + (plot.h * i) / 5;
      return `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y}" y2="${y}" stroke="#e7dfd2"/>`;
    }).join("");
  }
  function scale(min, max, outMin, outMax) { const span = max - min || 1; return (v) => outMin + ((v - min) / span) * (outMax - outMin); }
  function note(title, body) { return `<div class="note-card"><strong>${title}</strong><span>${body}</span></div>`; }
  function metric(label, value) { return `<div class="metric"><span>${label}</span><strong>${value ?? "--"}</strong></div>`; }
  function scenario(title, value, noteText) { return `<div class="scenario"><strong>${title}</strong><span>${value}</span><small>${noteText}</small></div>`; }
  function legend(items) { return items.map((item, i) => `<span><i class="${i ? "blue" : "gold"}"></i>${item}</span>`).join(""); }
  function field(label, name, type, value = "") { return `<label>${label}<input name="${name}" type="${type}" value="${value}" /></label>`; }
  function setHtml(el, html) { if (el) el.innerHTML = html; }
  function toYi(value) { return isNum(value) ? Number(value) / 100000000 : null; }
  function firstNumber(...values) { for (const value of values) if (Number.isFinite(Number(value))) return Number(value); return 0; }
  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const headers = (lines.shift() || "").split(",").map((h) => h.trim());
    return lines.map((line) => Object.fromEntries(line.split(",").map((cell, index) => [headers[index], cell.trim()])));
  }
  function downloadTemplate(type) {
    const templates = {
      winePrices: "date,bottlePrice,casePrice,source\n2026-05-13,1645,1680,今日酒价",
      stockDaily: "date,open,high,low,close,volume,amount,pctChange,peTtm,peStatic,pb,dividendYield,marketCap,source\n2026-05-13,,,,1348,,,-1,20.5,20.5,,3.7,,AkShare",
      financialReports: "period,revenue,netProfit,eps\n2026Q1,53909000000,27243000000,21.7",
      events: "date,type,title,description\n2026-03-31,price,飞天调价,合同价和自营价上调",
    };
    download(`${type}-template.csv`, templates[type] || templates.stockDaily, "text/csv;charset=utf-8");
  }
  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  function fmt(value, digits = 0) { return isNum(value) ? Number(value).toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "--"; }
  function display(value, digits = 0) { return fmt(value, digits); }
  function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
  function isNum(value) { return Number.isFinite(Number(value)); }
})();

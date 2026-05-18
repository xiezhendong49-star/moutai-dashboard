(function () {
  const storageKey = "moutai-research-state-v1";
  let chartType = "price";
  let mode = "dual";
  let range = "all";
  let entryType = "winePrices";
  let dataMode = "demo";
  let loadMessage = "使用 seed-data.js 演示数据。";
  let datasetSources = { stockDaily: "seed", winePrices: "seed", financialReports: "seed", events: "seed" };

  const emptyState = {
    winePrices: [],
    winePriceSourcePoints: [],
    stockDaily: [],
    financialReports: [],
    events: [],
    dataSourceStatus: null,
    forecastParams: { currentEps: 65.7, growthRate: 6, targetPe: 22, winePriceState: "1600-1650", marginOfSafety: 10 },
  };
  let state = normalizeState(window.MOUTAI_SEED || emptyState);

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
    miniPeChart: $("miniPeChart"),
    miniDivergenceChart: $("miniDivergenceChart"),
    miniFinancialChart: $("miniFinancialChart"),
    chartTitle: $("mainChartTitle"),
    chartSubtitle: $("mainChartSubtitle"),
    chartLegend: $("chartLegend"),
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
    Object.assign(state, await loadState());
    render();
  }

  async function loadState() {
    const baseSeed = normalizeState(window.MOUTAI_SEED || emptyState, "seed-data.js");
    const external = await loadExternalData(baseSeed);
    if (external.hasExternalData) return external.state;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        dataMode = "local";
        loadMessage = "使用浏览器本地保存/导入的数据。";
        const localState = normalizeState(JSON.parse(saved), "localStorage");
        datasetSources = { stockDaily: "localStorage", winePrices: "localStorage", financialReports: "localStorage", events: "localStorage" };
        localState.meta.datasetSources = datasetSources;
        return localState;
      }
    } catch (error) {
      loadMessage = `localStorage 读取失败，已尝试降级：${error.message}`;
    }

    dataMode = "demo";
    loadMessage = "data 目录和 localStorage 都没有有效数据，使用 seed-data.js 演示数据。";
    datasetSources = { stockDaily: "seed", winePrices: "seed", financialReports: "seed", events: "seed" };
    baseSeed.meta.datasetSources = datasetSources;
    return baseSeed;
  }

  async function loadExternalData(baseSeed) {
    datasetSources = { stockDaily: "seed", winePrices: "seed", financialReports: "seed", events: "seed" };
    const files = await Promise.all([
      fetchJsonSafe("data/stockDaily.json"),
      fetchJsonSafe("data/winePrices.json"),
      fetchJsonSafe("data/winePriceSourcePoints.json"),
      fetchJsonSafe("data/financialReports.json"),
      fetchJsonSafe("data/events.json"),
      fetchJsonSafe("data/dataSourceStatus.json"),
    ]);
    const [stockDaily, winePrices, winePriceSourcePoints, financialReports, events, dataSourceStatus] = files;
    const stateFromData = normalizeState({
      stockDaily: pickDataSet(stockDaily.data, baseSeed.stockDaily, "stockDaily"),
      winePrices: pickDataSet(winePrices.data, baseSeed.winePrices, "winePrices"),
      winePriceSourcePoints: Array.isArray(winePriceSourcePoints.data) ? winePriceSourcePoints.data : baseSeed.winePriceSourcePoints,
      financialReports: pickDataSet(financialReports.data, baseSeed.financialReports, "financialReports"),
      events: pickDataSet(events.data, baseSeed.events, "events"),
      dataSourceStatus: dataSourceStatus.data && !Array.isArray(dataSourceStatus.data) ? dataSourceStatus.data : baseSeed.dataSourceStatus,
      forecastParams: baseSeed.forecastParams,
    }, "data/*.json + seed fallback");

    const hasExternalData = Object.values(datasetSources).some((source) => source === "data");
    stateFromData.meta.datasetSources = datasetSources;
    if (hasExternalData) {
      dataMode = "external";
      loadMessage = "优先读取 data/*.json；空数组、读取失败或格式错误的数据集已分别回退到 seed-data.js。";
    } else {
      dataMode = "demo";
      const errors = files.filter((item) => item.error).map((item) => item.error).join("；");
      loadMessage = errors
        ? `data 目录未读取到有效数据，已回退演示数据。若使用 file:// 打开，请运行 python -m http.server 8000 后访问 http://localhost:8000。错误：${errors}`
        : "data 目录暂时没有有效记录，继续检查 localStorage。";
    }
    return { state: stateFromData, hasExternalData };
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return response.json();
  }

  async function fetchJsonSafe(url) {
    try {
      return { data: await fetchJson(url), error: "" };
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

  function normalizeState(input, source = "unknown") {
    return {
      winePrices: Array.isArray(input.winePrices) ? input.winePrices : [],
      winePriceSourcePoints: Array.isArray(input.winePriceSourcePoints) ? input.winePriceSourcePoints : [],
      stockDaily: Array.isArray(input.stockDaily) ? input.stockDaily : [],
      financialReports: Array.isArray(input.financialReports) ? input.financialReports : [],
      events: Array.isArray(input.events) ? input.events : [],
      dataSourceStatus: input.dataSourceStatus || null,
      meta: { source },
      forecastParams: { ...emptyState.forecastParams, ...(input.forecastParams || {}) },
    };
  }

  function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }

  function bind() {
    document.querySelectorAll("[data-chart]").forEach((button) => {
      button.addEventListener("click", () => {
        chartType = button.dataset.chart;
        document.querySelectorAll("[data-chart]").forEach((b) => b.classList.toggle("active", b === button));
        drawChart();
      });
    });
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.mode;
        document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b === button));
        drawChart();
      });
    });
    document.querySelectorAll("[data-range]").forEach((button) => {
      button.addEventListener("click", () => {
        range = button.dataset.range;
        document.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("active", b === button));
        drawChart();
      });
    });
    document.querySelectorAll("[data-entry]").forEach((button) => {
      button.addEventListener("click", () => {
        entryType = button.dataset.entry;
        document.querySelectorAll("[data-entry]").forEach((b) => b.classList.toggle("active", b === button));
        renderEntryForm();
      });
    });
    els.dataEntryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const row = Object.fromEntries(new FormData(els.dataEntryForm).entries());
      addEntry(entryType, row);
      saveState();
      render();
    });
    els.resetData.addEventListener("click", () => {
      dataMode = "demo";
      loadMessage = "临时展示 seed-data.js 演示数据；不会写入 localStorage。";
      datasetSources = { stockDaily: "seed", winePrices: "seed", financialReports: "seed", events: "seed" };
      Object.assign(state, normalizeState(window.MOUTAI_SEED || emptyState, "seed-data.js"));
      state.meta.datasetSources = datasetSources;
      render();
    });
    if (els.clearLocalCache) {
      els.clearLocalCache.addEventListener("click", () => {
        localStorage.removeItem(storageKey);
        location.reload();
      });
    }
    els.exportData.addEventListener("click", () => download("moutai-research-state.json", JSON.stringify(state, null, 2), "application/json"));
    els.downloadTemplate.addEventListener("click", () => downloadTemplate(els.importType.value));
    els.importData.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      Object.assign(state, normalizeState(JSON.parse(await file.text())));
      saveState();
      render();
    });
    els.importCsv.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      importCsv(els.importType.value, await file.text());
      saveState();
      render();
    });
    els.forecastForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const params = Object.fromEntries(new FormData(els.forecastForm).entries());
      state.forecastParams = {
        currentEps: num(params.currentEps),
        growthRate: num(params.growthRate),
        targetPe: num(params.targetPe),
        marginOfSafety: num(params.marginOfSafety),
        winePriceState: params.winePriceState,
      };
      saveState();
      render();
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
      drawRelationship();
      drawValuation();
      drawFinancialPanel();
      drawBusinessPanel();
      drawForecast();
      drawTables();
      renderEntryForm();
      els.error.hidden = true;
    } catch (error) {
      els.error.hidden = false;
      els.error.textContent = `渲染失败：${error.message}`;
      console.error(error);
    }
  }

  function hydrateForecastForm() {
    Object.entries(state.forecastParams).forEach(([key, value]) => {
      if (els.forecastForm.elements[key]) els.forecastForm.elements[key].value = value ?? "";
    });
  }

  function sorted(array, key = "date") {
    return [...array].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
  }

  function analytical(array) {
    return verifiedRows(array);
  }

  function verifiedRows(array) {
    return sorted(array).filter((row) => row.sample === false && row.verified === true && row.estimated !== true);
  }

  function realWineRows() {
    const sourcePoints = verifiedRows(state.winePriceSourcePoints).filter((row) => isNum(row.bottlePrice) || isNum(row.casePrice));
    return sourcePoints.length ? sourcePoints : verifiedRows(state.winePrices).filter((row) => row.sourcePoint === true);
  }

  function displayRows(array) {
    const verified = verifiedRows(array);
    return verified.length ? verified : sorted(array);
  }

  function validForecastData() {
    return realWineRows().length >= 5 && verifiedRows(state.stockDaily).length >= 5 && verifiedRows(state.financialReports).some((r) => isNum(r.eps));
  }

  function latest(array, key = "date") {
    return sorted(array, key).at(-1);
  }

  function previous(array, date, key = "date") {
    return sorted(array, key).filter((row) => row[key] < date).at(-1);
  }

  function drawTopMetrics() {
    const wineRows = realWineRows();
    const wine = latest(wineRows);
    const stock = latest(displayRows(state.stockDaily));
    const realPeRows = verifiedRows(state.stockDaily).filter((r) => isNum(r.peTtm) || isNum(r.peStatic));
    const peRows = realPeRows.length ? realPeRows : state.stockDaily;
    const peValues = peRows.map((r) => r.peTtm ?? r.peStatic).filter(isNum);
    const pe = stock?.peTtm ?? stock?.peStatic;
    fillPrice(els.spotPrice, els.spotDelta, wine, previous(wineRows, wine?.date), "bottlePrice", 0, "元");
    fillPrice(els.casePrice, els.caseDelta, wine, previous(wineRows, wine?.date), "casePrice", 0, "元");
    fillPrice(els.stockPrice, els.stockDelta, stock, previous(displayRows(state.stockDaily), stock?.date), "close", 2, "元");
    els.peTtm.textContent = isNum(pe) ? `${fmt(pe, 1)}x` : "--";
    els.peNote.textContent = realPeRows.length ? "真实TTM口径" : "样例估值";
    els.pePercentile.textContent = isNum(pe) && peValues.length ? `${fmt(percentile(peValues, pe), 0)}%` : "--";
    els.dividendYield.textContent = isNum(stock?.dividendYield) ? `${fmt(stock.dividendYield, 1)}%` : "--";
    const judgment = getJudgment(wine?.bottlePrice, stock?.close, pe);
    els.actionSignal.textContent = judgment.title;
    els.actionReason.textContent = judgment.reason;
  }

  function fillPrice(priceEl, deltaEl, row, prev, field, digits, unit) {
    priceEl.textContent = isNum(row?.[field]) ? `${fmt(row[field], digits)} ${unit}` : "--";
    if (!row || !prev || !isNum(row[field]) || !isNum(prev[field])) {
      deltaEl.textContent = "--";
      deltaEl.className = "";
      return;
    }
    const diff = row[field] - prev[field];
    const sign = diff > 0 ? "+" : "";
    deltaEl.textContent = `${sign}${fmt(diff, digits)} ${unit} / ${sign}${fmt((diff / prev[field]) * 100, 1)}%`;
    deltaEl.className = diff > 0 ? "positive" : diff < 0 ? "negative" : "";
  }

  function getJudgment(bottle, close, pe) {
    if (isNum(close) && close < 1320) return { title: "风险观察", reason: "股价跌破1320，优先关注白酒基金降风险" };
    if (isNum(bottle) && bottle < 1600) return { title: "风险观察", reason: "散瓶跌破1600，渠道信心偏弱" };
    if (isNum(bottle) && bottle >= 1650 && isNum(close) && close > 1450) return { title: "修复观察", reason: "酒价和股价同时接近修复条件" };
    if (isNum(pe) && pe < 20) return { title: "等待验证", reason: "估值下降，但仍需利润和酒价确认" };
    return { title: "等待验证", reason: "酒价、利润和资金面尚未共振" };
  }

  function drawChart() {
    const root = els.chartRoot;
    const width = root.clientWidth || 1000;
    const height = root.clientHeight || 520;
    if (chartType === "price") drawPriceChart(root, width, height);
    if (chartType === "pe") drawPeChart(root, width, height);
    if (chartType === "divergence") drawDivergenceChart(root, width, height);
    if (chartType === "financial") drawFinancialChart(root, width, height);
  }

  function drawMiniCharts() {
    const stockRows = sorted(state.stockDaily).filter((r) => isNum(r.peTtm) || isNum(r.peStatic)).map((r) => ({ ...r, peMini: r.peTtm ?? r.peStatic }));
    drawMiniLine(els.miniPeChart, stockRows, "peMini", "var(--gold)");

    const divergenceRows = buildDivergenceRows();
    drawMiniLine(els.miniDivergenceChart, divergenceRows, "divergence", "var(--blue)", true);

    const financeRows = sorted(state.financialReports, "period").map((r) => ({ ...r, netProfitYi: toYi(r.netProfit) }));
    drawMiniLine(els.miniFinancialChart, financeRows, "netProfitYi", "var(--green)", false, "period");
  }

  function drawMiniLine(root, rows, field, color, zeroLine = false, key = "date") {
    const width = root.clientWidth || 240;
    const height = root.clientHeight || 110;
    const usable = rows.filter((r) => isNum(r[field]));
    if (!usable.length) {
      root.innerHTML = `<div class="empty">暂无数据</div>`;
      return;
    }
    const pad = { l: 8, r: 8, t: 10, b: 14 };
    const plot = { x: pad.l, y: pad.t, w: width - pad.l - pad.r, h: height - pad.t - pad.b };
    const x = key === "period" ? (v) => plot.x + (v / Math.max(1, usable.length - 1)) * plot.w : xScale(usable, plot, key);
    const y = valueScale(usable.map((r) => r[field]).concat(zeroLine ? [0] : []), plot);
    const d = usable.map((r, i) => `${i ? "L" : "M"}${x(key === "period" ? i : xValue(r, key)).toFixed(1)},${y.y(r[field]).toFixed(1)}`).join(" ");
    const zero = zeroLine ? `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y.y(0)}" y2="${y.y(0)}" stroke="#aaa" stroke-dasharray="3 3"/>` : "";
    root.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><rect x="0" y="0" width="${width}" height="${height}" fill="#fffdf8"/>${zero}<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
  }

  function drawPriceChart(root, width, height) {
    els.chartTitle.textContent = "酒价 vs 股价趋势";
    els.chartSubtitle.textContent = "双轴看绝对价格，涨跌幅模式看相对变化。";
    const wine = filterRange(sorted(state.winePrices));
    const stocks = filterRange(sorted(state.stockDaily));
    const rows = mergeByDate(wine, stocks, (w, s) => ({
      date: w?.date || s?.date,
      bottlePrice: w?.bottlePrice,
      casePrice: w?.casePrice,
      close: s?.close,
      peTtm: s?.peTtm,
      source: w?.source || "股价数据",
      sourceUrl: w?.sourceUrl,
      note: w?.note,
      estimated: w?.estimated,
      sourcePoint: w?.sourcePoint,
      verified: w?.verified,
      sample: w?.sample || s?.sample,
    }));
    const series = rows.filter((r) => isNum(r.bottlePrice) || isNum(r.close));
    const leftField = mode === "indexed" ? "bottleIndex" : "bottlePrice";
    const rightField = mode === "indexed" ? "stockIndex" : "close";
    addIndexes(series, "bottlePrice", "bottleIndex");
    addIndexes(series, "close", "stockIndex");
    drawTwoLineChart(root, width, height, series, leftField, rightField, "飞天散瓶", "贵州茅台股价", "var(--gold)", "var(--blue)");
    els.chartLegend.innerHTML = legend(["飞天散瓶趋势", "贵州茅台股价", "真实来源点/估算趋势点"]);
  }

  function drawPeChart(root, width, height) {
    els.chartTitle.textContent = "PE估值趋势";
    els.chartSubtitle.textContent = "展示 PE TTM、PE静态，并加入15x/20x/25x/30x参考线。";
    const rows = filterRange(sorted(state.stockDaily)).filter((r) => isNum(r.peTtm) || isNum(r.peStatic));
    drawTwoLineChart(root, width, height, rows, "peTtm", "peStatic", "PE TTM", "PE静态", "var(--gold)", "var(--blue)", [15, 20, 25, 30]);
    els.chartLegend.innerHTML = legend(["PE TTM", "PE静态", "15/20/25/30x参考线"]);
  }

  function drawDivergenceChart(root, width, height) {
    els.chartTitle.textContent = "酒价-股价背离";
    els.chartSubtitle.textContent = "背离 = 酒价区间涨跌幅 - 股价区间涨跌幅。正值代表酒价强于股价。";
    const rows = buildDivergenceRows();
    drawSingleLineChart(root, width, height, filterRange(rows), "divergence", "背离幅度%");
    els.chartLegend.innerHTML = legend(["背离幅度"]);
  }

  function buildDivergenceRows() {
    const wine = realWineRows();
    const stocks = verifiedRows(state.stockDaily);
    const rows = mergeNearest(wine, stocks).filter((r) => isNum(r.bottlePrice) && isNum(r.close));
    if (!rows.length) return [];
    const firstWine = rows[0].bottlePrice;
    const firstStock = rows[0].close;
    rows.forEach((r) => {
      r.divergence = ((r.bottlePrice / firstWine - 1) - (r.close / firstStock - 1)) * 100;
    });
    return rows;
  }

  function drawFinancialChart(root, width, height) {
    els.chartTitle.textContent = "财务趋势";
    els.chartSubtitle.textContent = "营收、归母净利润、EPS趋势，单位按亿元/元展示。";
    const rows = sorted(state.financialReports, "period").map((r) => ({ ...r, revenueYi: toYi(r.revenue), netProfitYi: toYi(r.netProfit) }));
    drawTwoLineChart(root, width, height, rows, "revenueYi", "netProfitYi", "营收(亿)", "归母净利(亿)", "var(--gold)", "var(--blue)", null, "period");
    els.chartLegend.innerHTML = legend(["营收", "归母净利润"]);
  }

  function drawTwoLineChart(root, width, height, rows, leftField, rightField, leftName, rightName, leftColor, rightColor, refs, key = "date") {
    if (!rows.length) return drawEmpty(root);
    const pad = { l: 58, r: 62, t: 24, b: 38 };
    const plot = { x: pad.l, y: pad.t, w: width - pad.l - pad.r, h: height - pad.t - pad.b };
    const x = xScale(rows, plot, key);
    const leftValues = rows.map((r) => r[leftField]).filter(isNum);
    const rightValues = rows.map((r) => r[rightField]).filter(isNum);
    const leftScale = valueScale(refs ? leftValues.concat(refs) : leftValues, plot);
    const rightScale = mode === "indexed" || refs ? leftScale : valueScale(rightValues, plot);
    root.innerHTML = chartSvg(width, height, plot, [
      refs ? refLines(refs, leftScale, plot) : "",
      path(rows, leftField, x, leftScale.y, leftColor),
      path(rows, rightField, x, rightScale.y, rightColor),
      dots(rows, leftField, x, leftScale.y, leftColor, key),
      dots(rows, rightField, x, rightScale.y, rightColor, key),
      axes(plot, leftScale, refs ? leftScale : rightScale, mode === "indexed" ? "%" : ""),
    ].join(""), rows, key);
  }

  function drawSingleLineChart(root, width, height, rows, field, name, key = "date") {
    if (!rows.length) return drawEmpty(root);
    const pad = { l: 58, r: 24, t: 24, b: 38 };
    const plot = { x: pad.l, y: pad.t, w: width - pad.l - pad.r, h: height - pad.t - pad.b };
    const x = xScale(rows, plot, key);
    const y = valueScale(rows.map((r) => r[field]).filter(isNum).concat([0]), plot);
    root.innerHTML = chartSvg(width, height, plot, [
      refLines([0], y, plot),
      path(rows, field, x, y.y, "var(--blue)"),
      dots(rows, field, x, y.y, "var(--blue)", key),
      axes(plot, y, y, "%"),
    ].join(""), rows, key);
  }

  function chartSvg(width, height, plot, inner, rows, key) {
    setTimeout(() => bindTooltip(rows, key), 0);
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${grid(plot)}${inner}<line id="crossX" x1="0" x2="0" y1="${plot.y}" y2="${plot.y + plot.h}" stroke="#333" stroke-opacity=".25" stroke-dasharray="4 4" visibility="hidden"/></svg><div id="tip" class="tooltip" hidden></div>`;
  }

  function drawEmpty(root) {
    root.innerHTML = `<div class="empty">暂无可用数据</div>`;
  }

  function bindTooltip(rows, key) {
    const root = els.chartRoot;
    const svg = root.querySelector("svg");
    const tip = root.querySelector("#tip");
    const cross = root.querySelector("#crossX");
    if (!svg || !tip || !cross) return;
    svg.addEventListener("mousemove", (event) => {
      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * svg.viewBox.baseVal.width;
      const nearest = nearestByX(rows, x, rect, key);
      if (!nearest) return;
      cross.setAttribute("x1", nearest.x);
      cross.setAttribute("x2", nearest.x);
      cross.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.innerHTML = tooltipHtml(nearest.row);
      tip.style.left = `${Math.min(Math.max(8, event.clientX - rect.left + 14), rect.width - 240)}px`;
      tip.style.top = `${Math.min(Math.max(8, event.clientY - rect.top + 14), rect.height - 150)}px`;
    });
    svg.addEventListener("mouseleave", () => {
      cross.setAttribute("visibility", "hidden");
      tip.hidden = true;
    });
  }

  function nearestByX(rows, mx, rect, key) {
    const width = els.chartRoot.clientWidth || 1000;
    const pad = { l: 58, r: 62, t: 24, b: 38 };
    const plot = { x: pad.l, y: pad.t, w: width - pad.l - pad.r, h: 1 };
    const x = xScale(rows, plot, key);
    let best = null;
    let distance = Infinity;
    rows.forEach((row, index) => {
      const px = x(key === "period" ? index : xValue(row, key));
      const d = Math.abs(px - mx);
      if (d < distance) { best = { row, x: px }; distance = d; }
    });
    return distance < 50 ? best : null;
  }

  function tooltipHtml(row) {
    const date = row.date || row.period || "--";
    const pointLabel = row.estimated === true
      ? "估算趋势价，仅用于展示"
      : row.estimated === false && row.verified === true
        ? "真实来源点"
        : row.sample ? "样例数据" : "录入数据";
    const source = row.sourceUrl ? `<a href="${row.sourceUrl}" target="_blank" rel="noopener">${row.source || "来源链接"}</a>` : (row.source || "--");
    return `<strong>${date}</strong><span>酒价：${display(row.bottlePrice)} 元</span><span>股价：${display(row.close, 2)} 元</span><span>PE：${display(row.peTtm, 1)}</span><span>${pointLabel}</span><span>真实来源点：${row.sourcePoint === true ? "是" : "否"}</span><span>来源：${source}</span><small>${row.note || ""}</small>`;
  }

  function drawQuality() {
    const allRows = [...state.winePrices, ...state.stockDaily, ...state.financialReports, ...state.events];
    const realWineCount = realWineRows().length;
    const estimatedWineCount = state.winePrices.filter((r) => r.estimated === true).length;
    const sampleCount = allRows.filter((r) => r.sample).length;
    const unverifiedCount = allRows.filter((r) => r.verified === false).length;
    const missingSourceCount = allRows.filter((r) => !r.source).length;
    const latestUpdate = [latest(state.winePrices)?.date, latest(state.stockDaily)?.date, latest(state.financialReports, "period")?.period].filter(Boolean).sort().at(-1) || "--";
    const missingPe = state.stockDaily.filter((r) => !isNum(r.peTtm) && !isNum(r.peStatic)).length;
    const missingEps = state.financialReports.filter((r) => !isNum(r.eps)).length;
    const missingWine = state.winePrices.filter((r) => !isNum(r.bottlePrice)).length;
    els.dataQualityPanel.innerHTML = [
      note("酒价展示数据", `${state.winePrices.length} 条`),
      note("酒价真实来源点", `${realWineCount} 条`),
      note("酒价估算趋势点", `${estimatedWineCount} 条`),
      note("股价数据", `${state.stockDaily.length} 条｜${stockDataHeadline()}`),
      note("财报数据", `${state.financialReports.length} 条`),
      note("事件数据", `${state.events.length} 条`),
      note("样例数据", `${sampleCount} 条`),
      note("未核验数据", `${unverifiedCount} 条`),
      note("缺少来源", `${missingSourceCount} 条`),
      note("最近更新", latestUpdate),
      note("缺失检查", `PE缺${missingPe} / EPS缺${missingEps} / 酒价缺${missingWine}`),
    ].join("");
  }

  function drawStockDataBanner() {
    if (!els.stockDataBanner) return;
    const runtime = stockRuntimeStatus();
    const classes = ["source-banner"];
    if (runtime.datasetSource === "seed") classes.push("demo");
    if (runtime.datasetSource === "localStorage") classes.push("local");
    els.stockDataBanner.className = classes.join(" ");
    els.stockDataBanner.innerHTML = `<div><strong>股价数据：${stockDataHeadline()}</strong><span>${runtime.detail}</span></div><span>stock.success=${String(runtime.success)}｜source=${runtime.sourceCode}｜records=${runtime.records}</span>`;
  }

  function stockDataHeadline() {
    const runtime = stockRuntimeStatus();
    return `${runtime.typeLabel} / ${runtime.sourceLabel} / ${fmt(runtime.records, 0)}条`;
  }

  function stockRuntimeStatus() {
    const sources = currentDatasetSources();
    const datasetSource = sources.stockDaily || "seed";
    const stockStatus = state.dataSourceStatus?.stock || {};
    const latestStock = latest(state.stockDaily) || {};
    const loadedFromData = datasetSource === "data";
    const records = loadedFromData ? state.stockDaily.length : firstNumber(stockStatus.records, state.stockDaily.length, 0);
    const rawProvider = loadedFromData ? (latestStock.source || stockStatus.source || "data") : datasetSource;
    const sourceCode = providerCode(rawProvider);
    const sourceLabelText = providerLabel(sourceCode);
    const typeLabel = datasetSource === "data" ? "真实数据" : datasetSource === "localStorage" ? "本地数据" : "演示数据";
    const success = loadedFromData ? true : stockStatus.success === true;
    const detail = loadedFromData
      ? "页面已优先使用 data/stockDaily.json；localStorage 不会覆盖该股价数据。"
      : datasetSource === "localStorage"
        ? "data/stockDaily.json 当前没有有效记录，页面使用浏览器本地保存的数据。"
        : "data/stockDaily.json 当前没有有效记录，页面使用 seed-data.js 演示股价。";
    return {
      ...stockStatus,
      datasetSource,
      success,
      records,
      sourceCode,
      sourceLabel: sourceLabelText,
      typeLabel,
      detail,
      updatedAt: stockStatus.updatedAt || latestStock.date || "",
    };
  }

  function currentDatasetSources() {
    return state.meta?.datasetSources || datasetSources;
  }

  function sourceLabel(key) {
    const label = { data: "data/*.json", seed: "seed-data.js", localStorage: "localStorage" }[currentDatasetSources()[key]];
    return label || "--";
  }

  function providerCode(value) {
    const raw = String(value || "").trim();
    const lower = raw.toLowerCase();
    if (lower.includes("akshare")) return "akshare";
    if (lower.includes("tushare")) return "tushare";
    if (lower === "data") return "data";
    if (lower === "seed") return "seed";
    if (lower === "localstorage") return "localStorage";
    return raw || "--";
  }

  function providerLabel(value) {
    const code = providerCode(value);
    return { akshare: "AkShare", tushare: "Tushare", data: "data/stockDaily.json", seed: "seed-data.js", localStorage: "localStorage" }[code] || code;
  }

  function firstNumber(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  function drawDataSourceStatus() {
    if (!els.dataSourcePanel) return;
    const status = state.dataSourceStatus || {};
    const stockRuntime = stockRuntimeStatus();
    const wineStatus = status.winePrice || {};
    const wineSummary = wineRuntimeSummary(wineStatus);
    const reportStatus = status.financialReports || {};
    const sampleCount = [...state.winePrices, ...state.stockDaily, ...state.financialReports, ...state.events].filter((r) => r.sample).length;
    const sourceText = dataMode === "external" ? "真实数据" : dataMode === "local" ? "本地保存数据" : "演示数据";
    const statusLabel = (item) => item.skipped ? "跳过" : item.success === false ? "失败" : item.success === true ? "成功" : "未知";
    els.dataSourcePanel.innerHTML = [
      note("当前数据模式", `${sourceText}<br>${loadMessage}`),
      note("股价真实数据", stockDataHeadline()),
      note("stock 运行状态", `stock.success=${String(stockRuntime.success)}<br>source=${stockRuntime.sourceCode}<br>records=${stockRuntime.records}`),
      note("股价数据来源", sourceLabel("stockDaily")),
      note("酒价数据来源", sourceLabel("winePrices")),
      note("财报数据来源", sourceLabel("financialReports")),
      note("事件数据来源", sourceLabel("events")),
      note("股价更新时间", `${stockRuntime.updatedAt || "--"}｜${statusLabel(stockRuntime)}`),
      note("酒价更新时间", `${wineStatus.updatedAt || "--"}｜${statusLabel(wineStatus)}`),
      note("财报更新时间", `${reportStatus.updatedAt || "--"}｜${statusLabel(reportStatus)}`),
      note("今日酒价", wineStatus.success === false ? `未更新：${wineStatus.message || "继续使用最近一次成功数据"}` : (wineStatus.message || "--")),
      note("酒价历史展示区间", wineSummary.range),
      note("winePrices 展示总数", `${wineSummary.displayRecords} 条`),
      note("winePrices 估算趋势点", `${wineSummary.estimatedRecords} 条`),
      note("winePrices 真实展示点", `${wineSummary.realDisplayRecords} 条`),
      note("真实来源点底账", `${wineSummary.sourcePointLedgerRecords} 条`),
      note("最新真实酒价", `${wineSummary.latestRealDate || "--"}｜散瓶 ${display(wineSummary.latestRealBottlePrice)}｜原箱 ${display(wineSummary.latestRealCasePrice)}`),
      note("今日是否已更新", wineSummary.todayUpdated ? "是" : "否，今日酒价未更新，当前使用最近一次成功数据"),
      note("预测酒价口径", wineSummary.predictionUsesRealSourcePointsOnly ? "只使用真实来源点" : "需检查"),
      note("样例数据", `${sampleCount} 条`),
      note("失败原因", [stockRuntime, wineStatus, reportStatus].filter((item) => item.success === false && !item.skipped).map((item) => item.message).join("<br>") || "--"),
    ].join("");
  }

  function wineRuntimeSummary(wineStatus) {
    const displayRecords = state.winePrices.length;
    const estimatedRecords = state.winePrices.filter((row) => row.estimated === true).length;
    const realDisplayRecords = state.winePrices.filter((row) => row.estimated === false && row.verified === true).length;
    const sourcePointLedgerRecords = state.winePriceSourcePoints.length;
    const latestReal = latest(realWineRows()) || {};
    const historyRange = wineStatus.historyRange || {};
    return {
      displayRecords,
      estimatedRecords,
      realDisplayRecords,
      sourcePointLedgerRecords,
      latestRealDate: wineStatus.latestRealDate || latestReal.date || "",
      latestRealBottlePrice: wineStatus.latestRealBottlePrice ?? latestReal.bottlePrice,
      latestRealCasePrice: wineStatus.latestRealCasePrice ?? latestReal.casePrice,
      todayUpdated: Boolean(wineStatus.todayUpdated),
      predictionUsesRealSourcePointsOnly: wineStatus.predictionUsesRealSourcePointsOnly !== false,
      range: `${historyRange.start || state.winePrices[0]?.date || "--"} 至 ${historyRange.end || state.winePrices.at(-1)?.date || "--"}`,
    };
  }


  function drawEvents() {
    els.eventList.innerHTML = sorted(state.events).slice(-8).reverse().map((event) => note(event.title, `${event.date}｜${event.type}｜${event.impact}<br>${event.description || ""}`)).join("");
  }

  function drawRelationship() {
    const rows = mergeNearest(realWineRows(), verifiedRows(state.stockDaily)).filter((r) => isNum(r.bottlePrice) && isNum(r.close)).slice(-8);
    if (rows.length < 5) {
      els.relationshipPanel.innerHTML = [
        metric("有效样本", `${rows.length} 条`),
        metric("相关系数", "真实有效样本不足"),
        metric("当前关系", "真实有效样本不足"),
        metric("计算口径", "estimated=false && verified=true && sample=false"),
      ].join("");
      return;
    }
    const wineChange = changePct(rows.at(0)?.bottlePrice, rows.at(-1)?.bottlePrice);
    const stockChange = changePct(rows.at(0)?.close, rows.at(-1)?.close);
    const corr = correlation(rows.map((r) => r.bottlePrice), rows.map((r) => r.close));
    const divergence = wineChange - stockChange;
    const conclusion = divergence > 0.08 ? "酒价强于股价" : divergence < -0.08 ? "股价强于酒价" : "方向接近";
    els.relationshipPanel.innerHTML = [
      metric("酒价区间涨跌", pct(wineChange), wineChange >= 0),
      metric("股价区间涨跌", pct(stockChange), stockChange >= 0),
      metric("相关系数", isNum(corr) ? fmt(corr, 2) : "--"),
      metric("当前关系", conclusion),
    ].join("");
  }

  function drawValuation() {
    const realPeRows = verifiedRows(state.stockDaily).filter((r) => isNum(r.peTtm) || isNum(r.peStatic));
    const sourceRows = realPeRows.length ? realPeRows : state.stockDaily;
    const stock = latest(sourceRows);
    const pe = stock?.peTtm ?? stock?.peStatic;
    const peValues = sourceRows.map((r) => r.peTtm ?? r.peStatic).filter(isNum);
    const implied = impliedGrowth(pe);
    els.valuationPanel.innerHTML = [
      metric("PE TTM", isNum(pe) ? `${fmt(pe, 1)}x` : "--"),
      metric("PE分位", isNum(pe) ? `${fmt(percentile(peValues, pe), 0)}%` : "--"),
      metric("隐含增速", implied.label),
      metric("估值解释", realPeRows.length ? implied.note : "PE分位基于样例数据，仅供演示。"),
    ].join("");
  }

  function drawFinancialPanel() {
    const report = latest(state.financialReports, "period");
    const annualReports = sorted(state.financialReports, "period").filter((r) => r.reportType === "annual" && isNum(r.revenue) && isNum(r.netProfit));
    const revenueCagr = cagr(annualReports.map((r) => r.revenue));
    const profitCagr = cagr(annualReports.map((r) => r.netProfit));
    const cashMatch = cashflowMatch(report);
    const pressure = isNum(report?.revenueYoY) && isNum(report?.netProfitYoY) && report.netProfitYoY < report.revenueYoY;
    const diagnosis = financialDiagnosis(report, revenueCagr, profitCagr, cashMatch, pressure);
    els.financialPanel.innerHTML = [
      metric("营收", `${fmt(toYi(report?.revenue), 1)} 亿`),
      metric("营收同比", pctRaw(report?.revenueYoY), report?.revenueYoY >= 0),
      metric("归母净利润", `${fmt(toYi(report?.netProfit), 1)} 亿`),
      metric("净利同比", pctRaw(report?.netProfitYoY), report?.netProfitYoY >= 0),
      metric("EPS", fmt(report?.eps, 2)),
      metric("毛利率/净利率", `${pctRaw(report?.grossMargin)} / ${pctRaw(report?.netMargin)}`),
      metric("ROE", pctRaw(report?.roe)),
      metric("经营现金流", `${fmt(toYi(report?.operatingCashFlow), 1)} 亿`),
      metric("现金流/净利润", isNum(cashMatch) ? `${fmt(cashMatch * 100, 0)}%` : "--", !isNum(cashMatch) || cashMatch >= 0.8),
      metric("营收CAGR", pct(revenueCagr), revenueCagr >= 0),
      metric("净利CAGR", pct(profitCagr), profitCagr >= 0),
      metric("增速关系", pressure ? "利润慢于营收" : "利润不弱于营收", !pressure),
      metric("基本面判断", diagnosis),
    ].join("");
  }

  function cagr(values) {
    const clean = values.filter(isNum);
    if (clean.length < 2 || clean[0] <= 0) return null;
    return (clean.at(-1) / clean[0]) ** (1 / (clean.length - 1)) - 1;
  }

  function cashflowMatch(report) {
    if (!isNum(report?.operatingCashFlow) || !isNum(report?.netProfit) || report.netProfit === 0) return null;
    return report.operatingCashFlow / report.netProfit;
  }

  function financialDiagnosis(report, revenueCagr, profitCagr, cashMatch, pressure) {
    if (isNum(cashMatch) && cashMatch < 0.6) return "现金流需观察";
    if (pressure || (isNum(report?.netProfitYoY) && report.netProfitYoY < 3)) return "利润承压";
    if ((isNum(revenueCagr) && revenueCagr < 0.05) || (isNum(profitCagr) && profitCagr < 0.05)) return "增速放缓";
    return "基本面强";
  }

  function drawBusinessPanel() {
    const report = latest(state.financialReports, "period");
    els.businessPanel.innerHTML = [
      metric("茅台酒收入", `${fmt(toYi(report?.moutaiWineRevenue), 1)} 亿`),
      metric("系列酒收入", `${fmt(toYi(report?.seriesWineRevenue), 1)} 亿`),
      metric("直销收入", `${fmt(toYi(report?.directSalesRevenue), 1)} 亿`),
      metric("批发代理收入", `${fmt(toYi(report?.wholesaleRevenue), 1)} 亿`),
      metric("i茅台收入", `${fmt(toYi(report?.iMoutaiRevenue), 1)} 亿`),
      metric("经销商数量", display(report?.dealerCount, 0)),
    ].join("");
  }

  function drawForecast() {
    const p = state.forecastParams;
    if (!validForecastData()) {
      els.forecastPanel.innerHTML = [
        scenario("真实有效样本不足", "当前仅展示模型框架，不输出正式判断。", "核心预测要求 estimated=false、sample=false、verified=true，且酒价真实来源点不少于5条。"),
        scenario("公式", "预测股价 = 未来EPS × 目标PE", "导入或更新真实数据后再进行情景推演。"),
      ].join("");
      return;
    }
    const futureEps = p.currentEps * (1 + p.growthRate / 100);
    const targetPrice = futureEps * p.targetPe;
    const safePrice = targetPrice * (1 - p.marginOfSafety / 100);
    const peAdj = wineStateAdjustment(p.winePriceState);
    const pessimistic = futureEps * Math.max(12, p.targetPe - 4 + peAdj);
    const optimistic = futureEps * (p.targetPe + 4 + peAdj);
    const current = latest(verifiedRows(state.stockDaily))?.close;
    const implied = current && p.targetPe ? ((current / p.targetPe / p.currentEps) - 1) * 100 : null;
    const status = forecastStatus(p.winePriceState, p.growthRate);
    els.forecastPanel.innerHTML = [
      scenario("悲观股价区间", `${fmt(pessimistic * 0.95, 0)}-${fmt(pessimistic * 1.05, 0)} 元`, "PE下修或利润兑现不足"),
      scenario("基准股价区间", `${fmt(safePrice, 0)}-${fmt(targetPrice, 0)} 元`, "扣除安全边际后的目标区间"),
      scenario("乐观股价区间", `${fmt(optimistic * 0.95, 0)}-${fmt(optimistic * 1.05, 0)} 元`, "酒价、利润、估值同时改善"),
      scenario("当前价格隐含增速", isNum(implied) ? `${fmt(implied, 1)}%` : "--", "按当前价和目标PE反推"),
      scenario("当前判断", status, "仅为情景推演，不是投资承诺"),
    ].join("");
  }

  function drawTables() {
    const wineMap = new Map(state.winePrices.map((r) => [r.date, r]));
    const stockRuntime = stockRuntimeStatus();
    els.recentRows.innerHTML = sorted(state.stockDaily).slice(-12).reverse().map((s) => {
      const w = wineMap.get(s.date) || {};
      return `<tr><td>${s.date}</td><td>${display(w.bottlePrice)}</td><td>${display(w.casePrice)}</td><td>${display(s.close, 2)}</td><td>${display(s.peTtm ?? s.peStatic, 1)}</td><td>${w.source || s.source || stockRuntime.sourceLabel || "--"}</td></tr>`;
    }).join("");
    els.reportRows.innerHTML = sorted(state.financialReports, "period").slice(-8).reverse().map((r) => `<tr><td>${r.period}</td><td>${fmt(toYi(r.revenue), 1)}</td><td>${fmt(toYi(r.netProfit), 1)}</td><td>${display(r.eps, 2)}</td><td>${pctRaw(r.grossMargin)}</td><td>${pctRaw(r.netMargin)}</td></tr>`).join("");
  }

  function renderEntryForm() {
    if (!els.dataEntryForm) return;
    const today = new Date().toISOString().slice(0, 10);
    const latestReport = latest(state.financialReports, "period")?.period || "2026Q1";
    const forms = {
      winePrices: [
        field("日期", "date", "date", today, "required"),
        field("散瓶价", "bottlePrice", "number", "", "step=\"1\" placeholder=\"1645\""),
        field("原箱价", "casePrice", "number", "", "step=\"1\" placeholder=\"1680\""),
        field("来源", "source", "text", "", "placeholder=\"今日酒价/茅粉鲁智深\""),
        selectField("已核验", "verified", [["true", "是"], ["false", "否"]]),
        selectField("样例数据", "sample", [["false", "否"], ["true", "是"]]),
        field("备注", "note", "text", "", "class=\"span-2\" placeholder=\"渠道反馈、补贴、调价...\""),
      ],
      stockDaily: [
        field("日期", "date", "date", today, "required"),
        field("收盘价", "close", "number", "", "step=\"0.01\" placeholder=\"1348\""),
        field("开盘价", "open", "number", "", "step=\"0.01\""),
        field("最高价", "high", "number", "", "step=\"0.01\""),
        field("最低价", "low", "number", "", "step=\"0.01\""),
        field("涨跌幅%", "pctChange", "number", "", "step=\"0.01\""),
        field("PE TTM", "peTtm", "number", "", "step=\"0.01\""),
        field("PE静态", "peStatic", "number", "", "step=\"0.01\""),
        field("PB", "pb", "number", "", "step=\"0.01\""),
        field("股息率%", "dividendYield", "number", "", "step=\"0.01\""),
        field("成交量", "volume", "number", "", "step=\"1\""),
        field("成交额", "amount", "number", "", "step=\"1\""),
        field("市值", "marketCap", "number", "", "step=\"1\""),
        selectField("样例数据", "sample", [["false", "否"], ["true", "是"]]),
      ],
      financialReports: [
        field("报告期", "period", "text", latestReport, "required placeholder=\"2026Q1 / 2025\""),
        selectField("报告类型", "reportType", [["q1", "一季报"], ["half", "半年报"], ["q3", "三季报"], ["annual", "年报"]]),
        field("营收", "revenue", "number", "", "step=\"1\" placeholder=\"元\""),
        field("营收同比%", "revenueYoY", "number", "", "step=\"0.01\""),
        field("归母净利润", "netProfit", "number", "", "step=\"1\" placeholder=\"元\""),
        field("净利同比%", "netProfitYoY", "number", "", "step=\"0.01\""),
        field("扣非净利润", "deductNetProfit", "number", "", "step=\"1\""),
        field("EPS", "eps", "number", "", "step=\"0.01\""),
        field("毛利率%", "grossMargin", "number", "", "step=\"0.01\""),
        field("净利率%", "netMargin", "number", "", "step=\"0.01\""),
        field("ROE%", "roe", "number", "", "step=\"0.01\""),
        field("经营现金流", "operatingCashFlow", "number", "", "step=\"1\""),
        field("每股分红", "dividendPerShare", "number", "", "step=\"0.01\""),
        field("茅台酒收入", "moutaiWineRevenue", "number", "", "step=\"1\""),
        field("系列酒收入", "seriesWineRevenue", "number", "", "step=\"1\""),
        field("直销收入", "directSalesRevenue", "number", "", "step=\"1\""),
        field("批发代理收入", "wholesaleRevenue", "number", "", "step=\"1\""),
        field("i茅台收入", "iMoutaiRevenue", "number", "", "step=\"1\""),
        field("经销商数量", "dealerCount", "number", "", "step=\"1\""),
        field("来源", "source", "text", "", "placeholder=\"年报/季报\""),
        selectField("样例数据", "sample", [["false", "否"], ["true", "是"]]),
        field("备注", "note", "text", "", "class=\"span-2\""),
      ],
      events: [
        field("日期", "date", "date", today, "required"),
        selectField("类型", "type", [["price", "酒价"], ["financial", "财务"], ["policy", "政策"], ["buyback", "回购"], ["dividend", "分红"], ["channel", "渠道"], ["custom", "自定义"]]),
        field("标题", "title", "text", "", "required placeholder=\"事件标题\""),
        field("影响", "impact", "text", "", "placeholder=\"利好/利空/中性\""),
        field("来源", "source", "text", "", "placeholder=\"公告/媒体/渠道\""),
        field("描述", "description", "text", "", "class=\"span-2\" placeholder=\"事件内容和影响路径\""),
      ],
    };
    els.dataEntryForm.innerHTML = `${forms[entryType].join("")}<button type="submit">保存${entryName(entryType)}</button>`;
  }

  function addEntry(type, row) {
    const normalized = normalizeCsvRow(type, { ...row, sample: row.sample || "false" });
    const key = type === "financialReports" ? "period" : "date";
    if (!state[type] || !normalized[key]) return;
    if (type === "winePrices") {
      normalized.source ||= "手动录入";
      normalized.verified = row.verified === "true";
      normalized.sample = row.sample === "true";
    }
    if (type === "stockDaily" || type === "financialReports") normalized.sample = row.sample === "true";
    if (type === "events") normalized.type ||= "custom";
    upsert(state[type], normalized, key);
    els.dataEntryForm.reset();
  }

  function field(label, name, type, value = "", attrs = "") {
    const cls = attrs.includes("class=\"span-2\"") ? " class=\"span-2\"" : "";
    const cleanAttrs = attrs.replace("class=\"span-2\"", "").trim();
    return `<label${cls}>${label}<input name="${name}" type="${type}" value="${value ?? ""}" ${cleanAttrs} /></label>`;
  }

  function selectField(label, name, options) {
    return `<label>${label}<select name="${name}">${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}</select></label>`;
  }

  function entryName(type) {
    return { winePrices: "酒价", stockDaily: "股价", financialReports: "财报", events: "事件" }[type] || "数据";
  }

  function importCsv(type, text) {
    const rows = parseCsv(text);
    const target = state[type];
    if (!Array.isArray(target)) return;
    rows.forEach((row) => upsert(target, normalizeCsvRow(type, row), type === "financialReports" ? "period" : "date"));
  }

  function normalizeCsvRow(type, row) {
    if (type === "winePrices") return { date: row.date || row.日期, product: row.product, year: row.year, spec: row.spec, bottlePrice: num(row.bottlePrice || row.散瓶), casePrice: num(row.casePrice || row.原箱), priceType: row.priceType, source: row.source || row.来源 || "CSV导入", sourceUrl: row.sourceUrl || "", verified: bool(row.verified || row.已核验), sample: bool(row.sample || row.样例), estimated: bool(row.estimated || row.估算), sourcePoint: bool(row.sourcePoint || row.真实来源点), note: row.note || row.备注 || "" };
    if (type === "stockDaily") return { date: row.date || row.日期, close: num(row.close || row.收盘 || row.stockPrice), open: num(row.open || row.开盘), high: num(row.high || row.最高), low: num(row.low || row.最低), volume: num(row.volume || row.成交量), amount: num(row.amount || row.成交额), pctChange: num(row.pctChange || row.涨跌幅), pe: num(row.pe), peTtm: num(row.peTtm), peStatic: num(row.peStatic), pb: num(row.pb), dividendYield: num(row.dividendYield || row.股息率), dividendYieldTtm: num(row.dividendYieldTtm), totalMarketCap: num(row.totalMarketCap || row.marketCap || row.市值), marketCap: num(row.marketCap || row.totalMarketCap || row.市值), source: row.source || "CSV导入", verified: bool(row.verified || row.已核验), sample: bool(row.sample || row.样例), note: row.note || "" };
    if (type === "financialReports") return { ...row, period: row.period || row.报告期, reportType: row.reportType || row.类型, revenue: num(row.revenue || row.营收), revenueYoY: num(row.revenueYoY || row.营收同比), netProfit: num(row.netProfit || row.归母净利润), netProfitYoY: num(row.netProfitYoY || row.净利同比), deductNetProfit: num(row.deductNetProfit), eps: num(row.eps), grossMargin: num(row.grossMargin), netMargin: num(row.netMargin), roe: num(row.roe), operatingCashFlow: num(row.operatingCashFlow), dividendPerShare: num(row.dividendPerShare), moutaiWineRevenue: num(row.moutaiWineRevenue), seriesWineRevenue: num(row.seriesWineRevenue), directSalesRevenue: num(row.directSalesRevenue), wholesaleRevenue: num(row.wholesaleRevenue), iMoutaiRevenue: num(row.iMoutaiRevenue), dealerCount: num(row.dealerCount), source: row.source || row.来源 || "CSV导入", sourceUrl: row.sourceUrl || "", verified: bool(row.verified || row.已核验), sample: bool(row.sample || row.样例), note: row.note || row.备注 || "" };
    return { date: row.date || row.日期, type: row.type || row.类型 || "custom", title: row.title || row.标题, description: row.description || row.描述, impact: row.impact || row.影响, source: row.source || row.来源, sourceUrl: row.sourceUrl || "", verified: bool(row.verified || row.已核验), sample: bool(row.sample || row.样例), note: row.note || "" };
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const headers = lines.shift().split(",").map((h) => h.trim());
    return lines.map((line) => Object.fromEntries(line.split(",").map((c, i) => [headers[i], c.trim()])));
  }

  function downloadTemplate(type) {
    const templates = {
      winePrices: "date,product,year,spec,bottlePrice,casePrice,priceType,source,sourceUrl,verified,sample,note\n2026-05-13,53度飞天茅台,当年,500ml,1645,1680,批价,今日酒价,,true,false,示例",
      stockDaily: "date,open,high,low,close,pctChange,volume,amount,pe,peTtm,pb,dividendYield,dividendYieldTtm,totalMarketCap,source,verified,sample,note\n2026-05-13,,,,1348,-1,,,,20.5,,3.7,,,tushare,true,false,示例",
      financialReports: "period,reportType,revenue,revenueYoY,netProfit,netProfitYoY,deductNetProfit,eps,grossMargin,netMargin,roe,operatingCashFlow,dividendPerShare,moutaiWineRevenue,seriesWineRevenue,directSalesRevenue,wholesaleRevenue,iMoutaiRevenue,dealerCount,source,sourceUrl,verified,sample,note\n2026Q1,q1,53909000000,6.54,27243000000,1.47,,21.7,,,,834000000,,,29504000000,24382000000,21553000000,,一季报,,true,false,示例",
      events: "date,type,title,description,impact,source,sourceUrl,verified,sample,note\n2026-03-31,price,飞天调价,合同价和自营价上调,positive,公司公告报道,,true,false,",
    };
    const names = { winePrices: "wine-price-template.csv", stockDaily: "stock-daily-template.csv", financialReports: "financial-report-template.csv", events: "events-template.csv" };
    download(names[type], templates[type], "text/csv;charset=utf-8");
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

  function filterRange(rows, key = "date") {
    if (range === "all" || !rows.length) return rows;
    const latestDate = new Date(rows.at(-1)[key]);
    const start = new Date(latestDate);
    const map = { "1m": [1, "m"], "3m": [3, "m"], "6m": [6, "m"], "1y": [1, "y"], "2y": [2, "y"], "3y": [3, "y"], "5y": [5, "y"], "10y": [10, "y"] };
    const [n, unit] = map[range];
    if (unit === "m") start.setMonth(start.getMonth() - n);
    if (unit === "y") start.setFullYear(start.getFullYear() - n);
    return rows.filter((row) => new Date(row[key]) >= start);
  }

  function mergeByDate(a, b, mapper) {
    const dates = [...new Set([...a.map((r) => r.date), ...b.map((r) => r.date)])].sort();
    const ma = new Map(a.map((r) => [r.date, r]));
    const mb = new Map(b.map((r) => [r.date, r]));
    return dates.map((date) => mapper(ma.get(date), mb.get(date)));
  }

  function mergeNearest(wines, stocks) {
    return wines.map((w) => ({ ...w, ...(stocks.find((s) => s.date === w.date) || nearestBefore(stocks, w.date) || {}) }));
  }

  function nearestBefore(rows, date) {
    return sorted(rows).filter((r) => r.date <= date).at(-1);
  }

  function addIndexes(rows, source, target) {
    const first = rows.find((r) => isNum(r[source]))?.[source];
    rows.forEach((row) => { row[target] = isNum(row[source]) && first ? (row[source] / first - 1) * 100 : null; });
  }

  function xValue(row, key) {
    return +new Date(row[key]);
  }

  function xScale(rows, plot, key) {
    if (key === "period") return (v) => plot.x + (v / Math.max(1, rows.length - 1)) * plot.w;
    const values = rows.map((r) => xValue(r, key));
    return scale(Math.min(...values), Math.max(...values), plot.x, plot.x + plot.w);
  }

  function valueScale(values, plot) {
    const clean = values.filter(isNum);
    const minRaw = Math.min(...clean);
    const maxRaw = Math.max(...clean);
    const span = maxRaw - minRaw || 1;
    const min = minRaw - span * 0.12;
    const max = maxRaw + span * 0.12;
    return { min, max, y: scale(min, max, plot.y + plot.h, plot.y) };
  }

  function path(rows, field, x, y, color, key = "date") {
    const points = rows.filter((r) => isNum(r[field]));
    const d = points.map((r, i) => `${i ? "L" : "M"}${x(key === "period" ? rows.indexOf(r) : xValue(r, key)).toFixed(1)},${y(r[field]).toFixed(1)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  function dots(rows, field, x, y, color, key = "date") {
    return rows
      .filter((r) => isNum(r[field]) && !r.sample && (r.sourcePoint === true || (r.estimated === false && r.verified === true)))
      .map((r) => `<circle cx="${x(key === "period" ? rows.indexOf(r) : xValue(r, key))}" cy="${y(r[field])}" r="${r.sourcePoint === true ? 3.5 : 2.5}" fill="${color}" stroke="#fff"/>`)
      .join("");
  }

  function refLines(values, y, plot) {
    return values.map((v) => `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y.y(v)}" y2="${y.y(v)}" stroke="#999" stroke-dasharray="4 4" stroke-opacity=".45"/><text x="${plot.x + 4}" y="${y.y(v) - 4}" font-size="11" fill="#777">${v}</text>`).join("");
  }

  function grid(plot) {
    let out = `<rect x="${plot.x}" y="${plot.y}" width="${plot.w}" height="${plot.h}" fill="#fffdf8"/>`;
    for (let i = 0; i <= 5; i++) {
      const y = plot.y + (plot.h * i) / 5;
      out += `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y}" y2="${y}" stroke="#e7dfd2"/>`;
    }
    return out;
  }

  function axes(plot, left, right, suffix = "") {
    let out = "";
    for (let i = 0; i <= 5; i++) {
      const y = plot.y + (plot.h * i) / 5;
      out += `<text x="${plot.x - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#65716a">${fmt(left.max - ((left.max - left.min) * i) / 5, 0)}${suffix}</text>`;
      out += `<text x="${plot.x + plot.w + 8}" y="${y + 4}" text-anchor="start" font-size="11" fill="#65716a">${fmt(right.max - ((right.max - right.min) * i) / 5, 0)}${suffix}</text>`;
    }
    return out;
  }

  function scale(min, max, outMin, outMax) {
    const span = max - min || 1;
    return (v) => outMin + ((v - min) / span) * (outMax - outMin);
  }

  function note(title, body) {
    return `<div class="note-card"><strong>${title}</strong><span>${body}</span></div>`;
  }

  function metric(label, value, positive) {
    const cls = positive === undefined ? "" : positive ? "positive" : "negative";
    return `<div class="metric"><span>${label}</span><strong class="${cls}">${value ?? "--"}</strong></div>`;
  }

  function scenario(title, value, noteText) {
    return `<div class="scenario"><strong>${title}</strong><span>${value}</span><small>${noteText}</small></div>`;
  }

  function legend(items) {
    return items.map((item, index) => `<span><i class="${index === 0 ? "gold" : index === 1 ? "blue" : "red"}"></i>${item}</span>`).join("");
  }

  function impliedGrowth(pe) {
    if (!isNum(pe)) return { label: "--", note: "--" };
    if (pe < 18) return { label: "0%-3%", note: "低增长高分红资产定价" };
    if (pe < 21) return { label: "3%-5%", note: "弱修复预期" };
    if (pe < 24) return { label: "5%-7%", note: "利润温和修复预期" };
    if (pe < 28) return { label: "8%-10%", note: "重新交易成长性" };
    return { label: "10%+", note: "需要强业绩兑现" };
  }

  function forecastStatus(stateName, growth) {
    if (stateName === "below1600" || growth < 3) return "风险观察";
    if (growth < 5) return "等待验证";
    if (stateName === "1650-1700" && growth >= 7) return "修复观察";
    if (stateName === "above1700" && growth >= 8) return "强修复";
    return "等待验证";
  }

  function wineStateAdjustment(stateName) {
    return { below1600: -3, "1600-1650": 0, "1650-1700": 1, above1700: 2 }[stateName] || 0;
  }

  function upsert(list, row, key) {
    const index = list.findIndex((item) => item[key] === row[key]);
    if (index >= 0) list[index] = { ...list[index], ...row };
    else list.push(row);
  }

  function toYi(value) {
    return isNum(value) ? value / 100000000 : null;
  }

  function changePct(start, end) {
    return isNum(start) && isNum(end) && start ? (end - start) / start : null;
  }

  function correlation(xs, ys) {
    const pairs = xs.map((x, i) => [Number(x), Number(ys[i])]).filter(([x, y]) => isNum(x) && isNum(y));
    if (pairs.length < 3) return null;
    const mx = pairs.reduce((s, [x]) => s + x, 0) / pairs.length;
    const my = pairs.reduce((s, [, y]) => s + y, 0) / pairs.length;
    let n = 0, dx = 0, dy = 0;
    pairs.forEach(([x, y]) => { n += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; });
    return n / Math.sqrt(dx * dy);
  }

  function percentile(values, value) {
    if (!values.length || !isNum(value)) return null;
    return (values.filter((v) => v <= value).length / values.length) * 100;
  }

  function pct(value) {
    return isNum(value) ? `${fmt(value * 100, 1)}%` : "--";
  }

  function pctRaw(value) {
    return isNum(value) ? `${fmt(value, 1)}%` : "--";
  }

  function fmt(value, digits = 0) {
    return isNum(value) ? Number(value).toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "--";
  }

  function display(value, digits = 0) {
    return fmt(value, digits);
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function bool(value) {
    return value === true || value === "true" || value === "是" || value === "1";
  }

  function isNum(value) {
    return Number.isFinite(Number(value));
  }
})();

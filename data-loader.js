(function () {
  const files = {
    stockDaily: "data/stockDaily.json",
    winePrices: "data/winePrices.json",
    winePriceSourcePoints: "data/winePriceSourcePoints.json",
    financialReports: "data/financialReports.json",
    events: "data/events.json",
    dataSourceStatus: "data/dataSourceStatus.json",
    dataQualityReport: "data/dataQualityReport.json",
    updateLog: "data/updateLog.json",
  };

  function loadJson(path) {
    try {
      const request = new XMLHttpRequest();
      request.open("GET", path, false);
      request.send(null);
      if (request.status >= 200 && request.status < 300) {
        return { data: JSON.parse(request.responseText), error: "" };
      }
      return { data: null, error: `${path} ${request.status}` };
    } catch (error) {
      return { data: null, error: `${path} ${error.message}` };
    }
  }

  const loaded = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, loadJson(path)]));
  const seed = window.MOUTAI_SEED || {};
  const updateLog = Array.isArray(loaded.updateLog.data) ? loaded.updateLog.data : [];
  const status = loaded.dataSourceStatus.data && !Array.isArray(loaded.dataSourceStatus.data)
    ? loaded.dataSourceStatus.data
    : {};

  window.MOUTAI_DATA_SOURCE_STATUS = {
    ...status,
    dataQualityReport: loaded.dataQualityReport.data && !Array.isArray(loaded.dataQualityReport.data) ? loaded.dataQualityReport.data : null,
    updateLog,
    updateLogError: loaded.updateLog.error,
  };

  window.MOUTAI_SEED = {
    ...seed,
    stockDaily: Array.isArray(loaded.stockDaily.data) && loaded.stockDaily.data.length ? loaded.stockDaily.data : (seed.stockDaily || []),
    winePrices: Array.isArray(loaded.winePrices.data) && loaded.winePrices.data.length ? loaded.winePrices.data : (seed.winePrices || []),
    winePriceSourcePoints: Array.isArray(loaded.winePriceSourcePoints.data) ? loaded.winePriceSourcePoints.data : (seed.winePriceSourcePoints || []),
    financialReports: Array.isArray(loaded.financialReports.data) && loaded.financialReports.data.length ? loaded.financialReports.data : (seed.financialReports || []),
    events: Array.isArray(loaded.events.data) && loaded.events.data.length ? loaded.events.data : (seed.events || []),
    dataSourceStatus: Object.keys(status).length ? status : (seed.dataSourceStatus || null),
    dataQualityReport: loaded.dataQualityReport.data && !Array.isArray(loaded.dataQualityReport.data) ? loaded.dataQualityReport.data : (seed.dataQualityReport || null),
    updateLog,
  };

  function latestLog() {
    return [...updateLog].filter(Boolean).sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""))).at(-1);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function fmt(value) {
    return value === null || value === undefined || value === "" ? "--" : String(value);
  }

  function dataStateText(log) {
    const loadedDataCount = ["stockDaily", "winePrices", "financialReports", "events"].filter((key) => Array.isArray(loaded[key].data) && loaded[key].data.length > 0).length;
    const failed = [status.stock, status.winePrice, status.financialReports].some((item) => item && item.success === false && !item.skipped);
    if (!loadedDataCount) return "使用演示数据";
    if (failed) return "部分数据读取失败";
    if (log?.status === "no_change") return "脚本已运行但没有新增数据";
    if (status.winePrice?.todayUpdated === false) return "今日数据未更新";
    return "真实数据已加载";
  }

  function renderUpdateLog() {
    const log = latestLog();
    const badge = document.getElementById("updateTimestampBadge");
    const panel = document.getElementById("updateLogPanel");
    const stateTag = document.getElementById("updateLogStatus");
    const stateText = dataStateText(log);
    if (badge) {
      badge.className = `update-timestamp ${stateText === "使用演示数据" ? "demo" : ""} ${stateText.includes("失败") || stateText.includes("未更新") ? "warning" : ""}`.trim();
      badge.textContent = stateText === "使用演示数据"
        ? "当前使用演示数据，未读取到 data/*.json"
        : `数据更新时间：${log?.updatedAt || status.updatedAt || "--"}｜当前数据源：data/*.json｜状态：${stateText}`;
    }
    if (!panel) return;
    if (!log) {
      if (stateTag) {
        stateTag.className = "update-log-status neutral";
        stateTag.textContent = "暂无日志";
      }
      panel.innerHTML = '<p class="update-log-summary">暂无更新日志。</p>';
      return;
    }
    const statusClass = log.status === "failed" ? "failed" : log.status === "no_change" ? "neutral" : "success";
    if (stateTag) {
      stateTag.className = `update-log-status ${statusClass}`;
      stateTag.textContent = log.status === "failed" ? "失败" : log.status === "no_change" ? "无新增数据" : "成功";
    }
    const stats = log.dataStats || {};
    const latestData = log.latestData || {};
    const wineStatus = status.winePrice || {};
    const changes = Array.isArray(log.changes) && log.changes.length
      ? log.changes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : "<li>本次运行没有记录明细。</li>";
    const note = wineStatus.success === false || wineStatus.todayUpdated === false
      ? "今日酒价未更新，当前使用最近一次成功数据。"
      : log.status === "no_change"
        ? "脚本已运行，但没有发现新数据，当前使用最近一次成功数据。"
        : "本次更新日志已加载，可通过更新时间和关键数据变化确认页面读取的是最新数据。";
    panel.innerHTML = `
      <div class="update-log-main">
        <div>
          <strong>${escapeHtml(log.updatedAt || "--")}｜${escapeHtml(log.title || "数据更新")}</strong>
          <p class="update-log-summary">${escapeHtml(log.summary || "暂无更新摘要。")}</p>
          <ul class="update-log-list">${changes}</ul>
          <p class="update-log-note">${escapeHtml(note)}</p>
        </div>
        <div class="update-log-grid">
          <div class="metric"><span>winePrices</span><strong>${fmt(stats.winePrices)}</strong></div>
          <div class="metric"><span>estimated=true</span><strong>${fmt(stats.wineEstimatedPoints)}</strong></div>
          <div class="metric"><span>真实展示点</span><strong>${fmt(stats.wineRealDisplayPoints)}</strong></div>
          <div class="metric"><span>sourcePoints</span><strong>${fmt(stats.wineSourcePoints)}</strong></div>
          <div class="metric"><span>events</span><strong>${fmt(stats.events)}</strong></div>
          <div class="metric"><span>最新真实酒价</span><strong>${fmt(latestData.latestWineDate || wineStatus.latestRealDate)}｜${fmt(latestData.latestWinePrice ?? wineStatus.latestRealBottlePrice)}</strong></div>
          <div class="metric"><span>页面数据状态</span><strong>${escapeHtml(stateText)}</strong></div>
          <div class="metric"><span>今日酒价</span><strong>${wineStatus.todayUpdated ? "已更新" : "未更新"}</strong></div>
        </div>
      </div>
    `;
  }

  function renderDataQualityAudit() {
    const report = loaded.dataQualityReport.data && !Array.isArray(loaded.dataQualityReport.data) ? loaded.dataQualityReport.data : null;
    if (!report) return;
    const panel = document.getElementById("dataQualityPanel");
    const fieldCompleteness = report.stock?.fieldCompleteness || {};
    const wineStockMatchedDates = report.winePrice?.matchedStockDateRecords ?? 0;
    const peTtmAvailable = fieldCompleteness.peTtm?.available ?? 0;
    const rows = [
      ["PE TTM 完整率", completenessText(fieldCompleteness.peTtm)],
      ["PB 完整率", completenessText(fieldCompleteness.pb)],
      ["股息率完整率", completenessText(fieldCompleteness.dividendYield)],
      ["市值完整率", completenessText(fieldCompleteness.totalMarketCap)],
      ["酒价股价可对齐样本数", `${wineStockMatchedDates} 条`],
    ];
    if (peTtmAvailable < 30) rows.push(["PE 分位审计", "估值字段不足，暂不输出正式 PE 分位"]);
    if (wineStockMatchedDates < 5) rows.push(["相关性审计", "真实有效样本不足，暂不输出正式相关性判断"]);
    const html = rows.map(([label, value]) => `<div class="note"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
    if (panel && !panel.querySelector("[data-quality-audit='true']")) {
      panel.insertAdjacentHTML("afterbegin", `<div data-quality-audit="true">${html}</div>`);
    }
    const pePercentile = document.getElementById("pePercentile");
    if (pePercentile && peTtmAvailable < 30) pePercentile.textContent = "--";
    const relationshipPanel = document.getElementById("relationshipPanel");
    if (relationshipPanel && wineStockMatchedDates < 5) {
      relationshipPanel.innerHTML = `
        <div class="metric"><span>有效样本</span><strong>${wineStockMatchedDates} 条</strong></div>
        <div class="metric"><span>相关系数</span><strong>真实有效样本不足，暂不输出正式相关性判断</strong></div>
        <div class="metric"><span>当前关系</span><strong>真实有效样本不足，暂不输出正式相关性判断</strong></div>
        <div class="metric"><span>计算口径</span><strong>estimated=false && verified=true && sample=false</strong></div>
      `;
    }
  }

  function completenessText(item) {
    if (!item) return "--";
    const rate = Number(item.rate);
    const percent = Number.isFinite(rate) ? `${(rate * 100).toFixed(1)}%` : "--";
    return `${percent}｜${item.available ?? 0}/${item.total ?? 0}`;
  }

  function injectUpdateLogStyles() {
    if (document.getElementById("updateLogInlineStyles")) return;
    const style = document.createElement("style");
    style.id = "updateLogInlineStyles";
    style.textContent = `
      .update-timestamp{display:inline-flex;max-width:100%;margin-bottom:8px;border:1px solid #c8d7cb;background:#f1faf3;color:#315d43;border-radius:999px;padding:6px 11px;font-size:12px;line-height:1.35}
      .update-timestamp.demo,.update-log-status.neutral{border-color:#d7c8aa;background:#fff8e8;color:#70552a}
      .update-timestamp.warning,.update-log-status.failed{border-color:#e1a19a;background:#fff0ee;color:#8e2f26}
      .update-log-card{margin-bottom:8px;border:1px solid var(--line,#ddd5c8);background:var(--panel,#fffdf8);border-radius:8px;padding:10px 12px}
      .update-log-head,.update-log-main,.update-log-grid{display:grid;gap:8px}
      .update-log-head{grid-template-columns:1fr auto;align-items:center;margin-bottom:8px}
      .update-log-status{border:1px solid #c8d7cb;background:#f1faf3;color:#315d43;border-radius:999px;padding:4px 9px;font-size:12px}
      .update-log-main{grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr)}
      .update-log-summary{color:var(--muted,#65716a);font-size:13px;line-height:1.5}
      .update-log-list{margin:7px 0 0;padding-left:18px;color:var(--muted,#65716a);font-size:12px;line-height:1.55}
      .update-log-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .update-log-note{margin-top:8px;color:var(--muted,#65716a);font-size:12px;line-height:1.5}
      @media (max-width:1100px){.update-log-main,.update-log-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  injectUpdateLogStyles();
  renderUpdateLog();
  setTimeout(renderDataQualityAudit, 0);
  setTimeout(renderDataQualityAudit, 300);
})();

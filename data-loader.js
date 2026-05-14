(function () {
  const status = { mode: 'demo', message: '使用 seed-data.js 演示数据。' };

  function readJson(path) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', path, false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) return JSON.parse(xhr.responseText);
      throw new Error(path + ' ' + xhr.status);
    } catch (error) {
      status.message = 'data 目录读取失败，已回退演示数据。若使用 file:// 打开，请运行 python -m http.server 8000 后访问 http://localhost:8000。错误：' + error.message;
      return null;
    }
  }

  const stockDaily = readJson('data/stockDaily.json');
  const winePrices = readJson('data/winePrices.json');
  const financialReports = readJson('data/financialReports.json');
  const events = readJson('data/events.json');
  const dataSourceStatus = readJson('data/dataSourceStatus.json');
  const hasData = [stockDaily, winePrices, financialReports, events].some((item) => Array.isArray(item) && item.length);

  if (hasData) {
    window.MOUTAI_SEED = {
      ...(window.MOUTAI_SEED || {}),
      stockDaily: Array.isArray(stockDaily) ? stockDaily : [],
      winePrices: Array.isArray(winePrices) ? winePrices : [],
      financialReports: Array.isArray(financialReports) ? financialReports : [],
      events: Array.isArray(events) ? events : [],
      dataSourceStatus: dataSourceStatus || null,
    };
    status.mode = 'real';
    status.message = '使用 data/*.json 数据；如果数组为空，页面会继续展示演示框架。';
  }

  window.MOUTAI_DATA_LOAD_STATUS = status;

  document.addEventListener('DOMContentLoaded', function () {
    const panel = document.getElementById('dataSourcePanel');
    if (!panel) return;
    const source = dataSourceStatus || {};
    const row = (title, body) => '<div class="note-card"><strong>' + title + '</strong><span>' + body + '</span></div>';
    panel.innerHTML = [
      row('当前数据模式', status.mode === 'real' ? '真实数据优先' : '演示数据'),
      row('加载说明', status.message),
      row('股价数据', source.stock ? source.stock.updatedAt + '｜' + source.stock.message : '--'),
      row('酒价数据', source.winePrice ? source.winePrice.updatedAt + '｜' + source.winePrice.message : '--'),
      row('财报数据', source.financialReports ? source.financialReports.updatedAt + '｜' + source.financialReports.message : '--')
    ].join('');
  });
})();

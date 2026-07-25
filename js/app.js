(function() {
  var TABS = [
    { id: "overview", label: "Dashboard" },
    { id: "forecast", label: "13-Week Forecast" },
    { id: "bank", label: "ICBC Statements" },
    { id: "sap", label: "SAP Link" },
    { id: "reconcile", label: "Reconciliation" },
    { id: "alerts", label: "Alerts" },
    { id: "reports", label: "Reports" },
  ];

  var state = loadState();
  var charts = {};

  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem("songyu-demo") || "{}");
    } catch (e) {
      s = {};
    }
    return {
      theme: s.theme || "light",
      tab: s.tab || "overview",
      scenario: s.scenario || "base",
      drillId: s.drillId || "",
      chatOpen: s.chatOpen || false,
      chatMessages: s.chatMessages || [{ role: "assistant", text: CHAT_WELCOME, time: "09:00" }],
      emailOn: s.emailOn !== false,
      teamsOn: s.teamsOn !== false,
      reconNotes: s.reconNotes || {},
      reconAssignee: s.reconAssignee || {},
      reconResolved: s.reconResolved || {},
      closingOverrides: s.closingOverrides || {},
    };
  }

  function saveState() {
    localStorage.setItem("songyu-demo", JSON.stringify(state));
  }

  function chartColors() {
    var dark = state.theme === "dark";
    return {
      text: dark ? "#9ca3af" : "#5c6570",
      grid: dark ? "#333" : "#e5e7eb",
      line: dark ? "#599ce7" : "#2563eb",
      inflow: dark ? "#3fa266" : "#15803d",
      outflow: dark ? "#fc6b83" : "#b91c1c",
      floor: dark ? "#fc6b83" : "#b91c1c",
    };
  }

  function destroyCharts() {
    Object.keys(charts).forEach(function(k) {
      if (charts[k]) charts[k].destroy();
    });
    charts = {};
  }

  function renderTabs() {
    var nav = document.getElementById("tabNav");
    nav.innerHTML = TABS.map(function(t) {
      return '<button type="button" class="tab-btn' + (state.tab === t.id ? " active" : "") + '" data-tab="' + t.id + '">' + t.label + "</button>";
    }).join("");
    nav.querySelectorAll(".tab-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        state.tab = btn.dataset.tab;
        saveState();
        render();
      });
    });
  }

  function renderOverview(el, forecast) {
    var minCash = Math.min.apply(null, forecast.closing);
    var minWeek = WEEKS[forecast.closing.indexOf(minCash)];
    var endCash = forecast.closing[forecast.closing.length - 1];
    var avgBurn = forecast.outflows.reduce(function(a, b) { return a + b; }, 0) / forecast.outflows.length;
    var overrideCount = Object.keys(state.closingOverrides).length;
    var dragBadge = overrideCount ? '<span class="chart-drag-badge">' + overrideCount + " 周已手动调整</span>" : "";
    var resetBtn = overrideCount ? '<button type="button" class="btn btn-sm btn-ghost" id="resetOverrides">重置调整</button>' : "";

    el.innerHTML =
      '<div class="gap-16">' +
      '<div class="row row-between">' +
      '<div class="row"><span style="color:var(--text-muted);font-size:0.8125rem">Scenario</span>' +
      '<select id="scenarioSelect">' +
      Object.keys(SCENARIO_FACTORS).map(function(k) {
        return '<option value="' + k + '"' + (state.scenario === k ? " selected" : "") + ">" + SCENARIO_FACTORS[k].label + "</option>";
      }).join("") +
      "</select></div>" +
      '<div class="row"><span class="pill">ICBC sync · 06:00</span><span class="pill">SAP · 05:42</span><span class="pill">CNY</span>' + resetBtn + "</div></div>" +
      '<div class="grid-4">' +
      statHtml("Opening cash (W27)", formatM(86.4), "", "statOpening") +
      statHtml("Projected closing (W39)", formatM(endCash), endCash >= 80 ? "success" : "warning", "statEndCash") +
      statHtml("Lowest balance · " + minWeek, formatM(minCash), minCash >= 72 ? "success" : "danger", "statMinCash") +
      statHtml("Avg weekly outflow", formatM(avgBurn), "", "statAvgOut") +
      "</div>" +
      '<div class="card"><div class="card-head">13-week operating cash balance (CNY, millions)' + dragBadge + '</div><div class="card-body"><div class="chart-wrap draggable" id="lineChartWrap"><canvas id="lineChart"></canvas></div><div class="chart-drag-tip" id="dragTip">拖动折线<strong>数据点</strong>可调整该周期末现金；后续周次将自动重算（Demo）</div></div></div>' +
      '<div class="grid-2">' +
      '<div class="card"><div class="card-head">Weekly inflow vs outflow</div><div class="card-body"><div class="chart-wrap sm"><canvas id="barChart"></canvas></div></div></div>' +
      '<div class="card"><div class="card-head">Operating categories (W28)</div><div class="card-body stack-sm">' +
      ["Store POS · 62%", "Wholesale · 18%", "Payroll · 28%", "Rent · 14%", "Inventory · 22%"].map(function(l) { return "<div>" + l + "</div>"; }).join("") +
      "</div></div></div>" +
      '<div class="callout warning"><strong>Alert preview</strong>Pessimistic scenario breaches ¥72M policy floor in W36. Email + Teams would notify finance team.</div></div>';

    document.getElementById("scenarioSelect").addEventListener("change", function(e) {
      state.scenario = e.target.value;
      state.closingOverrides = {};
      saveState();
      render();
    });

    var resetEl = document.getElementById("resetOverrides");
    if (resetEl) resetEl.addEventListener("click", function() {
      state.closingOverrides = {};
      saveState();
      render();
    });

    drawLineChart(forecast);
    drawBarChart(forecast);
  }

  function statHtml(label, value, tone, id) {
    return '<div class="stat' + (tone ? " " + tone : "") + '"' + (id ? ' id="' + id + '"' : "") + '><div class="stat-value">' + value + '</div><div class="stat-label">' + label + "</div></div>";
  }

  function updateOverviewKpis(forecast) {
    var minCash = Math.min.apply(null, forecast.closing);
    var minWeek = WEEKS[forecast.closing.indexOf(minCash)];
    var endCash = forecast.closing[forecast.closing.length - 1];
    var avgBurn = forecast.outflows.reduce(function(a, b) { return a + b; }, 0) / forecast.outflows.length;
    var endEl = document.getElementById("statEndCash");
    var minEl = document.getElementById("statMinCash");
    var avgEl = document.getElementById("statAvgOut");
    if (endEl) {
      endEl.querySelector(".stat-value").textContent = formatM(endCash);
      endEl.className = "stat" + (endCash >= 80 ? " success" : " warning");
    }
    if (minEl) {
      minEl.querySelector(".stat-value").textContent = formatM(minCash);
      minEl.querySelector(".stat-label").textContent = "Lowest balance · " + minWeek;
      minEl.className = "stat" + (minCash >= 72 ? " success" : " danger");
    }
    if (avgEl) avgEl.querySelector(".stat-value").textContent = formatM(avgBurn);
  }

  function syncBarChart(forecast) {
    if (!charts.bar) return;
    charts.bar.data.datasets[0].data = forecast.inflows.slice();
    charts.bar.data.datasets[1].data = forecast.outflows.slice();
    charts.bar.update("none");
  }

  function findNearestPoint(chart, evt) {
    var pos = Chart.helpers.getRelativePosition(evt, chart);
    var meta = chart.getDatasetMeta(0);
    var minDist = Infinity;
    var idx = -1;
    meta.data.forEach(function(pt, i) {
      if (!pt || typeof pt.x !== "number") return;
      var dx = pos.x - pt.x;
      var dy = pos.y - pt.y;
      var d = dx * dx + dy * dy;
      if (d < minDist) {
        minDist = d;
        idx = i;
      }
    });
    return minDist <= 400 ? idx : -1;
  }

  function refreshOverridePointStyle(chart) {
    var c = chartColors();
    chart.data.datasets[0].pointBackgroundColor = WEEKS.map(function(_, i) {
      return state.closingOverrides[i] !== undefined ? (state.theme === "dark" ? "#fbbf24" : "#d97706") : c.line;
    });
    chart.data.datasets[0].pointBorderColor = chart.data.datasets[0].pointBackgroundColor;
  }

  function bindLineChartDrag(chart, wrap) {
    var canvas = chart.canvas;
    var drag = { active: false, index: -1 };

    function yToValue(y) {
      var v = chart.scales.y.getValueForPixel(y);
      return Math.round(Math.max(68, Math.min(100, v)) * 10) / 10;
    }

    function applyDrag(index, value) {
      state.closingOverrides[index] = value;
      var forecast = buildForecast(state.scenario, state.closingOverrides);
      chart.data.datasets[0].data = forecast.closing.slice();
      refreshOverridePointStyle(chart);
      chart.update("none");
      syncBarChart(forecast);
      updateOverviewKpis(forecast);
      var tip = document.getElementById("dragTip");
      if (tip) tip.innerHTML = WEEKS[index] + " 期末现金 <strong>" + formatM(value) + "</strong> · 释放鼠标保存";
    }

    canvas.addEventListener("mousedown", function(evt) {
      var idx = findNearestPoint(chart, evt);
      if (idx < 0) return;
      drag.active = true;
      drag.index = idx;
      wrap.classList.add("dragging");
      chart.data.datasets[0].pointRadius = chart.data.datasets[0].data.map(function(_, i) {
        return i === idx ? 7 : 4;
      });
      chart.update("none");
      evt.preventDefault();
    });

    canvas.addEventListener("mousemove", function(evt) {
      if (drag.active && drag.index >= 0) {
        var pos = Chart.helpers.getRelativePosition(evt, chart);
        applyDrag(drag.index, yToValue(pos.y));
        return;
      }
      var idx = findNearestPoint(chart, evt);
      canvas.style.cursor = idx >= 0 ? "grab" : "default";
    });

    function endDrag() {
      if (!drag.active) return;
      drag.active = false;
      wrap.classList.remove("dragging");
      chart.data.datasets[0].pointRadius = 4;
      refreshOverridePointStyle(chart);
      chart.update("none");
      saveState();
      var tip = document.getElementById("dragTip");
      if (tip) tip.innerHTML = '拖动折线<strong>数据点</strong>可调整该周期末现金；后续周次将自动重算（Demo）';
    }

    canvas.addEventListener("mouseup", endDrag);
    canvas.addEventListener("mouseleave", endDrag);
  }

  function drawLineChart(forecast) {
    var closing = forecast.closing;
    var c = chartColors();
    var ctx = document.getElementById("lineChart");
    var wrap = document.getElementById("lineChartWrap");
    if (!ctx) return;
    charts.line = new Chart(ctx, {
      type: "line",
      data: {
        labels: WEEKS,
        datasets: [{
          label: "Closing cash",
          data: closing.slice(),
          borderColor: c.line,
          backgroundColor: "transparent",
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: WEEKS.map(function(_, i) {
            return state.closingOverrides[i] !== undefined ? (state.theme === "dark" ? "#fbbf24" : "#d97706") : c.line;
          }),
          pointBorderColor: WEEKS.map(function(_, i) {
            return state.closingOverrides[i] !== undefined ? (state.theme === "dark" ? "#fbbf24" : "#d97706") : c.line;
          }),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: true },
        plugins: {
          legend: { labels: { color: c.text } },
          tooltip: {
            callbacks: {
              label: function(ctx2) {
                var suffix = state.closingOverrides[ctx2.dataIndex] !== undefined ? " · 手动调整" : "";
                return "Closing cash: ¥" + ctx2.parsed.y.toFixed(1) + "M" + suffix;
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: c.text }, grid: { color: c.grid } },
          y: { min: 68, max: 100, ticks: { color: c.text }, grid: { color: c.grid } },
        },
      },
      plugins: [{
        id: "policyLine",
        afterDraw: function(chart) {
          var yScale = chart.scales.y;
          var y = yScale.getPixelForValue(72);
          var ctx2 = chart.ctx;
          ctx2.save();
          ctx2.strokeStyle = c.floor;
          ctx2.setLineDash([4, 4]);
          ctx2.beginPath();
          ctx2.moveTo(chart.chartArea.left, y);
          ctx2.lineTo(chart.chartArea.right, y);
          ctx2.stroke();
          ctx2.fillStyle = c.floor;
          ctx2.font = "11px sans-serif";
          ctx2.fillText("Policy floor ¥72M", chart.chartArea.left + 4, y - 4);
          ctx2.restore();
        },
      }],
    });
    if (wrap) bindLineChartDrag(charts.line, wrap);
  }

  function drawBarChart(forecast) {
    var c = chartColors();
    var ctx = document.getElementById("barChart");
    if (!ctx) return;
    charts.bar = new Chart(ctx, {
      type: "bar",
      data: {
        labels: WEEKS,
        datasets: [
          { label: "Inflow", data: forecast.inflows, backgroundColor: c.inflow },
          { label: "Outflow", data: forecast.outflows, backgroundColor: c.outflow },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: c.text } } },
        scales: {
          x: { ticks: { color: c.text }, grid: { color: c.grid } },
          y: { ticks: { color: c.text }, grid: { color: c.grid } },
        },
      },
    });
  }

  function renderForecast(el, forecast) {
    var overrideNote = Object.keys(state.closingOverrides).length
      ? '<div class="callout warning"><strong>含手动调整</strong>Dashboard 拖动过的周次已反映在 Outflow / Closing 中。</div>'
      : "";
    var rows = WEEKS.map(function(w, i) {
      var manual = state.closingOverrides[i] !== undefined ? ' title="手动调整"' : "";
      return "<tr" + manual + "><td>" + w + "</td><td class=\"num\">" + formatM(forecast.inflows[i]) + "</td><td class=\"num\">" + formatM(forecast.outflows[i]) + "</td><td class=\"num\">" + formatM(forecast.inflows[i] - forecast.outflows[i]) + "</td><td class=\"num\">" + formatM(forecast.closing[i]) + "</td></tr>";
    }).join("");

    el.innerHTML =
      '<div class="gap-16">' +
      overrideNote +
      '<div class="callout info"><strong>Operating cash only</strong>Rolls forward from ICBC opening balance; inflows/outflows driven by SAP plan (Demo).</div>' +
      '<div class="card"><div class="card-head">13-week rolling grid <span class="pill">' + state.scenario + " case</span></div>" +
      '<div class="card-body flush"><table><thead><tr><th>Week</th><th class="num">Inflow</th><th class="num">Outflow</th><th class="num">Net</th><th class="num">Closing</th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
  }

  function renderBank(el) {
    var rows = ICBC_ROWS.map(function(r) {
      return "<tr><td>" + r.join("</td><td>") + "</td></tr>";
    }).join("");

    el.innerHTML =
      '<div class="gap-16">' +
      '<div class="row"><span class="pill">ICBC 银企直连</span><span class="pill">Daily 06:00</span><span class="pill">****8826</span></div>' +
      '<div class="callout neutral"><strong>工行对账单模板</strong>交易日期, 摘要, 收入, 支出, 余额, 对方户名</div>' +
      '<div class="card"><div class="card-head">Recent ICBC transactions</div><div class="card-body flush"><table><thead><tr><th>Date</th><th>Time</th><th>Summary</th><th class="num">Credit</th><th class="num">Debit</th><th class="num">Balance</th><th>Counterparty</th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
  }

  function renderSap(el) {
    var rows = SAP_ROWS.map(function(r) {
      return "<tr><td>" + r[0] + "</td><td>" + r[1] + '</td><td class="num">' + r[2] + "</td><td>" + r[3] + "</td><td>" + r[4] + "</td><td>" + r[5] + "</td></tr>";
    }).join("");

    el.innerHTML =
      '<div class="gap-16"><div class="grid-3">' +
      statHtml("SAP S/4HANA", "Connected", "success") +
      statHtml("Last sync", "Today 05:42", "") +
      statHtml("Open exceptions", "2", "warning") +
      '</div><div class="card"><div class="card-head">SAP FI documents</div><div class="card-body flush"><table><thead><tr><th>Document</th><th>Type</th><th class="num">Amount</th><th>GL</th><th>Week</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table></div></div></div>";
  }

  function renderReconcile(el) {
    var rows = RECON_ROWS.map(function(r) {
      var rowClass = r.status === "Matched" ? "row-success" : r.status === "Exception" ? "row-danger" : "row-warning";
      var action = r.drill
        ? '<button type="button" class="btn btn-sm' + (state.drillId === r.drill ? " btn-primary" : "") + '" data-drill="' + r.drill + '">钻取</button>'
        : "—";
      return '<tr class="' + rowClass + '"><td>' + r.source + "</td><td>" + r.item + '</td><td class="num">' + r.bank + '</td><td class="num">' + r.sap + '</td><td class="num">' + r.diff + "</td><td>" + r.status + "</td><td>" + action + "</td></tr>";
    }).join("");

    el.innerHTML =
      '<div class="gap-16">' +
      '<div class="callout info"><strong>异常钻取</strong>点击 Exception / Timing 行的「钻取」查看工行与 SAP 对照明细。</div>' +
      '<div class="grid-3">' +
      statHtml("Matched", "86%", "success") +
      statHtml("Exceptions", "1", "danger") +
      statHtml("Timing", "1", "warning") +
      "</div>" +
      '<div class="row">' +
      '<button type="button" class="btn btn-sm" data-drill="inventory-prepay">钻取：库存预付款</button>' +
      '<button type="button" class="btn btn-sm" data-drill="marketing-accrual">钻取：营销 accrual</button>' +
      (state.drillId ? '<button type="button" class="btn btn-sm btn-ghost" id="closeDrill">收起明细</button>' : "") +
      "</div>" +
      '<div class="card"><div class="card-head">Bank vs SAP reconciliation</div><div class="card-body flush"><table><thead><tr><th>Source</th><th>Item</th><th class="num">Bank</th><th class="num">SAP</th><th class="num">Diff</th><th>Status</th><th>操作</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>" +
      '<div id="drillMount"></div></div>';

    el.querySelectorAll("[data-drill]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var id = btn.dataset.drill;
        state.drillId = state.drillId === id ? "" : id;
        saveState();
        render();
      });
    });
    var closeBtn = document.getElementById("closeDrill");
    if (closeBtn) closeBtn.addEventListener("click", function() { state.drillId = ""; saveState(); render(); });

    if (state.drillId && RECON_DRILL[state.drillId]) {
      document.getElementById("drillMount").innerHTML = renderDrillPanel(state.drillId);
      bindDrillPanel(state.drillId);
    }
  }

  function renderDrillPanel(id) {
    var d = RECON_DRILL[id];
    var icbcTable = [
      ["交易日期", d.icbc.date], ["时间", d.icbc.time], ["摘要", d.icbc.summary],
      ["支出 (CNY)", d.icbc.amount], ["流水号", d.icbc.ref], ["对方户名", d.icbc.counterparty],
    ].map(function(r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("");

    var sapTable = [
      ["凭证号", d.sap.document], ["类型", d.sap.type], ["金额", d.sap.amount],
      ["科目", d.sap.gl], ["预测周", d.sap.week], ["状态", d.sap.status],
    ].map(function(r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("");

    var timeline = d.timeline.map(function(l) { return "<div style=\"font-size:0.8125rem\">" + l + "</div>"; }).join("");
    var assignee = state.reconAssignee[id] || "";
    var resolved = state.reconResolved[id];

    return (
      '<div class="card drill-panel"><div class="card-head">' + d.title + '<span class="pill">' + d.status + '</span></div><div class="card-body gap-16">' +
      '<div class="callout ' + (d.status === "Exception" ? "warning" : "info") + '"><strong>差异摘要</strong>' + d.summary + "</div>" +
      '<div class="drill-grid"><div><strong style="font-size:0.875rem">工行流水</strong><table style="margin-top:8px">' + icbcTable + '</table></div><div><strong style="font-size:0.875rem">SAP 凭证</strong><table style="margin-top:8px">' + sapTable + "</table></div></div>" +
      "<div><strong>根因分析</strong><p style=\"font-size:0.8125rem;margin-top:6px\">" + d.rootCause + "</p></div>" +
      "<div><strong>建议处理</strong><p style=\"font-size:0.8125rem;margin-top:6px\">" + d.suggestedAction + "</p></div>" +
      "<div><strong>时间线</strong><div style=\"margin-top:6px\">" + timeline + "</div></div>" +
      '<hr style="border:none;border-top:1px solid var(--border)" />' +
      "<div><strong>异常工作流（Demo）</strong><div class=\"row\" style=\"margin:10px 0\">" +
      '<button type="button" class="btn btn-sm" id="btnClaim">认领异常</button>' +
      '<button type="button" class="btn btn-sm" id="btnResolve">标记已解决</button>' +
      (assignee ? '<span class="pill">' + assignee + "</span>" : "") +
      (resolved ? '<span class="pill">已解决</span>' : "") +
      "</div>" +
      '<textarea id="reconNote" rows="3" placeholder="添加备注…">' + (state.reconNotes[id] || "") + "</textarea></div></div></div>"
    );
  }

  function bindDrillPanel(id) {
    var note = document.getElementById("reconNote");
    if (note) note.addEventListener("input", function() { state.reconNotes[id] = note.value; saveState(); });
    var claim = document.getElementById("btnClaim");
    if (claim) claim.addEventListener("click", function() { state.reconAssignee[id] = "Treasury · Songyu"; saveState(); render(); });
    var resolve = document.getElementById("btnResolve");
    if (resolve) resolve.addEventListener("click", function() { state.reconResolved[id] = true; saveState(); render(); });
  }

  function renderAlerts(el) {
    el.innerHTML =
      '<div class="gap-16"><div class="grid-2">' +
      '<div class="card"><div class="card-head">Notification channels</div><div class="card-body">' +
      toggleRow("Email", "finance@songyu.demo", "emailOn") +
      toggleRow("Microsoft Teams", "#finance-alerts", "teamsOn") +
      "</div></div>" +
      '<div class="card"><div class="card-head">Active rules</div><div class="card-body stack-sm">' +
      ["Closing cash below ¥72M", "Net outflow > ¥45M for 2 weeks", "Recon exception > ¥100K", "Forecast revision > 10%"].map(function(r) { return "<div>" + r + "</div>"; }).join("") +
      "</div></div></div>" +
      '<div class="card"><div class="card-head">Alert log (demo)</div><div class="card-body flush"><table><thead><tr><th>Time</th><th>Rule</th><th>Channel</th><th>Status</th></tr></thead><tbody>' +
      [
        ["2026-07-25 08:00", "Pessimistic breaches floor W36", "Email + Teams", "Sent"],
        ["2026-07-24 08:00", "Recon exception · inventory", "Email", "Sent"],
        ["2026-07-22 08:00", "Daily ICBC sync", "Teams", "Info"],
      ].map(function(r) { return "<tr><td>" + r.join("</td><td>") + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>" +
      '<p style="font-size:0.8125rem;color:var(--text-muted)">Demo only — no messages are sent.</p></div>';

    el.querySelectorAll(".toggle").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var key = btn.dataset.key;
        state[key] = !state[key];
        btn.classList.toggle("on", state[key]);
        saveState();
      });
    });
  }

  function toggleRow(title, sub, key) {
    var on = state[key];
    return (
      '<div class="row row-between" style="margin-bottom:14px"><div><div style="font-weight:500">' + title + '</div><div style="font-size:0.8125rem;color:var(--text-muted)">' + sub + "</div></div>" +
      '<button type="button" class="toggle' + (on ? " on" : "") + '" data-key="' + key + '" aria-label="' + title + '"></button></div>'
    );
  }

  function renderReports(el) {
    el.innerHTML =
      '<div class="gap-16"><div class="grid-3">' +
      reportCard("13-week forecast pack", "PDF + Excel", true) +
      reportCard("ICBC statement extract", "工行对账单", false) +
      reportCard("Reconciliation workbook", "Bank vs SAP", false) +
      "</div>" +
      '<div class="callout neutral"><strong>Collaboration (demo)</strong>Viewer · FP&A Editor · Treasury Admin · Approver</div></div>';

    el.querySelectorAll(".btn-export").forEach(function(btn) {
      btn.addEventListener("click", function() { alert("Demo：导出功能仅为界面展示。"); });
    });
  }

  function reportCard(title, sub, primary) {
    return '<div class="card"><div class="card-body"><div style="font-weight:600;margin-bottom:6px">' + title + '</div><div style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:10px">' + sub + '</div><button type="button" class="btn btn-export' + (primary ? " btn-primary" : "") + '">Export (demo)</button></div></div>';
  }

  function renderChat() {
    var root = document.getElementById("chatRoot");
    if (!state.chatOpen) {
      root.innerHTML = '<div class="chat-launcher"><button type="button" class="btn btn-primary" id="openChat">智能问答</button></div>';
      document.getElementById("openChat").addEventListener("click", function() { state.chatOpen = true; saveState(); renderChat(); });
      return;
    }

    var msgs = state.chatMessages.map(function(m) {
      return '<div class="bubble ' + (m.role === "user" ? "user" : "bot") + '">' + escapeHtml(m.text) + "<time>" + m.time + "</time></div>";
    }).join("");

    var quick = QUICK_QUESTIONS.map(function(q) {
      return '<button type="button" class="btn btn-sm btn-ghost chat-quick">' + escapeHtml(q.length > 14 ? q.slice(0, 14) + "…" : q) + "</button>";
    }).join("");

    root.innerHTML =
      '<div class="chat-panel"><div class="chat-head"><div><div style="font-weight:500">财务预测助手</div><div style="font-size:0.75rem;color:var(--text-muted)">Songyu Demo · 规则回复</div></div><button type="button" class="btn btn-sm btn-ghost" id="closeChat">×</button></div>' +
      '<div class="chat-msgs" id="chatMsgs">' + msgs + "</div>" +
      '<div class="chat-foot"><div class="row">' + quick + '</div><div class="chat-input-row"><input type="text" id="chatInput" placeholder="输入问题…" /><button type="button" class="btn btn-primary" id="sendChat">发送</button></div></div></div>';

    document.getElementById("closeChat").addEventListener("click", function() { state.chatOpen = false; saveState(); renderChat(); });
    document.getElementById("sendChat").addEventListener("click", sendChat);
    document.getElementById("chatInput").addEventListener("keydown", function(e) { if (e.key === "Enter") sendChat(); });
    document.querySelectorAll(".chat-quick").forEach(function(btn, i) {
      btn.addEventListener("click", function() { sendChatMessage(QUICK_QUESTIONS[i]); });
    });
    var box = document.getElementById("chatMsgs");
    box.scrollTop = box.scrollHeight;
  }

  function sendChat() {
    var input = document.getElementById("chatInput");
    if (!input || !input.value.trim()) return;
    sendChatMessage(input.value.trim());
    input.value = "";
  }

  function sendChatMessage(text) {
    var now = new Date();
    var time = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    state.chatMessages.push({ role: "user", text: text, time: time });
    state.chatMessages.push({ role: "assistant", text: demoReply(text, state.scenario, state.tab), time: time });
    saveState();
    renderChat();
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    document.getElementById("themeLabel").textContent = state.theme === "dark" ? "暗夜模式" : "日间模式";
    document.getElementById("btnDark").classList.toggle("active", state.theme === "dark");
    document.getElementById("btnLight").classList.toggle("active", state.theme === "light");
    document.getElementById("btnDark").classList.toggle("btn-primary", state.theme === "dark");
    document.getElementById("btnLight").classList.toggle("btn-primary", state.theme === "light");
  }

  function render() {
    destroyCharts();
    renderTabs();
    applyTheme();
    var forecast = buildForecast(state.scenario, state.closingOverrides);
    var el = document.getElementById("tabContent");
    if (state.tab === "overview") renderOverview(el, forecast);
    else if (state.tab === "forecast") renderForecast(el, forecast);
    else if (state.tab === "bank") renderBank(el);
    else if (state.tab === "sap") renderSap(el);
    else if (state.tab === "reconcile") renderReconcile(el);
    else if (state.tab === "alerts") renderAlerts(el);
    else if (state.tab === "reports") renderReports(el);
    renderChat();
  }

  document.getElementById("btnDark").addEventListener("click", function() {
    state.theme = "dark";
    saveState();
    render();
  });

  document.getElementById("btnLight").addEventListener("click", function() {
    state.theme = "light";
    saveState();
    render();
  });

  render();
})();

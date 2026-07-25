const WEEKS = ["W27", "W28", "W29", "W30", "W31", "W32", "W33", "W34", "W35", "W36", "W37", "W38", "W39"];

const BASE_INFLOW = [42.8, 38.5, 45.2, 41.0, 39.6, 52.1, 48.3, 44.7, 40.2, 46.8, 43.5, 51.0, 47.2];
const BASE_OUTFLOW = [36.2, 34.8, 37.5, 35.0, 38.4, 41.2, 39.8, 36.5, 37.1, 40.5, 38.0, 42.6, 39.4];

const SCENARIO_FACTORS = {
  base: { in: 1, out: 1, label: "Base case" },
  optimistic: { in: 1.08, out: 0.98, label: "Optimistic (+8% sales)" },
  pessimistic: { in: 0.88, out: 1.04, label: "Pessimistic (-12% sales)" },
};

const ICBC_ROWS = [
  ["2026-07-07", "14:32:18", "门店POS汇总-上海国金", "8,420,000.00", "", "86,412,580.33", "Songyu零售有限公司"],
  ["2026-07-07", "09:15:02", "SAP付款-门店租金", "", "2,150,000.00", "77,992,580.33", "上海国金中心商场"],
  ["2026-07-06", "16:48:55", "门店POS汇总-北京SKP", "6,280,000.00", "", "80,142,580.33", "Songyu零售有限公司"],
  ["2026-07-06", "11:20:41", "工资发放", "", "4,860,000.00", "73,862,580.33", "员工薪酬批量代发"],
  ["2026-07-05", "15:03:27", "门店POS汇总-广州太古汇", "5,940,000.00", "", "78,722,580.33", "Songyu零售有限公司"],
];

const SAP_ROWS = [
  ["4500127843", "Vendor payment", "-2,150,000", "60010101", "W28", "Posted"],
  ["1400092211", "Store sales accrual", "+8,420,000", "40010101", "W28", "Posted"],
  ["4500127901", "Inventory purchase", "-6,200,000", "60020101", "W29", "Pending"],
  ["1400092288", "Wholesale receipt", "+3,100,000", "40020101", "W28", "Posted"],
];

const RECON_ROWS = [
  { source: "ICBC 银企直连", item: "POS store deposits W28", bank: "18,640,000", sap: "18,640,000", diff: "0", status: "Matched", drill: null },
  { source: "ICBC 银企直连", item: "Rent payment 7/7", bank: "2,150,000", sap: "2,150,000", diff: "0", status: "Matched", drill: null },
  { source: "ICBC 银企直连", item: "Inventory prepayment", bank: "6,200,000", sap: "6,050,000", diff: "150,000", status: "Exception", drill: "inventory-prepay" },
  { source: "Manual accrual", item: "Marketing accrual W28", bank: "—", sap: "980,000", diff: "980,000", status: "Timing", drill: "marketing-accrual" },
];

const RECON_DRILL = {
  "inventory-prepay": {
    title: "库存预付款 · 金额差异 ¥150,000",
    status: "Exception",
    summary: "ICBC 银企直连付款 ¥6.20M，SAP 已过账 ¥6.05M，差额来自供应商折让未同步至银行摘要。",
    rootCause: "SAP 凭证 4500127901 含 ¥150K 商业折让，工行流水仍按合同全额 ¥6.20M 扣款，折让待次月红字发票冲回后在银行侧体现。",
    suggestedAction: "Treasury 联系 AP 确认折让发票日期；预测 W29 outflow 暂按 SAP ¥6.05M 滚动。",
    icbc: { date: "2026-07-08", time: "10:22:15", summary: "SAP付款-库存预付款", amount: "6,200,000.00", ref: "ICBC20260708102215001", counterparty: "核心供应商" },
    sap: { document: "4500127901", type: "Inventory purchase", amount: "-6,050,000", gl: "60020101", week: "W29", status: "Posted (incl. discount)" },
    timeline: [
      "2026-07-08 06:00 · ICBC 银企直连同步流水",
      "2026-07-08 05:42 · SAP FI 凭证过账",
      "2026-07-08 08:00 · 对账引擎标记 Exception · 差额 > ¥100K",
      "2026-07-08 08:00 · Email 通知 finance@songyu.demo",
    ],
  },
  "marketing-accrual": {
    title: "营销 accrual · 时差差异 ¥980,000",
    status: "Timing",
    summary: "SAP W28 已计提营销费用，银行尚未付款；属于预期内的 timing difference。",
    rootCause: "FP&A 在 W28 末手工 accrual 营销费用 ¥980K，实际付款排期 W30 通过工行批量代发。",
    suggestedAction: "无需金额调整；W30 银行付款入账后自动消差。",
    icbc: { date: "—", time: "—", summary: "（W28 无银行支出 · 预计 W30 付款）", amount: "—", ref: "—", counterparty: "—" },
    sap: { document: "9900123401", type: "Marketing accrual", amount: "-980,000", gl: "60030101", week: "W28", status: "Posted" },
    timeline: [
      "2026-07-07 17:30 · FP&A 提交 W28 marketing accrual",
      "2026-07-08 05:42 · SAP 凭证过账",
      "2026-07-08 08:00 · 对账标记 Timing · 等待 W30 银行付款",
    ],
  },
};

const CHAT_WELCOME = "您好，我是 Songyu 财务预测助手（Demo）。可询问 13 周预测、工行流水、SAP 联动、对账差异或预警规则。";

const QUICK_QUESTIONS = [
  "W39 期末现金是多少？",
  "悲观情景会触发预警吗？",
  "库存预付款对账差异原因？",
  "工行和 SAP 每天如何同步？",
];

function buildForecast(scenario, overrides) {
  const f = SCENARIO_FACTORS[scenario] || SCENARIO_FACTORS.base;
  const inflows = BASE_INFLOW.map(function(v) { return Math.round(v * f.in * 10) / 10; });
  const outflows = BASE_OUTFLOW.map(function(v) { return Math.round(v * f.out * 10) / 10; });
  const closing = [];
  let balance = 86.4;
  for (let i = 0; i < inflows.length; i++) {
    if (overrides && overrides[i] !== undefined) {
      const opening = i === 0 ? 86.4 : closing[i - 1];
      const target = overrides[i];
      outflows[i] = Math.round((inflows[i] - (target - opening)) * 10) / 10;
      balance = target;
    } else {
      balance = Math.round((balance + inflows[i] - outflows[i]) * 10) / 10;
    }
    closing.push(balance);
  }
  return { inflows: inflows, outflows: outflows, closing: closing };
}

function formatM(v) {
  return "¥" + v.toFixed(1) + "M";
}

function demoReply(question, scenario, tab) {
  const q = question.toLowerCase();
  const forecast = buildForecast(scenario);
  const endCash = forecast.closing[forecast.closing.length - 1];
  const minCash = Math.min.apply(null, forecast.closing);
  const minWeek = WEEKS[forecast.closing.indexOf(minCash)];
  const pess = buildForecast("pessimistic");
  const pMin = Math.min.apply(null, pess.closing);
  const pMinWeek = WEEKS[pess.closing.indexOf(pMin)];

  if (q.includes("w39") || q.includes("期末") || q.includes("closing")) {
    return "当前 " + scenario + " 情景下，W39 经营性期末现金约为 " + formatM(endCash) + "。期初 W27 为 ¥86.4M。";
  }
  if (q.includes("最低") || q.includes("低点")) {
    return "最低余额出现在 " + minWeek + "，约 " + formatM(minCash) + "。政策下限 ¥72M，" + (minCash >= 72 ? "未触及。" : "已低于政策下限。");
  }
  if (q.includes("悲观") || q.includes("预警")) {
    return "悲观情景最低约 " + formatM(pMin) + "（" + pMinWeek + "）。" + (pMin < 72 ? "将触发 ¥72M 预警规则。" : "未触发政策下限。");
  }
  if (q.includes("对账") || q.includes("差异") || q.includes("库存")) {
    return "本周匹配率 Demo 86%。库存预付款差额 ¥150K（Exception）；营销 accrual ¥980K（Timing）。可在对账页钻取。";
  }
  if (q.includes("工行") || q.includes("银企") || q.includes("sap") || q.includes("同步")) {
    return "工行每日 06:00 同步流水，SAP 每日 05:42 同步 FI 凭证，驱动 13 周经营性现金流滚动预测。";
  }
  return "（Demo）当前情景 " + scenario + "，W39 期末约 " + formatM(endCash) + "。当前页签：" + tab + "。";
}

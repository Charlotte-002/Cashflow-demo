# Songyu 财务预测 Demo

纯前端 HTML Demo：13 周经营性现金流、工行流水、SAP 联动、对账钻取、预警与智能问答（规则回复）。

## 本地打开

直接用浏览器打开 `index.html`，或通过本地静态服务：

```bash
cd songyu-cashflow-demo
python -m http.server 8080
```

访问 http://localhost:8080

## 功能

- Dashboard：情景切换、KPI、折线/柱状图；**折线图数据点可拖动**调整期末现金
- 13 周预测表格
- 工行对账单、SAP 凭证（演示数据）
- 对账异常钻取
- 预警规则与通知开关（Demo）
- 智能问答（关键词规则，无后端）
- 暗夜 / 日间模式（默认日间）

## 说明

- 所有数字为 **演示假数据**，无真实银行/SAP 对接
- 图表依赖 [Chart.js](https://www.chartjs.org/) CDN
- 状态保存在浏览器 `localStorage`

## GitHub Pages

将整个 `songyu-cashflow-demo` 文件夹推送到仓库后，在 Settings → Pages 选择该目录即可发布。

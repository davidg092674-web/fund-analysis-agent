export type Point = { date: string; nav: number; dividend?: string };
export type Dataset = { code: string; name: string; points: Point[]; fetchedAt: string; source: "eastmoney"; sourceUrl: string; availableAt?: Record<string,string> };
export type Position = { code: string; name?: string; shares: number | null; costNav: number | null; maxLoss: number | null; note: string; horizon: string };
export type ResearchReport = {
  code: string; name: string; createdAt: string; fetchedAt: string; navDate: string;
  source: string; sourceUrl: string; sampleCount: number; status: string;
  statusLabel: string; conclusion: string; summary: string; warnings: string[];
  latestNav: number; returns: Record<string, number | null>; ma20: number | null;
  ma60: number | null; drawdown: number | null; currentDrawdown: number | null;
  volatility: number | null; position: Position | null; pnl: number | null;
  marketValue: number | null; lossTriggered: boolean; points: Point[];
  demo?: boolean; actionEnabled: false; corporateActions: boolean;
};
export function fundCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new Error("请输入完整的六位基金代码，保留开头的 0。");
  return code;
}
export function assignedValue(source: string, variable: string): unknown {
  const match = new RegExp("(?:var|let|const)\\s+" + variable + "\\s*=\\s*").exec(source);
  if (!match) throw new Error("数据源缺少 " + variable + " 字段。");
  let pos = match.index + match[0].length;
  const first = source[pos], start = pos;
  if (first !== '"' && first !== "[") throw new Error("数据源格式无法安全解析。");
  let depth = 0, inString = false, escape = false;
  for (; pos < source.length; pos++) {
    const char = source[pos];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') { inString = false; if (first === '"') return JSON.parse(source.slice(start, pos + 1)); }
    } else if (char === '"') inString = true;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return JSON.parse(source.slice(start, pos + 1));
  }
  throw new Error("数据源内容不完整。");
}
export function parseEastmoney(source: string, code: string, now = new Date()): Dataset {
  fundCode(code);
  if (source.length > 6_000_000) throw new Error("数据源响应超出处理上限。");
  if (assignedValue(source, "fS_code") !== code) throw new Error("基金身份冲突：数据源代码与查询代码不一致。");
  const name = assignedValue(source, "fS_name");
  if (typeof name !== "string" || !name.trim() || name.length > 200) throw new Error("基金名称缺失或异常。");
  if (/货币|理财型/.test(name)) throw new Error("本阶段暂不支持货币基金；其万份收益不能按单位净值涨跌分析。");
  const raw = assignedValue(source, "Data_netWorthTrend");
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 30_000) throw new Error("缺少可分析的单位净值序列。");
  const points: Point[] = [];
  for (const row of raw) {
    if (!row || typeof row.x !== "number" || !Number.isFinite(row.x) || typeof row.y !== "number" || !Number.isFinite(row.y) || row.y <= 0) throw new Error("净值序列包含无效日期或数值，已暂停分析。");
    const date = new Date(row.x + 8 * 3600000).toISOString().slice(0, 10);
    if (points.length && date <= points[points.length - 1].date) throw new Error("净值日期重复或倒序，已暂停分析。");
    points.push({ date, nav: row.y, dividend: typeof row.unitMoney === "string" ? row.unitMoney.slice(0, 200) : "" });
  }
  return { code, name, points: points.slice(-261), fetchedAt: now.toISOString(), source: "eastmoney", sourceUrl: `https://fund.eastmoney.com/${code}.html` };
}
export function makeReport(data: Dataset, position: Position | null = null, now = new Date()): ResearchReport {
  const p = data.points, latest = p[p.length - 1], count = p.length;
  if (!latest || count < 2) throw new Error("历史净值样本不足。");
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const age = Math.round((Date.parse(today) - Date.parse(latest.date)) / 86400000);
  const corporateActions = p.some(v => !!v.dividend);
  const status = age < 0 || !Number.isFinite(age) ? "conflict" : age > 7 ? "stale" : count < 61 ? "insufficient" : "single_source";
  const statusLabel = { conflict: "日期异常", stale: "净值可能过期", insufficient: "样本不足", single_source: "单源待核验" }[status];
  const ret = (n: number) => count > n ? (latest.nav / p[count - 1 - n].nav - 1) * 100 : null;
  const mean = (n: number) => count >= n ? p.slice(-n).reduce((a, v) => a + v.nav, 0) / n : null;
  const recent = p.slice(-61);
  let peak = recent[0].nav, worst = 0;
  for (const v of recent) { peak = Math.max(peak, v.nav); worst = Math.min(worst, (v.nav / peak - 1) * 100); }
  const changes = recent.slice(1).map((v, i) => v.nav / recent[i].nav - 1);
  const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
  const vol = changes.length >= 20 ? Math.sqrt(changes.reduce((a, b) => a + (b - avg) ** 2, 0) / (changes.length - 1)) * Math.sqrt(252) * 100 : null;
  const r5 = ret(5), r20 = ret(20);
  const summary = r5 == null || r20 == null ? "历史样本不足，暂时无法对照短中期走势。" : r5 >= 0 && r20 >= 0 ? "近 5、20 个净值日的单位净值均上升，历史方向一致；继续观察新增正式净值与回撤变化。" : r5 < 0 && r20 < 0 ? "近 5、20 个净值日的单位净值均下降，历史方向偏弱；结合持仓成本与风险上限检查。" : "近 5 与 20 个净值日方向不一致，短中期走势分化，需要继续观察。";
  const warnings = ["净值由天天基金/东方财富第三方接口提供，尚未与基金公司公告完成独立双源核验。", "区间涨跌、均线及回撤以未复权单位净值计算；未计分红再投资、申赎费用和税费。", "年化波动率采用最近最多 60 个相邻净值日收益的样本标准差 × √252；不同产品及缺失日期会影响可比性。", "本阶段提供历史研究报告；Python 预测、回测、截图识别和精确申赎费用尚未迁入此云端版本。"];
  if (status === "stale") warnings.unshift(`最新净值距今日 ${age} 个自然日。7 天仅为通用滞后提示，节假日、QDII 和暂停披露需人工核实。`);
  if (status === "conflict") warnings.unshift("净值日期晚于当前中国标准时间日期，已暂停当日判断。");
  if (count < 61) warnings.unshift(`仅获得 ${count} 条净值，60 期指标不能完整计算。`);
  if (corporateActions) warnings.unshift("样本内存在分红或份额事件记录，未复权指标可能失真，应先核对复权收益。");
  if (/QDII|FOF|债/.test(data.name)) warnings.push("此产品可能有特殊净值披露周期或风险特征，不能套用普通股票型基金的交易时点。");
  const pnl = position?.costNav && position.costNav > 0 ? (latest.nav / position.costNav - 1) * 100 : null;
  return { code: data.code, name: data.name, createdAt: now.toISOString(), fetchedAt: data.fetchedAt, navDate: latest.date, source: "天天基金 / 东方财富", sourceUrl: data.sourceUrl, sampleCount: count, status, statusLabel, conclusion: status !== "single_source" ? "数据需复核，暂停当日判断" : "先核验数据，再评估持仓条件", summary, warnings, latestNav: latest.nav, returns: { "1": ret(1), "5": r5, "20": r20, "60": ret(60), "120": ret(120) }, ma20: mean(20), ma60: mean(60), drawdown: count >= 61 ? worst : null, currentDrawdown: (latest.nav / Math.max(...recent.map(v => v.nav)) - 1) * 100, volatility: vol, position, pnl, marketValue: position?.shares ? position.shares * latest.nav : null, lossTriggered: pnl !== null && !!position?.maxLoss && pnl <= -position.maxLoss, points: p, actionEnabled: false, corporateActions };
}
export function demoReport(): ResearchReport {
  const now = new Date();
  const points = Array.from({ length: 121 }, (_, i) => ({ date: new Date(now.getTime() - (120 - i) * 86400000).toISOString().slice(0, 10), nav: 1 + i * .0014 + Math.sin(i / 7) * .023 }));
  const r = makeReport({ code: "000000", name: "示例成长基金 · 虚构数据", points, fetchedAt: now.toISOString(), source: "eastmoney", sourceUrl: "" }, null, now);
  return { ...r, demo: true, source: "界面演示 · 本地合成序列", status: "demo", statusLabel: "虚构示例", warnings: ["本报告全部数值均为虚构合成数据，用于展示交互，不代表真实基金，也不会加入你的自选或持仓。", ...r.warnings.slice(1)] };
}

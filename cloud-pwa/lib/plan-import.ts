import type { Position } from "./research";

export type AllocationEntry = {
  code: string; name: string; horizon: string; category: string; note: string;
  buy_on_2026_10_26_cny: number; target_cny: number; later_cny: number;
  status: "planned_not_executed" | "watch_only";
};
export type AllocationPlan = {
  project: "FundLens"; intended_buy_date: string; currency: "CNY";
  capital_pool: number; monday_planned_cny: number; later_planned_cny: number;
  entries: AllocationEntry[];
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("配置文件应为 JSON 对象。");
  return value as Record<string, unknown>;
}
function textValue(value: unknown, key: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(key + " 缺失或超长。");
  return value.trim();
}
function amount(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000_000 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    throw new Error(key + " 必须是非负的人民币金额，最多两位小数。");
  }
  return value;
}
function cents(value: number) { return Math.round(value * 100); }
function sum(items: AllocationEntry[], key: "buy_on_2026_10_26_cny" | "target_cny" | "later_cny") {
  return items.reduce((n, item) => n + cents(item[key]), 0);
}
export function parseAllocationPlan(raw: unknown): AllocationPlan {
  const o = object(raw);
  if (o.project !== "FundLens" || o.currency !== "CNY") throw new Error("只能导入 FundLens 人民币配置计划。");
  const date = textValue(o.intended_buy_date, "计划买入日期", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) throw new Error("计划买入日期无效。");
  if (!Array.isArray(o.entries) || o.entries.length < 1 || o.entries.length > 25) throw new Error("基金数量必须为 1–25 只。");
  const seen = new Set<string>();
  const entries = o.entries.map((v, index): AllocationEntry => {
    const row = object(v); const code = textValue(row.code, "第" + (index + 1) + "只基金代码", 6);
    if (!/^\d{6}$/.test(code) || seen.has(code)) throw new Error("基金代码无效或重复：" + code);
    seen.add(code);
    const buy = amount(row.buy_on_2026_10_26_cny, code + " 首次买入"), target = amount(row.target_cny, code + " 目标"), later = amount(row.later_cny, code + " 后续追加");
    if (cents(buy) + cents(later) !== cents(target)) throw new Error(code + "：首次买入 + 后续追加不等于目标金额。");
    if (row.status !== "planned_not_executed" && row.status !== "watch_only") throw new Error(code + "：计划状态无效。");
    if (row.status === "watch_only" && (buy !== 0 || target !== 0 || later !== 0)) throw new Error(code + "：只观察的基金不得分配购买金额。");
    return {code, name:textValue(row.name,code+"名称"), horizon:textValue(row.horizon,code+"期限",100),
      category:textValue(row.category,code+"分类",100), note:typeof row.note==="string"?row.note.slice(0,400):"",
      buy_on_2026_10_26_cny:buy,target_cny:target,later_cny:later,status:row.status};
  });
  const capital_pool = amount(o.capital_pool, "资金池");
  const monday_planned_cny = amount(o.monday_planned_cny, "首次总金额");
  const later_planned_cny = amount(o.later_planned_cny, "后续总金额");
  if (sum(entries,"target_cny")!==cents(capital_pool) || sum(entries,"buy_on_2026_10_26_cny")!==cents(monday_planned_cny) || sum(entries,"later_cny")!==cents(later_planned_cny) || cents(monday_planned_cny)+cents(later_planned_cny)!==cents(capital_pool)) {
    throw new Error("基金金额汇总与计划总资金不一致，禁止导入。");
  }
  return {project:"FundLens",intended_buy_date:date,currency:"CNY",capital_pool,monday_planned_cny,later_planned_cny,entries};
}
const oldPlanLine = /(^|\n)【FundLens计划\d{4}-\d{2}-\d{2}】[^\n]*/g;
export function prepareAllocationImport(existing: Position[], plan: AllocationPlan): Position[] {
  const originals = new Map(existing.map(p=>[p.code,p]));
  if (originals.size + plan.entries.filter(p=>!originals.has(p.code)).length > 25) throw new Error("更新后将超过25只自选的云端限制；不会删除原有自选。");
  return plan.entries.map(p=>{
    const old = originals.get(p.code);
    const line = `【FundLens计划${plan.intended_buy_date}】拟买¥${p.buy_on_2026_10_26_cny}；目标¥${p.target_cny}；后续¥${p.later_cny}；${p.status==="watch_only"?"只观察不买":"尚未成交"}；${p.category}；${p.note}`;
    if (line.length>1000) throw new Error(p.code+"：计划备注超出长度限制。");
    const preserved = (old?.note||"").replace(oldPlanLine,"").trim();
    const trimmed = preserved.slice(0,Math.max(0,999-line.length));
    return {code:p.code,name:old?.name||p.name,shares:old?.shares??null,costNav:old?.costNav??null,
      maxLoss:old?.maxLoss??null,horizon:p.horizon,note:[trimmed,line].filter(Boolean).join("\n")};
  });
}
export function verifyAllocationImport(before: Position[], after: Position[], expected: Position[], plan: AllocationPlan) {
  const original = new Map(before.map(p=>[p.code,p]));
  const current = new Map(after.map(p=>[p.code,p]));
  return expected.map((p)=>{
    const old = original.get(p.code), now = current.get(p.code), entry = plan.entries.find(e=>e.code===p.code)!;
    const marker = `【FundLens计划${plan.intended_buy_date}】拟买¥${entry.buy_on_2026_10_26_cny}；目标¥${entry.target_cny}；后续¥${entry.later_cny}`;
    return {code:p.code, verified:!!now && now.note===p.note && now.note.includes(marker) && now.horizon===p.horizon &&
      (now.shares??null)===(old?.shares??null) && (now.costNav??null)===(old?.costNav??null) &&
      (now.maxLoss??null)===(old?.maxLoss??null)};
  });
}

import { env } from "cloudflare:workers";
import { type Dataset, type Position, fundCode, makeReport, parseEastmoney } from "./research";
export function database() {
  if (!env.DB) throw new Error("云端数据库暂时不可用，请稍后重试。");
  return env.DB;
}
async function boundedText(response: Response) {
  if (!response.ok || !response.body) throw new Error("数据源暂不可用（HTTP " + response.status + "），请稍后重试。");
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let bytes = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 6_000_000) throw new Error("数据源响应过大，已停止处理。"); parts.push(value); } }
  catch (e) { await reader.cancel(); throw e; }
  const all = new Uint8Array(bytes); let offset = 0;
  for (const p of parts) { all.set(p, offset); offset += p.length; }
  return new TextDecoder().decode(all);
}
export async function dataset(code: string, force = false): Promise<Dataset> {
  fundCode(code);
  const cache = await database().prepare("SELECT body, fetched_at FROM nav_cache WHERE code = ?").bind(code).first<{ body: string; fetched_at: string }>();
  const age = cache ? Date.now() - Date.parse(cache.fetched_at) : Infinity;
  if (cache && age < (force ? 60_000 : 6 * 3600000)) return JSON.parse(cache.body);
  let response: Response;
  try { response = await fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${new Date().toISOString().slice(0, 10)}`, { headers: { "Referer": "https://fund.eastmoney.com/", "Accept": "*/*" }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new Error("云端暂时无法连接基金净值源。不会使用虚构数据替代，请稍后重试。"); }
  const result = parseEastmoney(await boundedText(response), code);
  await database().prepare("INSERT INTO nav_cache(code, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET body=excluded.body, fetched_at=excluded.fetched_at").bind(code, JSON.stringify(result), result.fetchedAt).run();
  return result;
}
export async function readFunds(userId: string): Promise<Position[]> {
  const result = await database().prepare("SELECT body FROM funds WHERE user_id = ? ORDER BY updated_at DESC").bind(userId).all<{ body: string }>();
  return result.results.map(row => JSON.parse(row.body));
}
export async function generate(code: string, userId: string, force = false) {
  const position = (await readFunds(userId)).find(f => f.code === code) || null;
  const report = makeReport(await dataset(code, force), position);
  // Preserve the first snapshot for each NAV date; refresh never rewrites history.
  await database().prepare("INSERT INTO reports(id, user_id, code, nav_date, body, generated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(`${userId}:${code}:${report.navDate}`, userId, code, report.navDate, JSON.stringify(report), report.createdAt).run();
  return report;
}
export function cleanPosition(input: Record<string, unknown>): Position {
  const number = (key: string, max: number) => { const v = input[key]; if (v == null || v === "") return null; if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > max) throw new Error("持仓参数必须为范围内的正数。"); return v; };
  return { code: fundCode(input.code), name: typeof input.name === "string" ? input.name.slice(0, 200) : "", shares: number("shares", 1e10), costNav: number("costNav", 1e6), maxLoss: number("maxLoss", 100), note: String(input.note || "").slice(0, 1000), horizon: String(input.horizon || "未设定").slice(0, 100) };
}

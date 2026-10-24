import { handleDesk } from '../../../lib/desk-api';
import { handleCatalog } from '../../../lib/catalog-service';
import { database, cleanPosition, generate, readFunds, dataset } from "../../../lib/data-service";
import { fundCode, makeReport } from "../../../lib/research";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\//, ""), uid = request.headers.get("oai-authenticated-user-id");
  try {
    if (request.method !== "GET" && request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "请求来源不匹配。" }, 403);
    const catalogResponse = await handleCatalog(request, path, uid); if (catalogResponse) return catalogResponse;
    const deskResponse = await handleDesk(request, path, uid); if (deskResponse) return deskResponse;
    // Shared updater relies on the owner-private Sites dispatch service boundary.
    // Changing this Site's audience requires replacing this authorization first.
    if (path === "jobs/refresh" && request.method === "POST") {
      const rows = await database().prepare("SELECT user_id, body FROM funds ORDER BY updated_at DESC LIMIT 25").all<{ user_id: string; body: string }>();
      const results = [];
      for (const row of rows.results) { const f = JSON.parse(row.body); try { const r = await generate(f.code, row.user_id, true); results.push({ code: f.code, ok: true, navDate: r.navDate, status: r.status }); } catch (e) { results.push({ code: f.code, ok: false, error: e instanceof Error ? e.message : "刷新失败" }); } }
      const run = { generatedAt: new Date().toISOString(), results, scope: "owner-private watchlist", limit: 25 };
      await database().prepare("INSERT INTO refresh_runs(id, body, generated_at) VALUES (?, ?, ?)").bind(crypto.randomUUID(), JSON.stringify(run), run.generatedAt).run();
      return json(run);
    }
    if (path === "jobs/instructions" && request.method === "GET") return json({ revision: 1, purpose: "Refresh owner-private FundLens watchlist NAV reports", authorization: "Obtain current platform service access from get_site; do not persist or print the token. Owner-private audience must be preserved.", update: "POST /api/jobs/refresh with OAI-Sites-Authorization bearer service access; no visitor identity is needed. Server fetches Eastmoney historical unit NAV and stores per-user daily reports. No trades or paid APIs.", verify: "GET /api/jobs/status with the same platform service access and confirm generatedAt and per-fund results match. Source errors stay errors; no synthetic fallback. Empty watchlist is a valid no-op. Do not add sample funds.", retry: "Read status before retrying an uncertain refresh. Daily report snapshots are idempotent by user, code and NAV date." });
    if (path === "jobs/probe" && request.method === "GET") return json({ report: makeReport(await dataset(fundCode(new URL(request.url).searchParams.get("code")))) });
    if (path === "jobs/status" && request.method === "GET") { const r = await database().prepare("SELECT body FROM refresh_runs WHERE id NOT IN ('schedule_configuration','desk_schedule_configuration') ORDER BY generated_at DESC LIMIT 1").first<{ body: string }>(); return json(r ? JSON.parse(r.body) : null); }
    if (path === "jobs/schedule" && request.method === "POST") { const b = await limitedBody(request); if (typeof b.time !== "string" || b.time.length > 100 || typeof b.enabled !== "boolean") return json({ error: "任务配置格式不正确。" }, 400); await database().prepare("INSERT INTO refresh_runs(id, body, generated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body, generated_at=excluded.generated_at").bind("schedule_configuration", JSON.stringify({ time: b.time, enabled: b.enabled }), new Date().toISOString()).run(); return json({ ok: true }); }
    if (!uid) return json({ error: "请使用当前站点所有者的 ChatGPT 账户登录。" }, 401);
    if (path === "state" && request.method === "GET") {
      const funds = await readFunds(uid);
      const rows = await database().prepare("SELECT id, body FROM reports WHERE user_id = ? ORDER BY generated_at DESC LIMIT 100").bind(uid).all<{ id: string; body: string }>();
      const run = await database().prepare("SELECT body FROM refresh_runs WHERE id NOT IN ('schedule_configuration','desk_schedule_configuration') ORDER BY generated_at DESC LIMIT 1").first<{ body: string }>();
      const config = await database().prepare("SELECT body FROM refresh_runs WHERE id = 'schedule_configuration'").first<{body: string}>();
      return json({ schedule: config ? JSON.parse(config.body) : null, funds, reports: rows.results.map(r => ({ id: r.id, ...JSON.parse(r.body) })), lastRefresh: run ? JSON.parse(run.body) : null });
    }
    if (path === "funds" && request.method === "POST") {
      const p = cleanPosition(await limitedBody(request)), fs = await readFunds(uid);
      if (!fs.some(f => f.code === p.code) && fs.length >= 25) return json({ error: "第一阶段自选上限为 25 只，便于控制刷新开销。" }, 400);
      await database().prepare("INSERT INTO funds(id, user_id, code, body, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at").bind(`${uid}:${p.code}`, uid, p.code, JSON.stringify(p), new Date().toISOString()).run();
      return json({ ok: true });
    }
    if (path.startsWith("funds/") && request.method === "DELETE") { const code = fundCode(path.slice(6)); await database().prepare("DELETE FROM funds WHERE user_id = ? AND code = ?").bind(uid, code).run(); return json({ ok: true }); }
    if (path === "analyze" && request.method === "POST") { const body = await limitedBody(request); return json({ report: await generate(fundCode(body.code), uid, body.force === true) }); }
    if (path === "reports" && request.method === "DELETE") { const body = await limitedBody(request); if (typeof body.id !== "string") return json({ error: "缺少归档标识。" }, 400); await database().prepare("DELETE FROM reports WHERE id = ? AND user_id = ?").bind(body.id, uid).run(); return json({ ok: true }); }
    return json({ error: "接口不存在。" }, 404);
  } catch (e) { return json({ error: e instanceof Error ? e.message : "操作失败，请稍后重试。" }, 400); }
}
async function limitedBody(request: Request): Promise<Record<string, unknown>> { const body = await request.text(); if (body.length > 10_000) throw new Error("请求内容过大。"); const result = JSON.parse(body); if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("请求格式错误。"); return result; }
export const GET = handle;
export const POST = handle;
export const DELETE = handle;

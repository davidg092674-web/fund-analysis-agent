import { database, readFunds } from './data-service';
import { market, getMappings, saveMapping, getEvents, ingestEvents, getSnapshots, createSnapshot, reconcile, deskState, instructions, precloseJob, refreshEvening } from './desk-service';
import { fundCode } from './research';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
async function body(r:Request){const text=await r.text();if(text.length>100000)throw Error('请求内容过大');const d=JSON.parse(text);if(!d||typeof d!=='object'||Array.isArray(d))throw Error('请求格式不正确');return d;}
export async function handleDesk(r:Request,path:string,uid:string|null):Promise<Response|null>{
 if(path==='jobs/instructions'&&r.method==='GET')return json(instructions);
 if(path==='jobs/refresh'&&r.method==='POST')return json(await refreshEvening());
 if(path==='jobs/preclose'&&r.method==='POST')return json(await precloseJob((await body(r)).phase||'1430'));
 if(path==='jobs/market-probe'&&r.method==='GET')return json({market:await market(new URL(r.url).searchParams.get('symbol')||'sh000300',true)});
 if(path==='jobs/context'&&r.method==='GET'){
  const rows=await database().prepare('SELECT code,body FROM mappings ORDER BY updated_at DESC LIMIT 25').all<{code:string;body:string}>();const fs=await database().prepare('SELECT code FROM funds LIMIT 25').all<{code:string}>();return json({codes:fs.results.map(v=>v.code),mappings:rows.results.map(v=>{const m=JSON.parse(v.body);return {code:m.code,type:m.fundType,tags:m.tags,assets:m.assets.map((a:any)=>({symbol:a.symbol,label:a.label}))};}),primarySources:['pbc.gov.cn','csrc.gov.cn','stats.gov.cn','gov.cn','sse.com.cn','szse.cn','federalreserve.gov','bls.gov'],workflowRevision:instructions.revision});
 }
 if(path==='jobs/events'){
  if(r.method==='POST')return json(await ingestEvents((await body(r)).events));
  if(r.method==='GET'){const e=await getEvents();return json({count:e.length,events:e.map(v=>({id:v.id,title:v.title,publishedAt:v.publishedAt,firstSeenAt:v.firstSeenAt,sourceUrl:v.sourceUrl}))});}
 }
 if(path==='jobs/evaluations'&&r.method==='GET'){const rows=await database().prepare('SELECT body FROM evaluations ORDER BY updated_at DESC LIMIT 100').all<{body:string}>();const e=rows.results.map(v=>JSON.parse(v.body));return json({count:e.length,matched:e.filter(v=>v.errorBps!=null).length,pending:e.filter(v=>v.status==='待正式净值').length});}
 if(path==='jobs/desk-schedule'&&r.method==='POST'){const v=await body(r);if(typeof v.preclose!=='string'||v.preclose.length>200||typeof v.refresh1445!=='string'||v.refresh1445.length>200)throw Error('任务配置不正确');await database().prepare('INSERT INTO refresh_runs(id,body,generated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,generated_at=excluded.generated_at').bind('desk_schedule_configuration',JSON.stringify({preclose:v.preclose,refresh1445:v.refresh1445,evening:String(v.evening||'约22:30'),enabled:v.enabled===true}),new Date().toISOString()).run();return json({ok:true});}
 if(!['desk','mappings','intraday','market','reconcile','events'].includes(path))return null;
 if(!uid)return json({error:'请登录后使用私人研究工作台'},401);
 if(path==='desk'&&r.method==='GET')return json(await deskState(uid));
 if(path==='mappings'&&r.method==='POST')return json({mapping:await saveMapping(uid,await body(r))});
 if(path==='intraday'&&r.method==='POST'){const b=await body(r);return json({snapshot:await createSnapshot(uid,fundCode(b.code),b.phase||'manual')});}
 if(path==='market'&&r.method==='GET')return json({market:await market(new URL(r.url).searchParams.get('symbol')||'sh000300')});
 if(path==='reconcile'&&r.method==='POST'){const b=await body(r),code=fundCode(b.code);if(!(await readFunds(uid)).some(f=>f.code===code))return json({error:'基金不在你的自选中'},404);return json({evaluations:await reconcile(uid,code)});}
 if(path==='events'&&r.method==='POST')return json(await ingestEvents((await body(r)).events));
 return json({error:'接口或方法不支持'},405);
}

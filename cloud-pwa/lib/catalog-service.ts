import { database, dataset, boundedText } from './data-service';
import { fundCode, makeReport } from './research';
import { cleanCandidate, parseMoney, sortCandidates, summarize, type CatalogEntry, type Analysis } from './catalog';

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function body(r:Request){const s=await r.text();if(s.length>100000)throw Error('请求过大');const b=JSON.parse(s);if(!b||typeof b!=='object'||Array.isArray(b))throw Error('请求格式不正确');return b;}
export async function readCatalog():Promise<CatalogEntry[]>{const r=await database().prepare('SELECT body FROM research_list').all<{body:string}>();return sortCandidates(r.results.map(v=>JSON.parse(v.body)));}
export async function saveCandidates(input:unknown){
  if(!Array.isArray(input)||!input.length||input.length>25)throw Error('请提供1–25个研究条目');
  const entries=input.map(cleanCandidate);if(new Set(entries.map(v=>v.code)).size!==entries.length)throw Error('研究代码重复');
  const old=await readCatalog();if(new Set([...old.map(v=>v.code),...entries.map(v=>v.code)]).size>25)throw Error('研究清单上限25只');
  for(const entry of entries){const prior=old.find(v=>v.code===entry.code),sameKind=prior?.kind===entry.kind;
    const next:CatalogEntry={...entry,...(sameKind?{analysis:prior?.analysis,analyzedAt:prior?.analyzedAt,attemptedAt:prior?.attemptedAt,error:prior?.error}:{})};
    await database().prepare('INSERT INTO research_list(code,body,updated_at) VALUES (?,?,?) ON CONFLICT(code) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').bind(entry.code,JSON.stringify(next),new Date().toISOString()).run();
  }
  return {ok:true,count:entries.length,entries:(await readCatalog()).map(summarize)};
}
export async function analyzeCandidate(code:string,force=false):Promise<CatalogEntry>{
  fundCode(code);const entry=(await readCatalog()).find(v=>v.code===code);if(!entry)throw Error('基金不在期限研究清单');
  if(entry.analysis&&!force&&!entry.error&&Date.now()-Date.parse(entry.analyzedAt||'')<6*3600000)return entry;
  let analysis:Analysis;
  try {
    if(entry.kind==='money'){
      const r=await fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${new Date().toISOString().slice(0,10)}`,{headers:{Referer:'https://fund.eastmoney.com/'},signal:AbortSignal.timeout(15000)});
      analysis={kind:'money',report:parseMoney(await boundedText(r),code)};
    }else analysis={kind:'nav',report:makeReport(await dataset(code,force))};
    const next={...entry,analysis,analyzedAt:new Date().toISOString(),attemptedAt:new Date().toISOString(),error:undefined};
    await database().prepare('UPDATE research_list SET body=?,updated_at=? WHERE code=?').bind(JSON.stringify(next),next.analyzedAt,code).run();return next;
  } catch(e){const error=e instanceof Error?e.message:'分析失败';const next={...entry,attemptedAt:new Date().toISOString(),error};await database().prepare('UPDATE research_list SET body=?,updated_at=? WHERE code=?').bind(JSON.stringify(next),next.attemptedAt,code).run();throw Error(error);}
}
export async function refreshCatalog(){const entries=await readCatalog(),results:any[]=new Array(entries.length);let index=0;
  await Promise.all(Array.from({length:Math.min(3,entries.length)},async()=>{while(index<entries.length){const i=index++,e=entries[i];try{const value=await analyzeCandidate(e.code,true);results[i]={ok:true,...summarize(value)};}catch(err){results[i]={code:e.code,ok:false,error:err instanceof Error?err.message:'分析失败'};}}}));
  return results.map(v=>({code:v.code,ok:v.ok,dataDate:v.dataDate,analysisKind:v.analysisKind,statusLabel:v.statusLabel,error:v.error}));
}
export async function handleCatalog(r:Request,path:string,uid:string|null):Promise<Response|null>{
  // Shared research only; relies on this Site's verified owner-private dispatch.
  // Service callers never supply a visitor ID or create user-owned positions.
  if(path==='jobs/research-list'){
    if(r.method==='GET')return json({entries:(await readCatalog()).map(summarize)});
    if(r.method==='POST')return json(await saveCandidates((await body(r)).entries));
  }
  if(path==='jobs/research-list/analyze'&&r.method==='POST'){const b=await body(r);const value=await analyzeCandidate(fundCode(b.code),b.force===true);return json({ok:true,...summarize(value)});}
  if(path!=='research-list'&&!path.startsWith('research-list/'))return null;
  if(!uid)return json({error:'请登录后查看期限研究清单'},401);
  if(path==='research-list'&&r.method==='GET')return json({entries:(await readCatalog()).map(summarize)});
  if(path==='research-list/analyze'&&r.method==='POST'){const b=await body(r);return json({entry:await analyzeCandidate(fundCode(b.code),b.force===true)});}
  if(path.startsWith('research-list/')&&r.method==='GET'){const code=fundCode(path.slice('research-list/'.length)),entry=(await readCatalog()).find(v=>v.code===code);return entry?json({entry}):json({error:'研究条目不存在'},404);}
  return json({error:'不支持的研究清单操作'},405);
}

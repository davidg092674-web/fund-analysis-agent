// Exercise the actual route and data-service code against isolated SQLite and a
// controlled upstream fixture. No production account or holdings are touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const sqlite = new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));
const db = { prepare(sql) { let values=[]; return { bind(...a){values=a;return this;}, async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){sqlite.prepare(sql).run(...values);return {success:true};} }; } };
let upstreamCalls=0;
const context=vm.createContext({console,Request,Response,Headers,URL,Date,Error,TextDecoder,TextEncoder,Uint8Array,AbortSignal,crypto,fetch:async url=>{upstreamCalls++;const code=String(url).match(/(\d{6})\.js/)?.[1];const points=Array.from({length:121},(_,i)=>({x:Date.now()-(120-i)*86400000,y:1+i*.001,unitMoney:''}));return new Response(`var fS_name="测试基金";var fS_code="${code}";var Data_netWorthTrend=${JSON.stringify(points)};`);}});
const modules=new Map();
function mod(file){if(modules.has(file))return modules.get(file);if(file==='cloudflare:workers'){const m=new vm.SyntheticModule(['env'],function(){this.setExport('env',{DB:db});},{context});modules.set(file,m);return m;}const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const m=new vm.SourceTextModule(code,{context,identifier:file});modules.set(file,m);return m;}
const root=mod(path.resolve('app/api/[...path]/route.ts'));
await root.link((specifier,ref)=>mod(specifier==='cloudflare:workers'?specifier:path.resolve(path.dirname(ref.identifier),specifier.endsWith('.ts')?specifier:specifier+'.ts')));
await root.evaluate();
const handle=root.namespace;
async function call(route,method='GET',body,uid,origin){const headers={'Content-Type':'application/json'};if(uid)headers['oai-authenticated-user-id']=uid;if(origin)headers.Origin=origin;const request=new Request('https://test.example/api/'+route,{method,headers,body:body?JSON.stringify(body):undefined});const r=await handle[method](request);return {status:r.status,body:await r.json()};}
assert.equal((await call('state')).status,401);
const position={code:'000011',shares:100,costNav:2,maxLoss:10,note:'test fixture',horizon:'未设定'};
assert.equal((await call('funds','POST',position,'test-a','https://other.example')).status,403);
assert.equal((await call('funds','POST',position,'test-a')).status,200);
assert.equal((await call('state','GET',undefined,'test-a')).body.funds.length,1);
assert.equal((await call('state','GET',undefined,'test-b')).body.funds.length,0);
assert.equal((await call('funds/000011','DELETE',undefined,'test-b')).status,200);
assert.equal((await call('state','GET',undefined,'test-a')).body.funds.length,1);
assert.equal((await call('analyze','POST',{code:'12345'},'test-a')).status,400);
const a=await call('analyze','POST',{code:'000011'},'test-a');assert.equal(a.status,200);assert.ok(Math.abs(a.body.report.pnl+44)<1e-8);assert.equal(a.body.report.actionEnabled,false);
const b=await call('analyze','POST',{code:'000011'},'test-b');assert.equal(b.status,200);assert.equal(b.body.report.position,null);assert.equal(upstreamCalls,1);
await call('funds','POST',{...position,costNav:1},'test-a');
const updated=await call('analyze','POST',{code:'000011'},'test-a');assert.ok(Math.abs(updated.body.report.pnl-12)<1e-8);
const history=(await call('state','GET',undefined,'test-a')).body.reports;assert.equal(history.length,1);assert.ok(Math.abs(history[0].pnl+44)<1e-8);
await call('reports','DELETE',{id:history[0].id},'test-b');assert.equal((await call('state','GET',undefined,'test-a')).body.reports.length,1);
await call('funds/000011','DELETE',undefined,'test-a');assert.equal((await call('state','GET',undefined,'test-a')).body.funds.length,0);

assert.equal((await call('desk')).status,401);
assert.equal((await call('funds','POST',position,'test-a')).status,200);
const mapping={code:'000011',fundType:'index',basis:'proxy',sourceDate:'2026-10-20',publishedAt:'2026-10-20T00:00:00Z',sourceUrl:'https://www.csrc.gov.cn/',cashWeight:5,assets:[{symbol:'sh000300',label:'测试指数',weight:95,kind:'index'}],tags:['宽基'],plan:{action:'observe',units:null,feePct:null,confirmedAt:'',horizon:5,lots:[]}};
assert.equal((await call('mappings','POST',mapping,'test-a')).status,200);
assert.equal((await call('desk','GET',undefined,'test-a')).body.mappings.length,1);
assert.equal((await call('desk','GET',undefined,'test-b')).body.mappings.length,0);
assert.equal((await call('mappings','POST',mapping,'test-b')).status,400);
assert.equal((await call('mappings','POST',{...mapping,assets:[{...mapping.assets[0],weight:110}]},'test-a')).status,400);
const event={title:'单元测试事件',sourceUrl:'https://www.csrc.gov.cn/test?utm_source=a',publisher:'测试夹具',publishedAt:'2026-10-20T00:00:00Z',facts:'测试事实',interpretation:'测试解释',counterpoint:'测试不确定性',tags:['宏观'],fundCodes:[]};
assert.equal((await call('events','POST',{events:[event]},'test-a')).status,200);
assert.equal((await call('events','POST',{events:[{...event,sourceUrl:'https://www.csrc.gov.cn/test?utm_source=b'}]},'test-a')).status,200);
assert.equal((await call('desk','GET',undefined,'test-a')).body.events.length,1);
assert.equal((await call('events','POST',{events:[{...event,sourceUrl:'https://csrc.gov.cn.evil.example/test'}]},'test-a')).status,400);
assert.equal((await call('intraday','POST',{code:'000011'},'test-b')).status,400);
console.log('PASS: authentication, cross-origin writes, fund/report tenant isolation, cache separation, immutable daily snapshot, updated holdings, code validation.');

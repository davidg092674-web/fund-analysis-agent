import { fundCode, type Dataset, type Position } from './research.ts';
export type Asset = { symbol: string; label: string; weight: number; kind: 'stock'|'etf'|'index' };
export type Lot = { units: number; confirmedDate: string; feePct: number };
export type Mapping = { code: string; fundType: 'equity'|'index'|'mixed'|'bond'|'qdii'|'unknown'; basis: 'holdings'|'proxy'; sourceDate: string; publishedAt: string; sourceUrl: string; cashWeight: number; assets: Asset[]; tags: string[]; plan: { action: 'observe'|'buy'|'reduce'; units: number|null; feePct: number|null; confirmedAt: string; horizon: number; lots: Lot[] }; savedAt?: string };
export type Bar = { time: string; open: number; close: number; high: number; low: number; volume: number };
export type Market = { symbol: string; name: string; source: string; fetchedAt: string; previousClose: number|null; quote: { price: number; time: string; changePct: number }|null; minutes: Bar[]; daily: Bar[]; errors: string[] };
export type Event = { id: string; title: string; sourceUrl: string; publisher: string; publishedAt: string; firstSeenAt: string; facts: string; interpretation: string; counterpoint: string; tags: string[]; fundCodes: string[] };
export type Snapshot = { id: string; code: string; version: string; name: string; capturedAt: string; cutoffAt: string; businessDate: string; phase: string; session: boolean; eligible: boolean; warnings: string[]; mapping: Mapping|null; mappingKey: string; coverage: number; observedCoverage: number; contributionPct: number|null; estimatedNav: number|null; estimatedReturnPct: number|null; baselineNav: number; baselineDate: string; baselineAvailableAt: string; markets: Market[]; selectedPrices: {symbol:string;time:string;price:number;returnPct:number;weight:number}[]; events: Event[]; action: string; support: string[]; oppose: string[]; invalidation: string[]; position: Position|null; feePct: number|null; feeAmount: number|null; costCovered: 'unknown'; futureEdge: null; actionEnabled: false };
const numeric = (v: unknown, min: number, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw Error('数值超出允许范围'); return v; };
export const localTime = (date = new Date()) => new Date(date.getTime()+8*3600000).toISOString().slice(0,19);
export function marketSymbol(v: unknown) { if(typeof v!=='string'||! /^(sh|sz)\d{6}$/.test(v)) throw Error('行情代码应为 sh/sz 加六位数字，例如 sh510300；请核对交易所。'); return v; }
function dateOnly(v: unknown) { if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v).toISOString().slice(0,10)!==v) throw Error('日期格式应为 YYYY-MM-DD'); return v; }
function instant(v: unknown) { if(typeof v!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v))) throw Error('时间必须包含时区'); return new Date(v).toISOString(); }
export function cleanMapping(input: any, now = new Date()): Mapping {
  const assets = Array.isArray(input.assets) ? input.assets.map((a:any) => ({ symbol:marketSymbol(a.symbol),label:String(a.label||a.symbol).slice(0,100),weight:numeric(a.weight,0.01,100),kind:['stock','etf','index'].includes(a.kind)?a.kind:'index' })) : [];
  if(!assets.length||assets.length>10||new Set(assets.map((a:Asset)=>a.symbol)).size!==assets.length) throw Error('请配置 1–10 个互不重复的相关资产');
  const cashWeight=numeric(input.cashWeight??0,0,100);
  if(assets.reduce((s:number,a:Asset)=>s+a.weight,0)+cashWeight>100.00001)throw Error('资产权重与现金权重之和不能超过 100%，不会自动把前十大持仓放大成满仓。');
  if(!['equity','index','mixed','bond','qdii','unknown'].includes(input.fundType)||!['holdings','proxy'].includes(input.basis))throw Error('请选择基金类型和映射依据');
  const sourceDate=dateOnly(input.sourceDate), publishedAt=instant(input.publishedAt);
  if(sourceDate>localTime(now).slice(0,10)||Date.parse(publishedAt)>now.getTime())throw Error('映射依据不能来自未来');
  const sourceUrl=String(input.sourceUrl||'').slice(0,1200);if(sourceUrl&&!/^https:\/\//.test(sourceUrl))throw Error('来源链接须为 HTTPS');
  const p=input.plan||{},lots=(Array.isArray(p.lots)?p.lots:[]).map((l:any)=>({units:numeric(l.units,.000001,1e10),confirmedDate:dateOnly(l.confirmedDate),feePct:numeric(l.feePct,0,100)}));
  if(lots.length>20||lots.some((l:Lot)=>l.confirmedDate>localTime(now).slice(0,10)))throw Error('批次日期或数量异常');
  const confirmedAt=p.confirmedAt?instant(p.confirmedAt):'';if(confirmedAt&&Date.parse(confirmedAt)>now.getTime())throw Error('费用确认时间不能来自未来');
  return {code:fundCode(input.code),fundType:input.fundType,basis:input.basis,sourceDate,publishedAt,sourceUrl,cashWeight,assets,tags:(Array.isArray(input.tags)?input.tags:[]).slice(0,10).map((x:any)=>String(x).slice(0,40)),plan:{action:['observe','buy','reduce'].includes(p.action)?p.action:'observe',units:p.units==null||p.units===''?null:numeric(p.units,.000001,1e10),feePct:p.feePct==null||p.feePct===''?null:numeric(p.feePct,0,100),confirmedAt,horizon:[5,20].includes(p.horizon)?p.horizon:5,lots},savedAt:now.toISOString()};
}
const primaryDomains=['gov.cn','sse.com.cn','szse.cn','szse.com.cn','cninfo.com.cn','federalreserve.gov','bls.gov','bea.gov','ecb.europa.eu','efunds.com.cn','99fund.com','chinaamc.com'];
export function cleanEvent(input: any, now = new Date()): Omit<Event,'id'> {
  const u=new URL(String(input.sourceUrl));if(u.protocol!=='https:'||!primaryDomains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('事件需提供支持的一手来源：监管机构、统计机构、交易所或基金公司。');
  if(u.username||u.password)throw Error('来源链接不能含凭证');u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|spm|from$)/.test(k))u.searchParams.delete(k);u.searchParams.sort();
  const publishedAt=instant(input.publishedAt);if(Date.parse(publishedAt)>now.getTime())throw Error('事件发布时间不能来自未来');
  const text=(k:string,n:number)=>{const v=String(input[k]||'').trim();if(!v||v.length>n)throw Error('事件字段缺失或过长：'+k);return v;};
  return {title:text('title',240),sourceUrl:u.toString(),publisher:text('publisher',100),publishedAt,firstSeenAt:now.toISOString(),facts:text('facts',2500),interpretation:text('interpretation',1500),counterpoint:text('counterpoint',1500),tags:(Array.isArray(input.tags)?input.tags:[]).slice(0,15).map((x:any)=>String(x).slice(0,40)),fundCodes:(Array.isArray(input.fundCodes)?input.fundCodes:[]).slice(0,25).map(fundCode)};
}
export function parseTrends(raw:any,symbol:string,now=new Date()): Partial<Market> {
  const d=raw?.data;if(!d||String(d.code)!==symbol.slice(2)||!Array.isArray(d.trends))throw Error('分时行情代码不匹配或数据缺失');
  const bars:Bar[]=d.trends.map((line:string)=>{const a=line.split(',');if(!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(a[0]))throw Error('分时行情时间异常');return {time:a[0].replace(' ','T')+':00+08:00',open:numeric(Number(a[1]),1e-8,1e9),close:numeric(Number(a[2]),1e-8,1e9),high:numeric(Number(a[3]),1e-8,1e9),low:numeric(Number(a[4]),1e-8,1e9),volume:numeric(Number(a[5]),0,1e18)};});
  if(bars.some((b,i)=>b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||(i>0&&b.time<=bars[i-1].time)))throw Error('分时 OHLC 或顺序异常');
  return {name:String(d.name||symbol),previousClose:numeric(Number(d.preClose),1e-8,1e9),minutes:bars,source:'东方财富分时行情',fetchedAt:now.toISOString()};
}
export function parseDaily(raw:any,symbol:string): Bar[] {
  const d=raw?.data;if(!d||String(d.code)!==symbol.slice(2)||!Array.isArray(d.klines))throw Error('日 K 线代码不匹配或数据缺失');
  return d.klines.map((line:string)=>{const a=line.split(',');dateOnly(a[0]);const b={time:a[0],open:numeric(Number(a[1]),1e-8,1e9),close:numeric(Number(a[2]),1e-8,1e9),high:numeric(Number(a[3]),1e-8,1e9),low:numeric(Number(a[4]),1e-8,1e9),volume:numeric(Number(a[5]),0,1e18)};if(b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error('日 K OHLC异常');return b;}).slice(-61);
}
export function parseTencent(text:string,symbol:string): Market['quote'] {
  const match=text.match(new RegExp('v_'+symbol+'="([^"\\r\\n]+)"'));if(!match)throw Error('腾讯行情缺失');const f=match[1].split('~');
  if(f[2]!==symbol.slice(2)||!/^\d{14}$/.test(f[30]||''))throw Error('腾讯行情身份或时间异常');
  const t=f[30],time=`${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}T${t.slice(8,10)}:${t.slice(10,12)}:${t.slice(12,14)}+08:00`,price=numeric(Number(f[3]),1e-8,1e9),prev=numeric(Number(f[4]),1e-8,1e9);
  return {price,time,changePct:(price/prev-1)*100};
}
export function cutoff(now:Date, phase:string) {
  const local=localTime(now),date=local.slice(0,10),target=phase==='1430'?'14:30:00':phase==='1445'?'14:45:00':local.slice(11);
  const value=Date.parse(date+'T'+target+'+08:00');if(value>now.getTime())throw Error('该批次尚未到达生成时间，不能预写未来快照');return new Date(value).toISOString();
}
export function buildSnapshot(data:Dataset,mapping:Mapping|null,markets:Market[],events:Event[],position:Position|null,now=new Date(),phase='manual'):Snapshot {
  const cut=cutoff(now,phase),businessDate=localTime(now).slice(0,10),hm=localTime(now).slice(11,16),day=new Date(now.getTime()+8*3600000).getUTCDay();
  const session=day!==0&&day!==6&&hm>='09:30'&&hm<'15:00';
  const base=data.points.filter(p=>p.date<businessDate).at(-1)||data.points.at(-1)!;
  const warnings:string[]=[],selected:Snapshot['selectedPrices']=[];let total=0;
  if(!session)warnings.push('当前不在内地交易时段；这次是观察快照，不作为有效盘前预测样本。');
  if(!mapping)warnings.push('缺少资产映射，请先确认相关资产、权重及来源。');
  if(mapping&&Date.parse(mapping.savedAt||mapping.publishedAt)>Date.parse(cut))warnings.push('映射在本次截止时间之后才保存，不能用于回填该时点报告。');
  if(mapping&&Date.parse(mapping.publishedAt)>Date.parse(cut))warnings.push('映射依据在截止时点尚不可获得。');
  if(mapping&&!mapping.sourceUrl)warnings.push('映射尚未提供可追溯来源链接。');
  if(mapping&&['qdii','bond','unknown'].includes(mapping.fundType))warnings.push('该基金类型不适用当前人民币 A 股资产加权估值模型；显示相关行情，不生成基金收盘估值。');
  const sourceAge=mapping?(Date.parse(businessDate)-Date.parse(mapping.sourceDate))/86400000:0;
  if(mapping&&sourceAge>120)warnings.push('映射依据超过120个自然日，调仓偏差可能较大，暂停基金估值。');
  const navAge=(Date.parse(businessDate)-Date.parse(base.date))/86400000;
  const baselineAvailableAt=data.availableAt?.[base.date]||data.fetchedAt;
  if(Date.parse(baselineAvailableAt)>Date.parse(cut))warnings.push('该基准净值在本系统的首次可得时间晚于截止时点，不能回填盘前估值。');
  if(navAge>7||navAge<=0)warnings.push('基准正式净值缺失、超过7个自然日或日期异常，需核对产品披露日历。');
  for(const a of mapping?.assets||[]){
    const m=markets.find(v=>v.symbol===a.symbol);
    // A minute labelled HH:MM may still be forming. Only use complete earlier
    // minute labels, never a live quote received after the fixed cutoff.
    const bar=m?.minutes.filter(b=>Date.parse(b.time)<Date.parse(cut)&&b.time.slice(0,10)===businessDate).at(-1);
    const quote=m?.quote&&Date.parse(m.quote.time)<=Date.parse(cut)?m.quote:null;
    const chosen=bar?{price:bar.close,time:bar.time,ret:m?.previousClose?(bar.close/m.previousClose-1)*100:null}:quote?{price:quote.price,time:quote.time,ret:quote.changePct}:null;
    const age=chosen?(Date.parse(cut)-Date.parse(chosen.time))/60000:Infinity;
    if(!chosen||chosen.ret==null||age>6||age<0||chosen.time.slice(0,10)!==businessDate){warnings.push(a.symbol+' 缺少截止前6分钟内的有效同日行情；停牌、休市或延迟时不补造价格。');continue;}
    selected.push({symbol:a.symbol,time:chosen.time,price:chosen.price,returnPct:chosen.ret,weight:a.weight});total+=a.weight*chosen.ret/100;
  }
  const coverage=(mapping?.assets.reduce((s,a)=>s+a.weight,0)||0)+(mapping?.cashWeight||0),observedCoverage=selected.reduce((s,a)=>s+a.weight,0)+(mapping?.cashWeight||0);
  if(mapping&&coverage<80)warnings.push('配置覆盖率低于80%；只显示已覆盖资产的估计贡献，不外推整只基金。');
  if(mapping&&selected.length<mapping.assets.length)warnings.push('部分相关资产无可用行情，不能生成完整基金估值。');
  const eligible=Date.parse(baselineAvailableAt)<=Date.parse(cut)&&session&&!!mapping&&mapping.sourceUrl!==''&&sourceAge<=120&&navAge>0&&navAge<=7&&coverage>=80&&selected.length===mapping.assets.length&&!['qdii','bond','unknown'].includes(mapping.fundType)&&Date.parse(mapping.savedAt||mapping.publishedAt)<=Date.parse(cut)&&Date.parse(mapping.publishedAt)<=Date.parse(cut);
  if(mapping?.basis==='proxy')warnings.push('使用指数/ETF代理权重，属于情景估值，不能当作基金实际持仓。');
  if(mapping&&coverage<99.999)warnings.push(`未覆盖 ${(100-coverage).toFixed(1)}% 资产按变动为0近似；不会把已披露权重自动归一化。`);
  warnings.push('截止到收盘的资产价格暂按不变假设；这不是已验证的剩余时段价格预测。');
  warnings.push('估值未经历史误差校准，不展示虚构的置信区间或胜率；未来收益优势仍未知。');
  const related=events.filter(e=>Date.parse(e.publishedAt)<=Date.parse(cut)&&Date.parse(e.firstSeenAt)<=Date.parse(cut)&&(Date.parse(cut)-Date.parse(e.publishedAt))<=7*86400000&&(e.fundCodes.includes(data.code)||e.tags.some(t=>['宏观','全市场'].includes(t)||mapping?.tags.includes(t))));
  const estimate=eligible?base.nav*(1+total/100):null,pnl=estimate&&position?.costNav?(estimate/position.costNav-1)*100:null;
  const plan=mapping?.plan,feeKnown=!!plan?.confirmedAt&&Date.parse(plan.confirmedAt)<=Date.parse(cut),units=plan?.units;
  let feePct=feeKnown?plan?.feePct??null:null;
  if(feeKnown&&plan?.action==='reduce'&&plan.lots.length&&units){const sum=plan.lots.reduce((s,l)=>s+l.units,0);if(Math.abs(sum-units)<.00001)feePct=plan.lots.reduce((s,l)=>s+l.units*l.feePct,0)/sum;else {feePct=null;warnings.push('拟赎回批次份额之和与计划份额不同，费用情景不可用。');}}
  const feeAmount=estimate&&units&&feePct!=null?estimate*units*feePct/100:null;
  const support:string[]=[],oppose:string[]=[];
  if(selected.length)support.push(`已取得 ${selected.length} 个相关资产的截止前行情，权重贡献 ${total>=0?'+':''}${total.toFixed(2)} 个百分点。`);
  if(related.length)support.push(`有 ${related.length} 条在截止前已收录的相关事件；事实与影响解释分开保存。`);
  if(pnl!=null&&position?.maxLoss&&pnl<=-position.maxLoss)support.push('按盘中情景估值计算的成本变动达到你设置的亏损观察阈值。');
  oppose.push('尚未证明从本次成交之后存在样本外收益优势；今日涨跌不能替代后续收益判断。');
  if(feePct==null)oppose.push('申赎费用或拟交易批次尚未确认，不能判断潜在收益是否覆盖成本。');else oppose.push(`手动确认的单边费用情景为 ${feePct.toFixed(3)}%；未来优势需要先超过相应成本，当前无法证明。`);
  for(const a of mapping?.assets||[]){const history=markets.find(m=>m.symbol===a.symbol)?.daily.filter(b=>b.time<businessDate)||[];if(history.length<21)continue;const last=history.at(-1)!,r5=(last.close/history.at(-6)!.close-1)*100,r20=(last.close/history.at(-21)!.close-1)*100,ma=history.slice(-20).reduce((sum,b)=>sum+b.close,0)/20;const fact=`${a.label||a.symbol} 截至${last.time}的未复权日K：近5期${r5>=0?'+':''}${r5.toFixed(2)}%、20期${r20>=0?'+':''}${r20.toFixed(2)}%，收盘相对20期均线${last.close>=ma?'上方':'下方'}；只描述历史。`;if(r5>0&&r20>0&&last.close>=ma)support.push(fact);else oppose.push(fact);}
  if(plan?.action==='reduce'&&units&&position?.shares&&units>position.shares)oppose.push('拟减仓份额超过已录入持仓，计划数量需要复核。');
  if(!position?.costNav||!position?.shares)oppose.push('缺少完整持仓成本或份额，无法形成个人仓位调整判断。');
  const action=!eligible?'证据不足，暂停操作倾向':pnl!=null&&position?.maxLoss&&pnl<=-position.maxLoss?'评估减仓条件，先核对费用与期限':plan?.action==='buy'?'申购候选观察，未来优势待验证':'保持观察，暂无充分证据改变仓位';
  const frozenMarkets=markets.map(m=>({...m,quote:m.quote&&Date.parse(m.quote.time)<=Date.parse(cut)?m.quote:null,minutes:m.minutes.filter(b=>Date.parse(b.time)<Date.parse(cut)),daily:m.daily.filter(b=>b.time<businessDate)}));
  const key=mapping?JSON.stringify({basis:mapping.basis,sourceDate:mapping.sourceDate,assets:mapping.assets,cash:mapping.cashWeight}):'unmapped';
  return {id:data.code+':'+now.toISOString()+':'+phase,version:'intraday-v1',code:data.code,name:data.name,capturedAt:now.toISOString(),cutoffAt:cut,businessDate,phase,session,eligible,warnings,mapping,mappingKey:key,coverage,observedCoverage,contributionPct:selected.length?total:null,estimatedNav:estimate,estimatedReturnPct:eligible?total:null,baselineNav:base.nav,baselineDate:base.date,baselineAvailableAt,markets:frozenMarkets,selectedPrices:selected,events:related,action,support,oppose,invalidation:['有新的正式净值、基金调仓或分红消息','相关资产行情过期、停牌或身份/时区不一致','持仓、计划、费率或投资目标发生改变'],position,feePct,feeAmount,costCovered:'unknown',futureEdge:null,actionEnabled:false};
}
export function evaluateSnapshot(s:Snapshot,data:Dataset,now=new Date()) {
  const actual=data.points.find(p=>p.date===s.businessDate),base={snapshotId:s.id,code:s.code,version:s.version,phase:s.phase,mappingKey:s.mappingKey,updatedAt:now.toISOString(),sampleEligible:s.eligible&&s.estimatedNav!=null,actualNav:actual?.nav??null,errorBps:null as number|null,baselineErrorBps:null as number|null,directionCorrect:null as boolean|null,feeComparison:null as number|null,comparisonLabel:'尚未到达观察期限或计划/费用缺失',status:'待正式净值'};
  if(!base.sampleEligible)return {...base,status:'非有效估值样本'};
  if(!actual)return base;
  base.errorBps=(s.estimatedNav!/actual.nav-1)*10000;base.baselineErrorBps=(s.baselineNav/actual.nav-1)*10000;base.directionCorrect=Math.sign(s.estimatedNav!-s.baselineNav)===Math.sign(actual.nav-s.baselineNav);base.status='已对照正式净值';
  const plan=s.mapping?.plan, future=data.points.filter(p=>p.date>s.businessDate);const end=plan?future[plan.horizon-1]:null;
  if(end&&data.points.some(p=>p.date>=s.businessDate&&p.date<=end.date&&!!p.dividend)){base.comparisonLabel='观察期存在分红或份额事件，尚无复权与现金流口径，暂停扣费收益对照。';return base;}
  if(end&&plan?.units&&s.feePct!=null&&plan.action!=='observe'){
    if(plan.action==='reduce'&&s.position?.shares&&plan.units<=s.position.shares){base.feeComparison=plan.units*(actual.nav-end.nav)-plan.units*actual.nav*s.feePct/100;base.comparisonLabel=`计划减仓份额持有现金 vs 继续持有，${plan.horizon}个后续净值日；费用为快照中的手动费率，现金收益假设0。`;}
    if(plan.action==='buy'){base.feeComparison=plan.units*(end.nav-actual.nav)-plan.units*actual.nav*s.feePct/100;base.comparisonLabel=`计划新增份额 vs 保留现金，${plan.horizon}个后续净值日；费用为快照中的手动费率，现金收益假设0。`;}
  }
  return base;
}

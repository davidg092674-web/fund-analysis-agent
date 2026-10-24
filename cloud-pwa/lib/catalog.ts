import { assignedValue, fundCode, type ResearchReport } from './research.ts';

export type Candidate = {
  code: string; name: string; kind: 'money'|'cd'|'bond'|'equity'|'gold'|'qdii';
  minMonths: number; holdingLabel: string; order: number; rationale: string;
  caution: string; relationship: string; sourceUrl: string; recommendedAt: string;
  state: 'candidate'|'alternative'|'wait';
};
export type MoneyPoint = {date:string;incomePer10k:number;sevenDayAnnualized:number};
export type MoneyStudy = {code:string;name:string;asOf:string;fetchedAt:string;source:string;sourceUrl:string;status:string;statusLabel:string;points:MoneyPoint[];warnings:string[];actionEnabled:false};
export type Analysis = {kind:'nav';report:ResearchReport}|{kind:'money';report:MoneyStudy};
export type CatalogEntry = Candidate & {analysis?:Analysis;analyzedAt?:string;attemptedAt?:string;error?:string};
export type CatalogSummary = Omit<CatalogEntry,'analysis'> & {analysisKind?:Analysis['kind'];dataDate?:string;statusLabel?:string;sampleCount?:number};
export function sortCandidates<T extends Candidate>(entries:T[]):T[]{return [...entries].sort((a,b)=>a.minMonths-b.minMonths||a.order-b.order||a.code.localeCompare(b.code));}
export function cleanCandidate(input:unknown):Candidate {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('研究条目格式不正确');
  const v=input as Record<string,unknown>,code=fundCode(v.code);
  const str=(key:string,max:number,required=true)=>{const s=typeof v[key]==='string'?(v[key] as string).trim():'';if((required&&!s)||s.length>max)throw Error('研究字段不正确：'+key);return s;};
  if(!['money','cd','bond','equity','gold','qdii'].includes(String(v.kind)))throw Error('基金类别不正确');
  if(typeof v.minMonths!=='number'||!Number.isFinite(v.minMonths)||v.minMonths<0||v.minMonths>600)throw Error('建议期限不正确');
  if(typeof v.order!=='number'||!Number.isInteger(v.order)||v.order<0||v.order>1000)throw Error('排序不正确');
  if(!['candidate','alternative','wait'].includes(String(v.state)))throw Error('研究状态不正确');
  const sourceUrl=str('sourceUrl',1200),u=new URL(sourceUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error('来源必须为HTTPS链接');
  const recommendedAt=str('recommendedAt',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(recommendedAt)||!Number.isFinite(Date.parse(recommendedAt)))throw Error('建议日期不正确');
  return {code,name:str('name',200),kind:v.kind as Candidate['kind'],minMonths:v.minMonths,holdingLabel:str('holdingLabel',100),order:v.order,rationale:str('rationale',800),caution:str('caution',800),relationship:str('relationship',200,false),sourceUrl,recommendedAt,state:v.state as Candidate['state']};
}
export function summarize(entry:CatalogEntry):CatalogSummary {
  const {analysis,...rest}=entry;
  return {...rest,...(analysis?{analysisKind:analysis.kind,dataDate:analysis.kind==='nav'?analysis.report.navDate:analysis.report.asOf,statusLabel:analysis.report.statusLabel,sampleCount:analysis.kind==='nav'?analysis.report.sampleCount:analysis.report.points.length}:{})};
}
export function parseMoney(source:string,code:string,now=new Date()):MoneyStudy {
  fundCode(code);if(source.length>6_000_000)throw Error('货币基金响应超出处理上限');
  if(assignedValue(source,'fS_code')!==code)throw Error('基金身份冲突');
  const name=assignedValue(source,'fS_name');if(typeof name!=='string'||!name.trim()||name.length>200||!/货币/.test(name))throw Error('数据源不是可识别的货币基金');
  const rows=(key:string)=>{const value=assignedValue(source,key);if(!Array.isArray(value)||value.length<1||value.length>30000)throw Error('缺少有效货币基金序列');const result=new Map<string,number>();let previous='';for(const row of value){if(!Array.isArray(row)||row.length<2||typeof row[0]!=='number'||!Number.isFinite(row[0])||typeof row[1]!=='number'||!Number.isFinite(row[1]))throw Error('货币基金序列含无效值');const d=new Date(row[0]+8*3600000);if(!Number.isFinite(d.getTime()))throw Error('货币基金日期无效');const day=d.toISOString().slice(0,10);if(previous&&day<=previous)throw Error('货币基金日期重复或倒序');previous=day;result.set(day,row[1]);}return result;};
  const income=rows('Data_millionCopiesIncome'),annual=rows('Data_sevenDaysYearIncome');
  const incomeDay=[...income.keys()].at(-1),annualDay=[...annual.keys()].at(-1);
  if(incomeDay!==annualDay)throw Error('万份收益与七日年化最新日期不一致，暂停合并分析');
  const points=[...income].filter(([date])=>annual.has(date)).map(([date,incomePer10k])=>({date,incomePer10k,sevenDayAnnualized:annual.get(date)!})).slice(-120);
  if(!points.length)throw Error('货币基金指标没有可匹配的披露日期');
  const asOf=points.at(-1)!.date,today=new Date(now.getTime()+8*3600000).toISOString().slice(0,10),age=(Date.parse(today)-Date.parse(asOf))/86400000;
  const status=age<0?'conflict':age>7?'stale':'single_source';
  return {code,name,asOf,fetchedAt:now.toISOString(),source:'天天基金 / 东方财富',sourceUrl:`https://fund.eastmoney.com/${code}.html`,status,statusLabel:status==='conflict'?'日期异常':status==='stale'?'披露可能过期':'单源待核验',points,actionEnabled:false,warnings:['货币基金使用来源披露的万份收益和七日年化，不将它们拼成单位净值或股票K线。','七日年化是历史收益的年化展示，不是未来固定利率或收益承诺；货币基金也不保本。','未与基金公司逐日完成独立双源核验；赎回到账、限额与快速赎回资格以销售渠道为准。',...(status!=='single_source'?['披露日期异常或滞后，请先复核最新数据。']:[])]};
}

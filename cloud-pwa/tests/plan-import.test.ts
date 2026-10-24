import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAllocationPlan,prepareAllocationImport,verifyAllocationImport} from '../lib/plan-import.ts';
import type {Position} from '../lib/research.ts';
const entry=(code:string,buy:number,later:number,status:'planned_not_executed'|'watch_only'='planned_not_executed')=>({
 code,name:'测试基金'+code,category:'测试类',horizon:'至少5年',note:'测试备注',
 buy_on_2026_10_26_cny:buy,target_cny:buy+later,later_cny:later,status
});
const raw=()=>({project:'FundLens',currency:'CNY',intended_buy_date:'2026-10-26',capital_pool:1000,monday_planned_cny:400,later_planned_cny:600,entries:[entry('000011',400,600),entry('000012',0,0,'watch_only')]});
test('validates codes, watch-only zeros, money arithmetic and aggregate sum',()=>{
 assert.equal(parseAllocationPlan(raw()).entries.length,2);
 assert.throws(()=>parseAllocationPlan({...raw(),capital_pool:999}),/汇总/);
 assert.throws(()=>parseAllocationPlan({...raw(),entries:[entry('000011',400,600),entry('000011',0,0,'watch_only')]}),/重复/);
 assert.throws(()=>parseAllocationPlan({...raw(),entries:[entry('000011',400,600),entry('000012',1,0,'watch_only')]}),/只观察/);
 assert.throws(()=>parseAllocationPlan({...raw(),entries:[entry('000011',400,599),entry('000012',0,0,'watch_only')]}),/汇总/);
});
test('preserves actual shares, cost NAV and loss limit; does not invent positions',()=>{
 const plan=parseAllocationPlan(raw());
 const before:Position[]=[{code:'000011',name:'历史基金名',shares:123.5,costNav:2.1,maxLoss:18,horizon:'旧期限',note:'原始记录'}];
 const up=prepareAllocationImport(before,plan);
 assert.equal(up.length,2);
 assert.equal(up[0].shares,123.5);assert.equal(up[0].costNav,2.1);assert.equal(up[0].maxLoss,18);
 assert.ok(up[0].note.includes('原始记录'));assert.ok(up[0].note.includes('拟买¥400'));
 assert.equal(up[1].shares,null);assert.equal(up[1].costNav,null);
 assert.deepEqual(verifyAllocationImport(before,up,up,plan).map(x=>x.verified),[true,true]);
});
test('repeat import replaces old plan exactly once and does not duplicate remarks',()=>{
 const plan=parseAllocationPlan(raw());
 const before=prepareAllocationImport([],plan);
 const twice=prepareAllocationImport(before,plan);
 assert.deepEqual(twice,before);
 assert.equal(twice[0].note.match(/【FundLens计划/g)?.length,1);
});
test('detects altered live data on readback',()=>{
 const plan=parseAllocationPlan(raw()),before:Position[]=[];
 const expected=prepareAllocationImport(before,plan);
 const after=[{...expected[0],shares:123},expected[1]];
 assert.deepEqual(verifyAllocationImport(before,after,expected,plan).map(x=>x.verified),[false,true]);
});
test('refuses to add beyond watchlist limit, preserving originals',()=>{
 const plan=parseAllocationPlan(raw()),prior=Array.from({length:24},(_,i):Position=>({
  code:String(100000+i),name:'之前自选',shares:null,costNav:null,maxLoss:null,note:'',horizon:'未设定'
 }));
 assert.throws(()=>prepareAllocationImport(prior,plan),/25只/);
});

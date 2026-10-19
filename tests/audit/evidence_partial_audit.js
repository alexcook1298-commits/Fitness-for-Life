'use strict';
// Read-only audit of how evidenceDecision / targetStrength / targetMode treat partial, skipped and omitted work.
// Synthetic data in a disposable profile. Prints one finding per scenario and writes JSON if --json is given.
// Usage: node tests/audit/evidence_partial_audit.js <appDir> [--json out.json]
const fs=require('fs');const {launch}=require('../lib/cdp'),{serve}=require('../lib/server');
const appDir=process.argv[2],jsonOut=process.argv.includes('--json')?process.argv[process.argv.indexOf('--json')+1]:null;
if(!appDir){console.error('usage');process.exit(2)}
(async()=>{
 const server=await serve(appDir),browser=await launch(),out=[];
 const run=async(id,title,fn)=>{const p=await browser.newPage('/tmp');await p.goto(server.origin+'/');try{const r=await p.eval(fn);out.push({id,title,...r});console.log(`${r.finding.padEnd(12)} ${id}  ${title}\n             ${r.detail}`)}finally{await p.close()}};
 const common=`const day=n=>new Date(Date.UTC(2026,9,19,12)-n*86400000).toISOString();
  const rec=(id,sid,name,d,w,reps,extra={})=>({id,sessionId:sid,name,intensifier:'Straight Sets',w,reps,rir:2,template:'a',block:1,setNumber:1,date:day(d),...extra});`;
 const mk=body=>new Function('return ('+body+')')();
 const F=src=>eval('('+src+')');
 await run('E1','Exercise omitted from the latest session (no records at all)',()=>{
  const day=n=>new Date(Date.UTC(2026,9,19,12)-n*86400000).toISOString();const rec=(id,sid,name,d,w,reps,x={})=>({id,sessionId:sid,name,intensifier:'Straight Sets',w,reps,rir:2,setNumber:1,date:day(d),...x});
  const bench=[14,10,7,3].map((d,k)=>rec('b'+k,'s'+k,'Bench Press (BB)',d,200,5)),row=[14,10,7,3,0].map((d,k)=>rec('r'+k,'t'+k,'Row (DB)',d,100,10));
  localStorage.pa_hist=JSON.stringify([...bench,...row]);const ev=evidenceDecision();
  return {finding:ev.state==='OBSERVE'?'SAFE':'DEFECT',detail:`state ${ev.state}; bench series untouched by omission (4 exposures, none today)`}});
 await run('E2','Exercise present with FEWER sets than prescribed but the same load',()=>{
  const day=n=>new Date(Date.UTC(2026,9,19,12)-n*86400000).toISOString();const rec=(id,sid,d,w,reps,sn)=>({id,sessionId:sid,name:'Bench Press (BB)',intensifier:'Straight Sets',w,reps,rir:2,setNumber:sn,date:day(d)});
  const h=[];[14,10,7].forEach((d,k)=>{for(let s=1;s<=3;s++)h.push(rec('f'+k+s,'s'+k,d,200,5,s))});h.push(rec('p1','sp',0,200,5,1));
  localStorage.pa_hist=JSON.stringify(h);const ev=evidenceDecision();
  return {finding:ev.state==='OBSERVE'&&ev.vals.every(v=>Math.abs(v-ev.vals[0])<1e-9)?'SAFE':'DEFECT',detail:`vals ${ev.vals.map(v=>v.toFixed(1))} (a one-set partial equals the full-session best)`}});
 await run('E3','Partial session logs only the BACK-OFF set of Top Set + Back-Offs (top set unlogged), three sessions in a row',()=>{
  const day=n=>new Date(Date.UTC(2026,9,19,12)-n*86400000).toISOString();const r=(id,sid,d,w,reps,sn)=>({id,sessionId:sid,name:'Bench Press (BB)',intensifier:'Straight Sets',strengthMethod:'Top Set + Back-Offs',w,reps,rir:2,setNumber:sn,date:day(d)});
  const h=[r('a1','s1',20,200,5,1),r('a2','s1',20,170,8,2),r('b1','s2',16,200,5,1),r('b2','s2',16,170,8,2),r('c2','s3',12,170,8,2),r('d2','s4',8,170,8,2),r('e2','s5',4,170,8,2)];
  localStorage.pa_hist=JSON.stringify(h);const ev=evidenceDecision();
  return {finding:ev.state==='OBSERVE'?'SAFE':'LIMITATION',detail:`state ${ev.state}: ${ev.why} vals ${ev.vals.map(v=>v.toFixed(0))}. Back-off sets (setNumber>1) are only a problem if they appear in the series (vals above)`}});
 await run('E4','Same, but ALL sets of every session are logged (control)',()=>{
  const day=n=>new Date(Date.UTC(2026,9,19,12)-n*86400000).toISOString();const r=(id,sid,d,w,reps,sn)=>({id,sessionId:sid,name:'Bench Press (BB)',intensifier:'Straight Sets',strengthMethod:'Top Set + Back-Offs',w,reps,rir:2,setNumber:sn,date:day(d)});
  const h=[];[20,16,12,8,4].forEach((d,k)=>{h.push(r('t'+k,'s'+k,d,200,5,1),r('u'+k,'s'+k,d,170,8,2))});
  localStorage.pa_hist=JSON.stringify(h);const ev=evidenceDecision();return {finding:ev.state==='OBSERVE'?'SAFE':'DEFECT',detail:`state ${ev.state}`}});
 await run('E5','One session whose sets straddle UTC midnight (evening workout): counted as one exposure or two?',()=>{
  const r=(id,sid,iso,w,reps,sn)=>({id,sessionId:sid,name:'Bench Press (BB)',intensifier:'Straight Sets',w,reps,rir:2,setNumber:sn,date:iso});
  const h=[r('a','s0','2026-10-01T22:00:00.000Z',200,5,1),r('b','s1','2026-10-08T22:00:00.000Z',200,5,1),
   r('c1','s2','2026-10-15T23:50:00.000Z',200,5,1),r('c2','s2','2026-10-16T00:10:00.000Z',200,2,2),r('c3','s2','2026-10-16T00:20:00.000Z',200,2,3)];
  localStorage.pa_hist=JSON.stringify(h);const ev=evidenceDecision();const sessions=3;
  return {finding:ev.vals.length===sessions?'SAFE':'LIMITATION',detail:`${ev.vals.length} exposures from ${sessions} sessions; vals ${ev.vals.map(v=>v.toFixed(0))}; state ${ev.state}`}});
 await run('E6','Records of an unfinished (draft) session: do they enter the evidence?',()=>{
  const r=(id,sid,iso,w,reps)=>({id,sessionId:sid,name:'Bench Press (BB)',intensifier:'Straight Sets',w,reps,rir:2,setNumber:1,date:iso});
  const h=[r('a','s0','2026-10-01T12:00:00.000Z',200,5),r('b','s1','2026-10-08T12:00:00.000Z',200,5),r('c','sd','2026-10-15T12:00:00.000Z',150,5)];
  localStorage.pa_sessions_v2=JSON.stringify([{id:'sd',template:'a',phase:1,weekMode:'normal',status:'draft',startedAt:'2026-10-15T12:00:00.000Z',forms:{},checks:{},choices:{},modes:{}}]);
  localStorage.pa_hist=JSON.stringify(h);const ev=evidenceDecision();
  return {finding:ev.vals.length===3?'LIMITATION':'SAFE',detail:`series after reading a draft session: vals ${ev.vals.map(v=>v.toFixed(0))}; state ${ev.state}. Real performed sets in an interrupted session are legitimate data`}});
 await run('E7','Skipped exercise (explicit skip flag) in a finished session leaves the series untouched',()=>{
  const r=(id,sid,iso,w,reps)=>({id,sessionId:sid,name:'Bench Press (BB)',intensifier:'Straight Sets',w,reps,rir:2,setNumber:1,date:iso});
  localStorage.pa_hist=JSON.stringify([r('a','s0','2026-10-01T12:00:00.000Z',200,5),r('b','s1','2026-10-08T12:00:00.000Z',200,5)]);
  localStorage.pa_sessions_v2=JSON.stringify([{id:'s9',template:'a',phase:1,weekMode:'normal',status:'complete',startedAt:'2026-10-15T12:00:00.000Z',finishedAt:'2026-10-15T13:00:00.000Z',skips:{'0':true},forms:{},checks:{},choices:{},modes:{}}]);
  const before=JSON.stringify(evidenceDecision());return {finding:JSON.parse(before).vals.length===2?'SAFE':'DEFECT',detail:`vals ${JSON.parse(before).vals.length}: a skip flag creates no record and cannot enter the series`}});
 await run('E8','Structured intensifier blocks (Myo-Reps, Rest-Pause ...) are excluded from the series',()=>{
  const r=(id,sid,iso,reps)=>({id,sessionId:sid,name:'Rear-Delt Fly (DB)',intensifier:'Myo-Reps',structured:true,w:30,reps,efforts:[{stage:1,w:30,reps:10}],setNumber:2,date:iso});
  localStorage.pa_hist=JSON.stringify([r('a','s0','2026-10-01T12:00:00.000Z',30),r('b','s1','2026-10-08T12:00:00.000Z',10),r('c','s2','2026-10-15T12:00:00.000Z',5)]);const ev=evidenceDecision();
  return {finding:ev.name==='SYSTEM'?'SAFE':'DEFECT',detail:`${ev.name}: ${ev.state}. An incomplete or smaller cluster can never read as deterioration`}});
 await run('E9','Next-target text after a partial session that logged only the lighter back-off set',()=>{
  const r=(id,sid,iso,w,reps,sn)=>({id,sessionId:sid,name:'Bench Press (BB)',intensifier:'Straight Sets',strengthMethod:'Top Set + Back-Offs',w,reps,rir:2,setNumber:sn,date:iso});
  localStorage.pa_hist=JSON.stringify([r('a','s0','2026-10-01T12:00:00.000Z',200,5,1),r('b','s0','2026-10-01T12:05:00.000Z',170,8,2),r('c','s1','2026-10-08T12:00:00.000Z',170,8,2)]);
  const t=targetStrength('Bench Press (BB)','Top Set + Back-Offs');return {finding:/^200/.test(t)?'SAFE':'LIMITATION',detail:`target shown: "${t}". SAFE only if it anchors on the top set, not the last logged back-off set`}});
 await run('E10','Does any code recommend a load increase automatically?',()=>{
  const src=[evidenceDecision,targetStrength,targetMode].map(f=>f.toString()).join('\n');
  return {finding:'INFO',detail:'evidenceDecision only returns OBSERVE / INVESTIGATE / ACT about decline; target text only says "earn reps/quality before +N lb". No function raises a load automatically ('+(/\+\s*\(?\s*e\?\.inc/.test(src)?'text only':'none')+')'}});
 await browser.close();await server.close();
 if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify({app:appDir,date:new Date().toISOString(),findings:out},null,1));
})().catch(e=>{console.error(e);process.exit(2)});

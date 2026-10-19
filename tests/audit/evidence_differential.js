'use strict';
// Differential check of the Phase 4 evidence changes against the Phase 3 candidate on seeded pseudo-random histories (synthetic only).
//  A. histories where none of the four defect conditions occurs (all sessions finished, every session within one UTC day, top set >= back-offs,
//     no lighter final set): Phase 3 and Phase 4 MUST return identical decisions, and identical NEXT targets for the exercises that have no back-offs. Any difference fails the check.
//  B. histories that contain the defect conditions: reports what changed (not asserted; each change is a deliberate correction).
// usage: node tests/audit/evidence_differential.js <phase3AppDir> <phase4AppDir> [--n 200] [--json out]
const fs=require('fs');const {launch}=require('../lib/cdp'),{serve}=require('../lib/server');
const a=process.argv.slice(2);const [d3,d4]=a.filter(x=>!x.startsWith('--')&&!/^\d+$/.test(x)&&a[a.indexOf(x)-1]!=='--json');
const N=+(a.includes('--n')?a[a.indexOf('--n')+1]:200),jsonOut=a.includes('--json')?a[a.indexOf('--json')+1]:null;
let seed=20261019;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const ri=(lo,hi)=>lo+Math.floor(rnd()*(hi-lo+1));
const EX=[['Bench Press (BB)','Primer + Paused Top/Back-Offs',200],['Squat (BB)','Top Set + Back-Offs',250],['Row (DB)','Straight Heavy Sets',90],['Lat Pulldown',null,120]];
function history(withDefects){
 const rows=[],sessions=[];const nS=ri(2,9);const sess=[];
 for(let k=0;k<nS;k++){const daysAgo=60-k*ri(3,9);const id='s'+k;const noon=new Date(Date.now()-daysAgo*86400000);noon.setUTCHours(12,0,0,0);
  const status=withDefects&&k===nS-1&&rnd()<.5?'draft':'complete';sessions.push({id,template:'a',status,startedAt:noon.toISOString()});
  for(const [name,method,base] of EX){if(rnd()<.25)continue;const drift=1+(rnd()-.5)*.12*(withDefects?2:1);const top=Math.round(base*drift);const sets=ri(1,4),reps=ri(4,10);const backOnly=withDefects&&method&&rnd()<.35;
   for(let j=1;j<=sets;j++){const isBack=method&&/Back-Offs/.test(method)&&j>1;if(backOnly&&!isBack)continue;const w=isBack?Math.round(top*.85):(method?top:(withDefects?Math.round(top*(1-.02*(j-1))):top));
    let t=noon.getTime()+j*60000;if(withDefects&&rnd()<.15)t=new Date(noon).setUTCHours(23,50+j,0,0);
    rows.push({id:id+'|'+name+'|'+j,sessionId:id,name,intensifier:'Straight Sets',strengthMethod:method,template:'a',block:1,setNumber:j,w,reps,rir:2,date:new Date(t).toISOString()})}}}
 return {rows,sessions};
}
(async()=>{
 const browser=await launch();const out={n:N,A:{identical:0,different:[]},B:{decisionChanged:0,targetChanged:0,total:0,transitions:{},raised:[]}};
 const probe=async(dir,cases)=>{const s=await serve(dir),p=await browser.newPage('/tmp');try{await p.goto(s.origin+'/');return await p.eval(cs=>cs.map(c=>{localStorage.pa_hist=JSON.stringify(c.rows);localStorage.pa_sessions_v2=JSON.stringify(c.sessions);const e=evidenceDecision();return {name:e.name,state:e.state,vals:(e.vals||[]).map(v=>Math.round(v*100)/100),t:[['Bench Press (BB)','Primer + Paused Top/Back-Offs'],['Squat (BB)','Top Set + Back-Offs'],['Row (DB)','Straight Heavy Sets']].map(([n,m])=>targetStrength(n,m)),m:targetMode('Lat Pulldown','Straight Sets')}}),cases)}finally{await p.close();await s.close()}};
 const A=Array.from({length:N},()=>history(false)),B=Array.from({length:N},()=>history(true));
 const [a3,a4,b3,b4]=[await probe(d3,A),await probe(d4,A),await probe(d3,B),await probe(d4,B)];
 const cmp=r=>JSON.stringify([r.name,r.state,r.vals,r.t[2],r.m]);
 a3.forEach((r,i)=>{if(cmp(r)===cmp(a4[i]))out.A.identical++;else out.A.different.push({i,p3:r,p4:a4[i]})});
 const causes=c=>{const dr=new Set(c.sessions.filter(x=>x.status==='draft').map(x=>x.id));const out=[];if(c.rows.some(x=>dr.has(x.sessionId)))out.push('draft');
  if(c.rows.some(x=>x.setNumber>1&&/Back-Offs/.test(x.strengthMethod||'')&&!c.rows.some(y=>y.sessionId===x.sessionId&&y.name===x.name&&y.setNumber===1)))out.push('back-off-only');
  if(c.rows.some(x=>!x.date.includes('T12:')&&x.date.slice(11,13)==='23'||x.date.slice(11,13)==='00'))out.push('straddle');return out};
 b3.forEach((r,i)=>{out.B.total++;const x=b4[i];if(JSON.stringify([r.name,r.state,r.vals])!==JSON.stringify([x.name,x.state,x.vals])){out.B.decisionChanged++;const k=r.state+'->'+x.state;out.B.transitions[k]=(out.B.transitions[k]||0)+1;const rank={OBSERVE:0,INVESTIGATE:1,ACT:2};if(rank[x.state]>rank[r.state])out.B.raised.push({i,from:r.state,to:x.state,causes:causes(B[i]),p3:{name:r.name,vals:r.vals},p4:{name:x.name,vals:x.vals}})}
  if(JSON.stringify(r.t)!==JSON.stringify(x.t)||r.m!==x.m)out.B.targetChanged++});
 console.log(`A (no defect conditions): ${out.A.identical}/${N} identical (decision, Row target, Lat Pulldown target)${out.A.different.length?'  DIFFERENT: '+out.A.different.length:''}`);
 console.log(`B (defect conditions present, ${out.B.total} histories): decision changed in ${out.B.decisionChanged}; NEXT text changed in ${out.B.targetChanged}; decision changes by state ${JSON.stringify(out.B.transitions)}; severity RAISED in ${out.B.raised.length}`);out.B.raised.forEach(r=>console.log('   raised',r.from,'->',r.to,JSON.stringify(r.causes),'P3',r.p3.name,JSON.stringify(r.p3.vals),'P4',r.p4.name,JSON.stringify(r.p4.vals)));
 if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify(out,null,1));await browser.close();process.exitCode=out.A.different.length?1:0;
})().catch(e=>{console.error(e);process.exit(2)});

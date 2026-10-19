'use strict';
// Design-verification probe (read-only). Loads an app directory in headless Chrome and asks the app's OWN validateBackup
// whether a session carrying the proposed additive TCS fields would survive a backup import. No app file is modified.
// Usage: node design/time-constrained-session/probes/compat_probe.js <appDir> [out.json]
const fs=require('fs'),path=require('path');
const {launch}=require('../../../tests/lib/cdp');
const {serve}=require('../../../tests/lib/server');
(async()=>{
 const dir=process.argv[2],out=process.argv[3];
 const srv=await serve(dir),browser=await launch();
 try{
  const p=await browser.newPage(require('os').tmpdir());await p.goto(srv.origin+'/');
  const res=await p.eval(()=>{
   const base=()=>({id:'s-1',template:'b',phase:1,weekMode:'normal',status:'draft',startedAt:new Date().toISOString(),forms:{},checks:{},choices:{},modes:{},clusters:{}});
   const tcs={v:1,availableMin:25,budgetMin:22.5,estMin:21.2,estRangeMin:[18,24],timing:'default',policy:'breadth',safetyMode:null,
    items:[{slot:0,label:'Incline Press',exercise:'Incline Press (DB)',status:'reduced',fullSets:2,plannedSets:1,changes:['sets 2->1','no loaded stretch']},{slot:2,label:'Hip Hinge',status:'omitted',fullSets:2,plannedSets:0}],
    warmup:['Raise Temperature'],cooldown:['Downshift Breathing'],revisions:[]};
   const rotation={v:1,group:0,slots:[3,4],methods:{3:'Myo-Reps',4:'DC Rest-Pause'},basis:'ledger'};
   const mk=(sessions,extra={})=>({format:'project-america-full-backup',version:1,appVersion:'2.3',createdAt:new Date().toISOString(),data:{pa_sessions_v2:JSON.stringify(sessions),...extra}});
   const tryIt=(name,obj)=>{try{validateBackup(obj);return {name,accepted:true}}catch(e){return {name,accepted:false,error:String(e.message||e)}}};
   const r=[];
   r.push(tryIt('control: plain session',mk([base()])));
   r.push(tryIt('session with additive tcs + rotation fields',mk([{...base(),tcs,rotation}])));
   r.push(tryIt('complete session with additive fields',mk([{...base(),status:'complete',finishedAt:new Date().toISOString(),tcs,rotation}])));
   r.push(tryIt('session status "completed" (not an app-written value)',mk([{...base(),status:'completed'}])));
   r.push(tryIt('new top-level key pa_tcs_v1',mk([base()],{pa_tcs_v1:'{}'})));
   r.push(tryIt('tcs string containing a control character',mk([{...base(),tcs:{...tcs,warmup:['bad\u0001']}}])));
   r.push(tryIt('tcs string over 2000 characters',mk([{...base(),tcs:{...tcs,warmup:['x'.repeat(2500)]}}])));
   return r;
  });
  console.log(JSON.stringify(res,null,1));
  if(out)fs.writeFileSync(out,JSON.stringify({appDir:dir,results:res},null,1));
 }finally{await browser.close();await srv.close()}
})().catch(e=>{console.error(e);process.exit(1)});

#!/usr/bin/env node
'use strict';
// Generates a SYNTHETIC full backup for real-device trials, by driving the app itself in a disposable headless-Chrome profile.
// The result contains: a partial Giant A (one exercise performed, the rest not reached), a Giant A with an explicit skip,
// a full Giant B with performed Myo-Reps + DC Rest-Pause, a cardio record with tag-like text ("<Z2>"), and an UNFINISHED Giant A draft.
// It never reads a real backup and contains no personal data. Usage: node make_disposable_backup.js [--app dir] [--out file]
const fs=require('fs'),os=require('os'),path=require('path');
const {launch}=require('../../tests/lib/cdp'),{serve}=require('../../tests/lib/server');
const args=process.argv.slice(2),opt=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
const appDir=path.resolve(opt('--app')||path.join(__dirname,'..','app')),out=path.resolve(opt('--out')||path.join(__dirname,'dist','DISPOSABLE_TEST_BACKUP.json'));

async function make(appDir,out){
 const server=await serve(appDir),browser=await launch();const dl=fs.mkdtempSync(path.join(os.tmpdir(),'pa-seed-'));
 try{
  const p=await browser.newPage(dl);await p.goto(server.origin+'/');
  const day=n=>new Date(Date.now()-n*86400000).toISOString();
  const logStraight=(i,j,w,r)=>p.eval((i,j,w,r)=>{const n=selected(active,i),mode='Straight Sets',key=formKey(i,j,mode,'');const put=(f,v)=>{document.querySelector(`#exs input[data-save="${key}${f}"]`).value=v};put('w',w);put('r',r);put('rir','2');logSet(null,i,j)},i,j,w,r);
  const finish=()=>p.eval(()=>{openFinish();finishSession()});
  const straightAll=k=>p.eval(k=>{start(k);(slots[k]||[]).forEach((x,i)=>{currentSession.modes[i+':'+selected(k,i)]='Straight Sets'});render()},k);
  // 1. partial Giant A: only the first exercise performed
  await straightAll('a');const n1=await p.eval(()=>slots.a.map((x,i)=>workSetCount(i)));
  for(let j=1;j<=n1[0];j++)await logStraight(0,j,'95',String(10));
  await finish();
  // 2. Giant A with the second exercise explicitly skipped and the first performed
  await straightAll('a');await logStraight(0,1,'100','10');await p.eval(()=>document.querySelector('#exs button[data-skip="1"]').click());await finish();
  // 3. full Giant B: perform every presented intensifier
  await p.eval(()=>start('b'));
  const shown=await p.eval(()=>[3,4,1,5,0,6].filter(i=>todayInt(i,selected('b',i))!=='Straight Sets'));
  for(const i of shown)await p.eval(i=>{const n=selected(active,i),j=workSetCount(i),mode=setMode(i,j,n),key=formKey(i,j,mode,''),labels=methodStages(mode),put=(k,v)=>{document.querySelector(`#exs input[data-save="${k}"]`).value=v};
   if(labels){const need=mode==='Myo-Reps'?2:labels.length;for(let k=0;k<need;k++){put(key+'w'+k,'40');put(key+'r'+k,'12')}saveCluster(i,j)}else{put(key+'w','80');put(key+'r','10');put(key+'rir','1');logSet(null,i,j)}},i);
  await finish();
  // 4. cardio record whose text only resembles a tag
  await p.eval(d=>{const h=JSON.parse(localStorage.pa_cardio_hist||'[]');h.push({id:'seed1|Outdoor|conditioning',sessionId:'seed1',date:d,machine:'Outdoor',mode:'conditioning',data:{pace:'easy <Z2> 30 min',hr:'140'}});localStorage.pa_cardio_hist=JSON.stringify(h)},day(2));
  // 5. an unfinished Giant A (interrupted workout) with one set logged
  await straightAll('a');await logStraight(0,1,'97.5','8');
  const payload=await p.eval(()=>{const b=backupPayload();validateBackup(b);return b});
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(payload,null,2));
  const s=JSON.parse(payload.data.pa_sessions_v2);
  return {out,keys:Object.keys(payload.data),sessions:s.map(x=>({template:x.template,status:x.status,prescription:x.completion?.prescription,rotation:x.rotation?.group,skips:x.skips?Object.keys(x.skips):undefined}))};
 }finally{await browser.close();await server.close();fs.rmSync(dl,{recursive:true,force:true})}
}
if(require.main===module)make(appDir,out).then(r=>console.log(JSON.stringify(r,null,1)),e=>{console.error(e);process.exit(1)});
module.exports={make};

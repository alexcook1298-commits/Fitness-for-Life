'use strict';
// Does a backup written by the Phase 2 app (sessions carrying the additive `completion` field) validate in earlier shipped
// versions, and does a backup in the earlier shape validate here? Read-only probe of each tree's own validateBackup.
// usage: node integration/scripts/compat_completion_probe.js <current app dir> <label=dir> [<label=dir> ...]
const {launch}=require('../../tests/lib/cdp'),{serve}=require('../../tests/lib/server');
(async()=>{
 const [cur,...others]=process.argv.slice(2);const browser=await launch(),out={};
 const run=async(dir,fn,...a)=>{const s=await serve(dir),p=await browser.newPage('/tmp');await p.goto(s.origin+'/');try{return await fn(p,...a)}finally{await p.close();await s.close()}};
 const payload=await run(cur,async p=>p.eval(()=>{
  weekMode='normal';start('a');currentSession.modes['3:'+selected('a',3)]='Straight Sets';render();
  const n=selected('a',3),key=formKey(3,1,setMode(3,1,n),'');
  for(const [f,v] of [['w','95'],['r','10'],['rir','2']])document.querySelector(`#exs input[data-save="${key}${f}"]`).value=v;
  logSet(null,3,1);openFinish();finishSession();return backupPayload()}));
 const hasCompletion=JSON.parse(payload.data.pa_sessions_v2).every(s=>s.completion&&s.completion.prescription==='partial');
 out.payloadHasCompletion=hasCompletion;out.versions={};
 for(const a of others){const [label,dir]=a.split('=');out.versions[label]=await run(dir,(p,b)=>p.eval(b=>{try{validateBackup(b);return 'accepted'}catch(e){return 'rejected: '+e.message}},b),payload)}
 const legacy=JSON.parse(JSON.stringify(payload));legacy.data.pa_sessions_v2=JSON.stringify(JSON.parse(legacy.data.pa_sessions_v2).map(({completion,...s})=>s));
 out.legacyShapeInPhase2=await run(cur,(p,b)=>p.eval(b=>{try{validateBackup(b);return 'accepted'}catch(e){return 'rejected: '+e.message}},b),legacy);
 console.log(JSON.stringify(out,null,1));await browser.close();
})().catch(e=>{console.error(e);process.exit(2)});

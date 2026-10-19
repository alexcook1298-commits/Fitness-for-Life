'use strict';
// Phase 3 variant of audit/scripts/effective_prescription.js (which is unchanged). The original forces the Giant B cycle by overriding
// completedTemplateCount, which the Phase 3 rotation no longer reads; this one forces it the way real use does: by seeding `cycle` finished
// Giant B sessions into history. It works unchanged on the original baseline and on the candidate.
// Read-only: computes what the app ACTUALLY prescribes (defaults) for every template slot, with synthetic empty storage.
// Usage: node integration/scripts/effective_prescription_by_history.js <appDir> <out.json>
const fs=require('fs');
const {launch}=require('../../tests/lib/cdp.js'),{serve}=require('../../tests/lib/server.js');
const [appDir,out]=process.argv.slice(2);
(async()=>{const s=await serve(appDir),b=await launch();const p=await b.newPage('/tmp');await p.goto(s.origin+'/');
const res=await p.eval(()=>{
 const rows=[];const keys=Object.keys(slots);
 for(const k of keys){
  for(const cycle of (k==='b'?[0,1,2]:[0])){
   sessions=Array.from({length:cycle},(_,n)=>({id:'seed'+n,template:'b',status:'complete',startedAt:new Date(Date.UTC(2026,0,1+n)).toISOString(),finishedAt:new Date(Date.UTC(2026,0,1+n,1)).toISOString()}));
   currentSession=null;start(k);
   slots[k].forEach((sl,i)=>{
    const n=selected(k,i),e=getEx(n),se=strengthEligible(k,i);
    const sets=workSetCount(i);
    const finalMode=setMode(i,sets,n);
    rows.push({tpl:k,cycle,i,slot:sl[0],defaultEx:n,muscle:e.muscle,equip:e.equip,type:e.type,restSec:e.rest,sets:sl[2],reps:sl[3],rir:sl[4],
      strengthEligible:se,strengthMethod:se?todayStrength(i,n):null,intensifierFinalSet:finalMode,
      intensifierRest:IP[finalMode]?.rest??null,activator:!!activatorFor(sl),loadedStretch:!!loadedFor(n,e)});
   });
  }
 }
 return rows});
fs.writeFileSync(out,JSON.stringify(res,null,1));console.log('rows',res.length);await b.close();await s.close()})();

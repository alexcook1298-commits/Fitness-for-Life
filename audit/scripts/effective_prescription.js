'use strict';
// Read-only: computes what the app ACTUALLY prescribes (defaults) for every template slot, with synthetic empty storage.
// Usage: node audit/scripts/effective_prescription.js <appDir> <out.json>
const fs=require('fs');
const {launch}=require('../../tests/lib/cdp.js'),{serve}=require('../../tests/lib/server.js');
const [appDir,out]=process.argv.slice(2);
(async()=>{const s=await serve(appDir),b=await launch();const p=await b.newPage('/tmp');await p.goto(s.origin+'/');
const res=await p.eval(()=>{
 const rows=[];const keys=Object.keys(slots);
 for(const k of keys){
  for(const cycle of (k==='b'?[0,1,2]:[0])){
   completedTemplateCount=()=>cycle;
   start(k);
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

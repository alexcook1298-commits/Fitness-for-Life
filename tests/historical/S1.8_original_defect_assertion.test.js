'use strict';
// Original reliability test S1.8 (PR #3), kept as historical evidence. It asserts the DEFECTIVE baseline behaviour.
// Usage: node tests/historical/S1.8_original_defect_assertion.test.js <appDir>
// Exit 0 = the substring-classification defect is PRESENT in <appDir>; exit 1 = it is absent (fixed).
const assert=require('assert'),os=require('os');
const {launch}=require('../lib/cdp'),{serve}=require('../lib/server');
const appDir=process.argv[2];if(!appDir){console.error('Usage: node tests/historical/S1.8_original_defect_assertion.test.js <appDir>');process.exit(2)}
const D=daysAgo=>new Date(Date.now()-daysAgo*86400000).toISOString();
const sess=(id,template)=>({id,template,phase:1,weekMode:'normal',status:'complete',startedAt:D(1.05),finishedAt:D(1)});
(async()=>{const s=await serve(appDir),b=await launch();const p=await b.newPage(os.tmpdir());await p.goto(s.origin+'/');
 let ok=true,msg='defect present: mobility counted as Hypertrophy and athletic counted as Strength';
 try{await p.eval(r=>{localStorage.setItem('pa_sessions_v2',JSON.stringify(r))},[sess('m','mobility'),sess('t','athletic')]);
  const bud=await p.eval(()=>budgetData());
  assert.strictEqual(bud.Hypertrophy,1,'mobility counted as Hypertrophy (known)');assert.strictEqual(bud.Strength,1,'athletic counted as Strength (known)')}
 catch(e){ok=false;msg='defect absent (fixed): '+e.message.split('\n')[0]}
 console.log((ok?'DEFECT PRESENT  ':'DEFECT ABSENT   ')+appDir+' — '+msg);await b.close();await s.close();process.exitCode=ok?0:1})();

'use strict';
// Read-only follow-up probes (compact mode, week mode, evidence-engine false positives, progression text). Synthetic data only.
// Usage: node audit/scripts/behavior_probes2.js <appDir> <out.json>
const fs=require('fs');
const {launch}=require('../../tests/lib/cdp.js'),{serve}=require('../../tests/lib/server.js');
const [appDir,outFile]=process.argv.slice(2);
const out={};const log=(k,v)=>{out[k]=v;console.log(k,JSON.stringify(v).slice(0,700))};
(async()=>{const s=await serve(appDir),b=await launch();
const page=async()=>{const p=await b.newPage('/tmp');await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.goto(s.origin+'/');return p};
try{
 {const p=await page();
  const r=await p.eval(()=>{const res={};
   for(const m of ['busy','normal','extra']){localStorage.removeItem('pa_sessions_v2');sessions=[];currentSession=null;setWeekMode(m);start('a');res['A_'+m]=slots.a.map((s,i)=>workSetCount(i)).join(',');localStorage.removeItem('pa_sessions_v2');sessions=[];currentSession=null;start('bl');res['BL_'+m]=slots.bl.map((s,i)=>workSetCount(i)).join(',')}
   return res});
  log('Q1_weekmode_set_counts',r);await p.close()}
 {const p=await page();
  const r=await p.eval(()=>{const res={};
   for(const [k,cyc] of [['b',0],['b',1],['bu',0],['bl',0]]){localStorage.removeItem('pa_sessions_v2');sessions=[];currentSession=null;completedTemplateCount=()=>cyc;start(k);
    const rowsFull=slots[k].map((sl,i)=>({slot:sl[0],mode:setMode(i,workSetCount(i),selected(k,i))}));
    toggleCompact();const rowsCompact=slots[k].map((sl,i)=>({slot:sl[0],kept:compactSlot(k,i),sets:workSetCount(i),mode:setMode(i,workSetCount(i),selected(k,i))})).filter(x=>x.kept);
    res[k+'#'+cyc]={full:rowsFull.map(x=>x.slot+':'+x.mode).join(' | '),compact:rowsCompact.map(x=>x.slot+':'+x.sets+'sets:'+x.mode).join(' | '),compactIntensifierCount:rowsCompact.filter(x=>x.mode!=='Straight Sets').length}}
   return res});
  log('Q2_compact_keeps_intensifiers',r);await p.close()}
 {const p=await page();
  const r=await p.eval(()=>{const day=n=>new Date(Date.now()-n*86400000).toISOString();const mk=(arr)=>arr.map(([n,w,reps,iv,d])=>({name:n,w,reps,rir:1,intensifier:iv,date:day(d)}));
   const set=a=>{localStorage.setItem('pa_hist',JSON.stringify(mk(a)))};
   set([['Leg Press',300,8,'Straight Sets',21],['Leg Press',300,8,'Straight Sets',14],['Leg Press',300,8,'Straight Sets',7],['Leg Press',200,20,'Widowmaker',0]]);
   const a=evidenceDecision();
   set([['Seated Leg Curl',100,10,'Straight Sets',21],['Seated Leg Curl',105,10,'Straight Sets',14],['Seated Leg Curl',110,9,'Straight Sets',7],['Seated Leg Curl',90,10,'Straight Sets',0]]);
   const c=evidenceDecision();
   set([['Bench Press (BB)',200,6,'Straight Sets',21],['Bench Press (BB)',205,6,'Straight Sets',14],['Bench Press (BB)',210,6,'Straight Sets',7],['Bench Press (BB)',150,12,'Straight Sets',0]]);
   const d=evidenceDecision();
   return {steady8rep300_then_one_widowmaker_200x20:{state:a.state,name:a.name,deltaPct:+(a.delta*100).toFixed(1),vals:a.vals.map(Math.round),why:a.why},legCurl_progressing_then_one_light_day:{state:c.state,deltaPct:+(c.delta*100).toFixed(1)},bench_progressing_then_one_backoff_only_day:{state:d.state,deltaPct:+(d.delta*100).toFixed(1)},note:'ACT requires >=4 dates, non-increasing values and delta<-5%'}});
  log('Q3_evidence_engine_mixed_rep_ranges',r);await p.close()}
 {const p=await page();
  const r=await p.eval(()=>{const res={};
   res.exerciseOnlyLoggedInSlots=true;
   // what is the exerciseDescription for the key knee-relevant exercises?
   res.guideLeg=exerciseDescription(getEx('Hack Squat'));res.guideBulgarian=exerciseDescription(getEx('Bulgarian Split Squat (DB)'));res.guideLegExt=exerciseDescription(getEx('Leg Extension'));
   res.lsHack=loadedFor('Hack Squat',getEx('Hack Squat'));res.lsLegExt=loadedFor('Leg Extension',getEx('Leg Extension'));res.lsBulg=loadedFor('Bulgarian Split Squat (DB)',getEx('Bulgarian Split Squat (DB)'));
   res.sideWordsInVisibleText=/per leg|each leg|\bleft\b|\bright\b/i.test(document.body.innerText);res.sideFieldInLogSetSource=/\b(side|leg)\s*:/.test(logSet.toString());
   res.perLegMentions=(document.documentElement.innerHTML.match(/per leg/gi)||[]).length;
   res.painFieldInFinishPanel=document.getElementById('finishPanel').innerText;
   return res});
  log('Q4_knee_relevant_text',r);await p.close()}
 // Q5: is the 'Weighted Pull-Up' default for a new user and what is offered as the bodyweight progression
 {const p=await page();
  const r=await p.eval(()=>({giantA_vertical_default:selected('a',5),options:slots.a[5][1],hasRopeExercise:L.filter(x=>/rope climb|climb/i.test(x.name)).map(x=>x.name),jumpExercises:L.filter(x=>/jump|bound|hop|pogo|plyo|sprint/i.test(x.name)).map(x=>x.name),specialAthleticSteps:special.athletic.map(x=>x.n+' ('+x.detail+', '+x.sets+' sets)'),hasSwimWorkout:Object.keys(T).filter(k=>/swim|water/i.test(T[k][0]+k))}));
  log('Q5_capability_coverage',r);await p.close()}
}finally{fs.writeFileSync(outFile,JSON.stringify(out,null,1));await b.close();await s.close()}})().catch(e=>{console.error(e);process.exit(1)});

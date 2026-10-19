'use strict';
// Read-only behavioural probes for the HQ 2.3 audit. Synthetic data only, isolated browser contexts, no app files touched.
// Usage: node audit/scripts/behavior_probes.js <appDir> <out.json>
const fs=require('fs');
const {launch}=require('../../tests/lib/cdp.js'),{serve}=require('../../tests/lib/server.js');
const [appDir,outFile]=process.argv.slice(2);
const out={};const log=(k,v)=>{out[k]=v;console.log(k,JSON.stringify(v).slice(0,600))};
(async()=>{const s=await serve(appDir),b=await launch();
const page=async()=>{const p=await b.newPage('/tmp');await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.goto(s.origin+'/');return p};
try{
 // P1 readiness: defaults, joint-pain override, two poor-sleep nights, stale check-in
 {const p=await page();
  const r=await p.eval(()=>{const D=readinessDecision,S=readinessScore;const c=(o)=>({score:S(o),label:D(o).label,text:D(o).text});
   return {neverCheckedIn_default:c(osData().readiness),defaultDate:osData().readiness.date,
    jointsWorst_othersBest:c({sleep:5,energy:5,soreness:5,joints:1,motivation:5}),
    jointsAndSorenessWorst:c({sleep:5,energy:5,soreness:1,joints:1,motivation:5}),
    sleepAndEnergyWorst:c({sleep:1,energy:1,soreness:5,joints:5,motivation:5}),
    allOnes:c({sleep:1,energy:1,soreness:1,joints:1,motivation:1}),
    allFives:c({sleep:5,energy:5,soreness:5,joints:5,motivation:5}),
    thresholds:'>=76 GREEN, >=58 YELLOW, else RED'}});
  const staleUsed=await p.eval(()=>{const d=osData();d.readiness={sleep:5,energy:5,soreness:5,joints:5,motivation:5,date:'2020-01-01T00:00:00.000Z'};saveOS(d);return readinessDecision(osData().readiness).label});
  r.fiveYearOldCheckinStillShows=staleUsed;
  // does readiness change any prescription?
  const eff=await p.eval(()=>{const d=osData();const snap=k=>{start(k);const o=slots[k].map((sl,i)=>[workSetCount(i),setMode(i,workSetCount(i),selected(k,i))].join('/')).join(',');return o};
   d.readiness={sleep:1,energy:1,soreness:1,joints:1,motivation:1,date:new Date().toISOString()};saveOS(d);const red=snap('a')+'|'+snap('bl');
   d.readiness={sleep:5,energy:5,soreness:5,joints:5,motivation:5,date:new Date().toISOString()};saveOS(d);const green=snap('a')+'|'+snap('bl');return {redEqualsGreenPrescription:red===green}});
  r.prescriptionUnchangedByReadiness=eff;
  const histKeys=await p.eval(()=>{const d=osData();for(const v of [1,2,3]){d.readiness={...d.readiness,sleep:v};saveOS(d)}return {readinessHistoryStored:Object.keys(osData()).filter(k=>/readiness/i.test(k)),entriesInReadinessObject:Object.keys(osData().readiness)}});
  r.history=histKeys;log('P1_readiness',r);await p.close()}
 // P2 'completed' vs 'complete' status in recentSessions / budget / story / coach
 {const p=await page();
  const r=await p.eval(()=>{const now=new Date().toISOString();localStorage.setItem('pa_sessions_v2',JSON.stringify([{id:'s1',template:'a',phase:1,status:'complete',startedAt:now,finishedAt:now,completedAt:now,forms:{},checks:{},choices:{},modes:{},clusters:{}},{id:'s2',template:'b',phase:1,status:'complete',startedAt:now,finishedAt:now,forms:{},checks:{},choices:{},modes:{},clusters:{}}]));
   sessions=readJSON('pa_sessions_v2',[]);return {completedSessionsInStorage:sessions.filter(x=>x.status==='complete').length,recentSessions7:recentSessions(7).length,recentSessions42:recentSessions(42).length,budget:budgetData(),coachHasCompleted:/Completed sessions: 0/.test(coachSummary())}});
  log('P2_status_string_mismatch',r);await p.close()}
 // P3 record shapes for each method through the real logging functions
 {const p=await page();
  const r=await p.eval(()=>{const res={};localStorage.setItem('pa_hist','[]');
   const setForms=(i,j,mode,o)=>{const key=formKey(i,j,mode,'');for(const [k,v] of Object.entries(o)){const el=document.querySelector('[data-save="'+key+k+'"]');if(!el)throw Error('no input '+key+k);el.value=String(v)}};
   // Giant A strength methods
   start('a');
   // bench: Primer + Paused Top/Back-Offs: top set 200x5, back-off 170x8
   setForms(0,1,'Straight Sets',{w:200,r:5,rir:2});logSet(null,0,1);setForms(0,2,'Straight Sets',{w:170,r:8,rir:2});logSet(null,0,2);
   // row: Cluster Sets with split
   setForms(1,1,'Straight Sets',{w:60,r:6,rir:2,clusterSplit:'2+2+2'});logSet(null,1,1);
   // leg curl: final set Myo-Reps
   const fm=setMode(3,workSetCount(3),selected('a',3));res.legCurlFinalMode=fm;
   setForms(3,workSetCount(3),fm,{w0:100,r0:15,w1:100,r1:4,w2:100,r2:4,w3:100,r3:4});saveCluster(3,workSetCount(3));
   const h=JSON.parse(localStorage.pa_hist);
   res.records=h.map(x=>({name:x.name,intensifier:x.intensifier,strengthMethod:x.strengthMethod,set:x.setNumber,final:x.finalSet,w:x.w,reps:x.reps,rir:x.rir,split:x.clusterSplit??null,structured:!!x.structured,efforts:x.efforts?x.efforts.length:null,hasRestSeconds:'rest' in x||'restSec' in x,hasTempo:'tempo' in x,hasSide:'side' in x}));
   // progression target after top set + back-off
   res.targetAfterTopAndBackoff=targetStrength('Bench Press (BB)','Primer + Paused Top/Back-Offs');
   res.prevAfterTopAndBackoff=prevStrength('Bench Press (BB)','Primer + Paused Top/Back-Offs');
   res.targetDoubleProgressionAtTopOfRange=(()=>{localStorage.setItem('pa_hist',JSON.stringify([{name:'Seated Leg Curl',w:100,reps:12,rir:0,intensifier:'Straight Sets',date:new Date().toISOString()}]));return targetMode('Seated Leg Curl','Straight Sets','8–12')})();
   res.targetAfterRepsBelowRange=(()=>{localStorage.setItem('pa_hist',JSON.stringify([{name:'Seated Leg Curl',w:100,reps:3,rir:0,intensifier:'Straight Sets',date:new Date().toISOString()}]));return targetMode('Seated Leg Curl','Straight Sets','8–12')})();
   // e1RM inflation by widowmaker / clusters in progress analytics
   const h2=[{name:'Leg Press',w:300,reps:8,rir:2,intensifier:'Straight Sets'},{name:'Leg Press',w:200,reps:20,rir:0,intensifier:'Widowmaker'}];
   res.maxE1_legPress_straight8x300_vs_widow20x200=maxE1(h2.slice(0,1),'Leg Press')+' vs '+maxE1(h2,'Leg Press');
   res.performanceValue_epley_20rep=performanceValue({w:200,reps:20});
   return res});
  log('P3_record_shapes_and_progression_text',r);await p.close()}
 // P4 Giant A/B set counts incl. stages, stage names, expected timeline
 {const p=await page();
  const r=await p.eval(()=>{const rows=[];for(const k of ['a','b','bu','bl']){for(const cyc of (k==='b'?[0,1,2]:[0])){completedTemplateCount=()=>cyc;start(k);let total=0,stageSets=0,loadedStretches=0;slots[k].forEach((sl,i)=>{if(currentSession.compact&&!compactSlot(k,i))return;const n=selected(k,i),wc=workSetCount(i),fm=setMode(i,wc,n),st=methodStages(fm);const straight=wc-(fm!=='Straight Sets'?1:0);total+=straight;if(st)stageSets+=st.length;else if(fm!=='Straight Sets')total+=1;if(loadedFor(n,getEx(n)))loadedStretches++});rows.push({tpl:k,cycle:cyc,straightSets:total,stagedEffortsInFinalBlocks:stageSets,loadedStretches,sessionInputRows:document.querySelectorAll('#exs input').length,exsHeightPx:document.getElementById('exs').scrollHeight,viewportH:innerHeight,viewportW:innerWidth})}}return rows});
  log('P4_session_size',r);await p.close()}
 // P5 schedule negotiator scenarios
 {const p=await page();
  const run=async(label,mins)=>{const r=await p.eval(m=>{osPage('schedule');m.forEach((v,i)=>document.getElementById('av_'+i).value=v);runSchedule();return [...document.querySelectorAll('#scheduleOut .plan-step')].map(x=>x.textContent)},mins);return r};
  const sc={default_sun90_mon40_tue90_wed10_thu30_fri10_sat40:[90,40,90,10,30,10,40],
   all_days_60:[60,60,60,60,60,60,60],
   only_sun_mon_available_90:[90,90,0,0,0,0,0],
   weekdays_only_45_no_weekend:[0,45,45,45,45,45,0],
   overtime_tue_wed_0_B_day_lost:[90,40,0,0,30,10,40],
   thirty_minutes_every_day:[30,30,30,30,30,30,30],
   weekend_only_120:[120,0,0,0,0,0,120],
   mon_tue_wed_90_rest_0:[0,90,90,90,0,0,0]};
  const res={};for(const [k,v] of Object.entries(sc))res[k]=await run(k,v);log('P5_schedule_negotiator',res);await p.close()}
 // P6 adaptive plan outputs per template
 {const p=await page();
  const r=await p.eval(()=>{const res={};for(const t of ['a','b','conditioning','athletic','mobility']){todayMission=()=>({template:t,name:t,purpose:''});res[t]={fullGym60:adaptivePlan(60,'gym','normal'),tenMinutes:adaptivePlan(10,'gym','normal'),dumbbells40:adaptivePlan(40,'dumbbells','normal'),lowerIntensity:adaptivePlan(60,'gym','lower')}}return res});
  const brief={};for(const t in r)for(const k in r[t]){const x=r[t][k];(brief[t]??={})[k]={compact:x.compact,keep:x.keep,trade:x.trade,cut:x.cut}}
  log('P6_adaptive',brief);
  // does applying a "lower intensity" adaptation change any rendered prescription?
  const eff=await p.eval(()=>{todayMission=()=>({template:'a',name:'a',purpose:''});window.paAdaptive=adaptivePlan(60,'gym','lower');start('a');const before=document.getElementById('exs').innerHTML;applyAdaptive();const after=document.getElementById('exs').innerHTML;return {adaptiveIntensityStored:currentSession?.adaptiveIntensity,renderedDiffers:before!==after,compactFlag:currentSession.compact,rirPlaceholdersAfter:[...document.querySelectorAll('#exs input[placeholder]')].map(i=>i.placeholder).slice(0,12)}});
  log('P6b_lower_intensity_effect',eff);await p.close()}
 // P7 mobile layout metrics for Giant A (viewport as launched)
 {const p=await page();
  const r=await p.eval(()=>{start('a');const ex=document.getElementById('exs');return {innerWidth,innerHeight,exsScrollHeight:ex.scrollHeight,screensOfScrolling:+(ex.scrollHeight/innerHeight).toFixed(1),inputs:ex.querySelectorAll('input').length,buttons:ex.querySelectorAll('button').length,selects:ex.querySelectorAll('select').length}});
  log('P7_giantA_mobile_metrics',r);
  const r2=await p.eval(()=>{start('conditioning');const ex=document.getElementById('exs');return {conditioningCards:[...ex.querySelectorAll('.card b')].map(x=>x.textContent),hasHRorRPEorCadenceTargets:/RPE|heart|zone [2-5]|cadence|resistance|output/i.test(ex.textContent.replace(/AVG (RESISTANCE|CADENCE|HR)/g,''))}});
  log('P7b_conditioning_session',r2);await p.close()}
 // P8 corrupted/edge: weekday mapping & block structure
 {const p=await page();
  const r=await p.eval(()=>({schedule:PA20.schedule,coreDaysBlock1:coreDays(BLOCKS[0]),weekModeEffectOnSlots:(()=>{const out={};for(const m of ['busy','normal','extra']){setWeekMode(m);start('a');out[m]=slots.a.map((s,i)=>workSetCount(i)).join(',')}return out})()}));
  log('P8_schedule_and_weekmode',r);await p.close()}
}finally{fs.writeFileSync(outFile,JSON.stringify(out,null,1));await b.close();await s.close()}})().catch(e=>{console.error(e);process.exit(1)});

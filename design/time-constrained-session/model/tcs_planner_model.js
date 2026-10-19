'use strict';
// DESIGN MODEL — NOT PRODUCTION CODE. Not loaded by the app. No app file is read or written.
// Purpose: make the specification's worked examples and invariants reproducible before any implementation is approved.
// Inputs: audit/data/effective_prescription.json (default prescriptions), audit/data/baseline/{IP,GIANT_BOOKENDS}.json.
// Usage: node design/time-constrained-session/model/tcs_planner_model.js [out.json]
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'..','..','..','audit','data');
const rows=JSON.parse(fs.readFileSync(path.join(D,'effective_prescription.json')));
const IP=JSON.parse(fs.readFileSync(path.join(D,'baseline','IP.json')));
const STAGES={'DC Rest-Pause':3,'Rest-Pause':3,'Myo-Reps':4,'FST-7':7,'BFR':4,'Lengthened Partials':2,'Mechanical Drop Set':3,'Widowmaker':1};

// ---- Modelled constants (placeholders to be calibrated from the athlete's own timestamps; see spec section C) ----
const M={workSec:45,setupSec:60,stageSec:25,widowmakerExtraSec:90,loadedStretchSec:65,buffer:0.10,band:0.15};

// ---- Draft tier data (PROPOSAL for approval; see spec section B) ----
const CORE_ORDER={a:['Vertical Pull','Horizontal Press','Squat Press','Horizontal Row','Loaded Carry'],b:['Vertical Pull','Incline Press','Hip Hinge','Biceps']};
const ACC_ORDER={a:['Leg Curl','Lateral Raise'],b:['Triceps','Rear Delts','Calves','Widowmaker']};
// Warm-up / cool-down items: [name, modelled seconds, prepares (movement labels) | 'general']
const WARM={
 a:[['Raise Temperature',240,'general'],['Knee-to-Wall Ankle Rocks',45,['Squat Press']],['90/90 Hip Switches',45,['Squat Press']],['Wall Slides',40,['Horizontal Press','Horizontal Row','Vertical Pull']],['Scapular Push-Ups',40,['Horizontal Press','Horizontal Row']],['Bodyweight Squat → Controlled Depth',60,['Squat Press']],['Bench-Specific Ramp',320,['Horizontal Press']],['Row / Squat-Press Primer',160,['Horizontal Row','Squat Press'],'perMovement']],
 b:[['Raise Temperature',240,'general'],['Cat-Camel',45,['Hip Hinge']],['90/90 Hip Switches',45,['Hip Hinge','Widowmaker']],['Dowel / Bodyweight Hip Hinge',50,['Hip Hinge']],['Glute Bridge',40,['Hip Hinge']],['Wall Slides',40,['Incline Press','Vertical Pull']],['Scapular Pulldown / Straight-Arm Pulldown',40,['Vertical Pull']],['Incline-Press Ramp',240,['Incline Press']],['RDL Primer',240,['Hip Hinge']]]
};
const COOL={
 a:[['Easy Walk + Nasal Breathing',120,'general'],['Doorway Pec / Biceps Opening',60,['Horizontal Press']],['Child’s-Pose Lat Reach',45,['Vertical Pull']],['Supported Deep-Squat Sit',45,['Squat Press']],['Calf / Ankle Stretch',60,['Squat Press','Loaded Carry']],['Downshift Breathing',30,'general']],
 b:[['Easy Walk + Nasal Breathing',120,'general'],['Gentle Pec / Front-Shoulder Opening',60,['Incline Press']],['Lat Reach / Supported Hang',50,['Vertical Pull']],['Supine Hamstring Stretch',70,['Hip Hinge']],['Figure-Four Glute Stretch',70,['Hip Hinge','Widowmaker']],['Forearm + Arm Shakeout',45,['Biceps','Triceps','Vertical Pull']],['Downshift Breathing',30,'general']]
};
const KEEP_COOL_GENERAL=['Downshift Breathing'];

function slotsFor(tpl,cycle=0){
 return rows.filter(r=>r.tpl===tpl&&r.cycle===cycle).map(r=>({i:r.i,label:r.slot,ex:r.defaultEx,sets:r.sets,rest:r.restSec,strength:r.strengthEligible,method:(!r.strengthEligible&&r.intensifierFinalSet!=='Straight Sets')?r.intensifierFinalSet:null,methodRest:r.intensifierRest,ls:!!r.loadedStretch,role:(CORE_ORDER[tpl]||[]).includes(r.slot)?'core':'accessory',rank:(CORE_ORDER[tpl]||[]).includes(r.slot)?CORE_ORDER[tpl].indexOf(r.slot):(ACC_ORDER[tpl]||[]).indexOf(r.slot),sel:{sets:r.sets,ls:!!r.loadedStretch,method:(!r.strengthEligible&&r.intensifierFinalSet!=='Straight Sets')?r.intensifierFinalSet:null,in:true}}));
}
function slotSec(s){
 const x=s.sel;if(!x.in)return 0;
 const hasBlock=!!x.method,straight=hasBlock?x.sets-1:x.sets;let t=M.setupSec+straight*(M.workSec+s.rest);
 if(hasBlock){const st=STAGES[x.method]||1,rIn=(IP[x.method]?.rest)??s.rest;t+=st*M.stageSec+(st-1)*rIn;if(x.method==='Widowmaker')t+=M.widowmakerExtraSec}
 if(x.ls)t+=M.loadedStretchSec;return t;
}
function itemsNeeded(list,slots,{keepCooldownStretches=true}={}){
 const retained=new Set(slots.filter(s=>s.sel.in).map(s=>s.label));
 return list.filter(([n,sec,prep])=>prep==='general'||prep.some(p=>retained.has(p))).map(([n,sec,prep,mode])=>{
  const k=mode==='perMovement'?prep.filter(p=>retained.has(p)).length:1;return {name:n,sec:sec*k,general:prep==='general'}});
}
function total(tpl,slots,coolTrim){
 const warm=itemsNeeded(WARM[tpl],slots),cool0=itemsNeeded(COOL[tpl],slots),cool=coolTrim?cool0.filter(c=>KEEP_COOL_GENERAL.includes(c.name)):cool0;
 const core=slots.reduce((a,s)=>a+slotSec(s),0),w=warm.reduce((a,x)=>a+x.sec,0),c=cool.reduce((a,x)=>a+x.sec,0);
 return {coreSec:core,warmSec:w,coolSec:c,sec:core+w+c,warm,cool,coolTrim};
}
function plan(tpl,T,cycle=0,policy='breadth',opts={}){const allowCoolTrim=opts.allowCoolTrim!==false;
 const slots=slotsFor(tpl,cycle),budget=T*60*(1-M.buffer),log=[];let coolTrim=false;
 const full=total(tpl,slots,false);
 const lowFirst=(arr)=>[...arr].sort((a,b)=>b.rank-a.rank); // highest rank number = lowest priority
 const core=slots.filter(s=>s.role==='core'),acc=slots.filter(s=>s.role==='accessory');
 const fits=()=>total(tpl,slots,coolTrim).sec<=budget;
 const steps=[];
 for(const s of lowFirst(acc).concat(lowFirst(core)))steps.push(()=>{if(s.sel.in&&s.sel.ls){s.sel.ls=false;return `loaded stretch removed: ${s.label}`}});
 for(const s of lowFirst(acc).concat(lowFirst(core)))steps.push(()=>{if(s.sel.in&&s.sel.method){s.sel.method=null;return `intensifier efforts removed (final set kept as straight): ${s.label}`}});
 steps.push(()=>{if(allowCoolTrim&&!coolTrim){coolTrim=true;return 'cool-down trimmed to downshift only'}});
 for(const s of lowFirst(acc))steps.push(()=>{if(s.sel.in&&s.sel.sets>1){s.sel.sets=1;return `sets reduced to 1: ${s.label}`}});
 for(const s of lowFirst(acc))steps.push(()=>{if(s.sel.in){s.sel.in=false;return `omitted (deferred): ${s.label}`}});
 const coreLeft=()=>slots.filter(x=>x.sel.in&&x.role==='core').length;
 const reduceCore=()=>{for(const s of lowFirst(core))steps.push(()=>{if(s.sel.in&&s.sel.sets>1){s.sel.sets=Math.max(1,s.sel.sets-1);return `sets reduced to ${s.sel.sets}: ${s.label}`}})};
 const omitCore=(floor)=>{for(const s of lowFirst(core))steps.push(()=>{if(s.sel.in&&coreLeft()>floor){s.sel.in=false;return `omitted (deferred): ${s.label}`}})};
 if(policy==='depth'){omitCore(2);reduceCore();omitCore(1)}else{reduceCore();omitCore(1)}
 if(!fits())for(const st of steps){let r;while((r=st())){log.push(r);if(fits())break}if(fits())break}
 const t=total(tpl,slots,coolTrim),feasible=t.sec<=budget;
 const fullSlots=slotsFor(tpl,cycle);
 return {tpl,cycle,availableMin:T,budgetMin:+(budget/60).toFixed(1),fullSessionEstMin:+(full.sec/60).toFixed(1),fullFits:full.sec<=budget,feasible,estMin:+(t.sec/60).toFixed(1),rangeMin:[+(t.sec*(1-M.band)/60).toFixed(0),+(t.sec*(1+M.band)/60).toFixed(0)],
  breakdownMin:{core:+(t.coreSec/60).toFixed(1),warm:+(t.warmSec/60).toFixed(1),cool:+(t.coolSec/60).toFixed(1)},
  items:slots.map((s,k)=>{const f=fullSlots[k];const ch=[];if(s.sel.in){if(s.sel.sets<f.sets)ch.push(`sets ${f.sets}→${s.sel.sets}`);if(f.sel.method&&!s.sel.method)ch.push(`no ${f.sel.method} efforts`);if(f.sel.ls&&!s.sel.ls)ch.push('no loaded stretch')}
   const status=!s.sel.in?'OMITTED (NOT DONE)':ch.length?'REDUCED':'INCLUDED';
   return {slot:s.label,exercise:s.ex,role:s.role,status,fullSets:f.sets,plannedSets:s.sel.in?s.sel.sets:0,changes:s.sel.in?ch:['not done today; deferred'],method:s.sel.method,loadedStretch:s.sel.ls&&s.sel.in}}),
  policy,
  warmupRetained:t.warm.map(x=>x.name),warmupDropped:itemsNeeded(WARM[tpl],fullSlots).filter(x=>!t.warm.some(y=>y.name===x.name)).map(x=>x.name),
  cooldownRetained:t.cool.map(x=>x.name),log};
}
function checkInvariants(p){
 const bad=[],full=slotsFor(p.tpl,p.cycle);
 p.items.forEach((it,k)=>{const f=full[k];
  if(it.plannedSets>it.fullSets)bad.push('sets above full');
  if(it.status!=='OMITTED (NOT DONE)'&&it.plannedSets<1)bad.push('included with 0 sets');
  if(it.method&&it.method!==f.sel.method)bad.push('method added/changed');
  if(it.loadedStretch&&!f.sel.ls)bad.push('loaded stretch added');
  if(it.status==='OMITTED (NOT DONE)'&&it.plannedSets!==0)bad.push('omitted with sets')});
 if(p.feasible&&p.estMin>p.budgetMin+0.05)bad.push('estimate over budget');
 if(p.fullFits&&p.items.some(i=>i.status!=='INCLUDED'))bad.push('full fits but plan differs from full');
 if(p.feasible&&!p.items.some(i=>i.role==='core'&&i.status!=='OMITTED (NOT DONE)'))bad.push('no core work in feasible plan');
 const retained=new Set(p.items.filter(i=>i.status!=='OMITTED (NOT DONE)').map(i=>i.slot));
 for(const w of WARM[p.tpl])if(w[2]!=='general'&&w[2].some(x=>retained.has(x))&&!p.warmupRetained.includes(w[0]))bad.push('warm-up item for retained work dropped: '+w[0]);
 return bad;
}
function checkGrid(){let n=0,bad=[],feasible=0,infeasible=0,fullFit=0;
 let mono=0;const setsOf=p=>p.feasible?p.items.reduce((a,i)=>a+i.plannedSets,0):0;
 for(const [tpl,cyc] of [['a',0],['b',0],['b',1],['b',2]])for(const pol of ['breadth','depth']){let prevMax=0;for(let T=5;T<=130;T++){const q=plan(tpl,T,cyc,pol),w=setsOf(q);if(w<prevMax)mono++;prevMax=Math.max(prevMax,w)}}
 for(const [tpl,cyc] of [['a',0],['b',0],['b',1],['b',2]])for(const pol of ['breadth','depth'])for(let T=5;T<=130;T++){const p=plan(tpl,T,cyc,pol);n++;p.feasible?feasible++:infeasible++;if(p.fullFits)fullFit++;const b=checkInvariants(p);if(b.length)bad.push({tpl,cyc,pol,T,b})}
 const firstFeasible={};for(const [tpl,cyc] of [['a',0],['b',0]]){for(let T=1;T<=130;T++){if(plan(tpl,T,cyc).feasible){firstFeasible[tpl]=T;break}}}
 return {plansChecked:n,feasible,infeasible,fullFits:fullFit,violations:bad.length,monotonicityViolations:mono,firstViolations:bad.slice(0,3),smallestFeasibleMinutesDefaultModel:firstFeasible};}
if(require.main===module){
 const out={model:M,note:'Modelled estimates. Draft tier data. Illustrative only.',examples:[]};
 for(const [tpl,cyc] of [['a',0],['b',0],['b',2]])for(const T of [12,25,40,60,90,110])for(const pol of (T===25||T===40||T===60?['breadth','depth']:['breadth'])){const p=plan(tpl,T,cyc,pol);out.examples.push(p);
  console.log(`\n${tpl.toUpperCase()}${tpl==='b'?'#'+cyc:''} • ${pol} • ${T} min available (budget ${p.budgetMin}) • full est ${p.fullSessionEstMin}${p.fullFits?' (FULL FITS)':''} • plan ${p.feasible?p.estMin+' min '+JSON.stringify(p.rangeMin):'INFEASIBLE'}`);
  for(const i of p.items)console.log(`   ${i.status.padEnd(18)} ${i.slot.padEnd(18)} ${i.plannedSets}/${i.fullSets} sets  ${i.changes.join('; ')}`);}
 out.sensitivityNoCoolDownTrim=[];for(const [tpl,cyc] of [['a',0],['b',0]])for(const T of [12,15,20,25,30,40,60]){const d=plan(tpl,T,cyc),n=plan(tpl,T,cyc,'breadth',{allowCoolTrim:false});const keep=p=>p.feasible?p.items.filter(i=>i.status!=='OMITTED (NOT DONE)').map(i=>i.slot+':'+i.plannedSets).join(','):'INFEASIBLE';out.sensitivityNoCoolDownTrim.push({tpl,T,withTrim:keep(d),withoutTrim:keep(n)})}
 out.invariants=checkGrid();console.log('\nINVARIANT GRID',JSON.stringify(out.invariants));
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
}
module.exports={checkInvariants,checkGrid,plan,slotsFor,total,M,CORE_ORDER,ACC_ORDER,WARM,COOL};

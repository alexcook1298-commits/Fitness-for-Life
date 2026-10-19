'use strict';
// Read-only analysis over the extracted program data: weekly set matrix and modelled session durations.
// Usage: node audit/scripts/analysis.js   (reads audit/data/*)
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'..','data');
const rows=require(path.join(D,'effective_prescription.json'));
const IP=require(path.join(D,'candidate','IP.json'));
const STAGES={'DC Rest-Pause':3,'Rest-Pause':3,'Myo-Reps':4,'FST-7':7,'BFR':4,'Lengthened Partials':2,'Mechanical Drop Set':3};
const MUSCLE={ // slot label -> [[muscle, weight]]  (weight 1 = direct, 0.5 = indirect)
 'Horizontal Press':[['Chest',1],['Triceps',.5],['Front delts',.5]],'Incline Press':[['Chest',1],['Triceps',.5],['Front delts',.5]],'Chest Isolation':[['Chest',1]],
 'Horizontal Row':[['Upper back / mid back',1],['Biceps',.5],['Rear delts',.5]],'Vertical Pull':[['Lats',1],['Biceps',.5]],'Lat Isolation':[['Lats',1]],
 'Squat Press':[['Quads',1],['Glutes',.5]],'Quad Press':[['Quads',1],['Glutes',.5]],'Unilateral Quads':[['Quads',1],['Glutes',.5]],'Leg Extension':[['Quads',1]],'Widowmaker':[['Quads',1]],
 'Hip Hinge':[['Hamstrings',1],['Glutes',1]],'Leg Curl':[['Hamstrings',1]],'Lateral Raise':[['Side delts',1]],'Rear Delts':[['Rear delts',1]],'Biceps':[['Biceps',1]],'Triceps':[['Triceps',1]],
 'Calves':[['Calves',1]],'Adductors':[['Adductors',1]],'Loaded Carry':[['Grip / trunk / traps',1]],'Weighted Vertical Pull':[['Lats',1],['Biceps',.5]],'Overhead Press':[['Front delts',1],['Side delts',.5],['Triceps',.5]],'Core':[['Core',1]],'Grip Hang':[['Grip / trunk / traps',1]]};
function sessionSets(tpl,cycle=0){
 const out={};const r=rows.filter(x=>x.tpl===tpl&&x.cycle===cycle);
 for(const x of r){
  const hasBlock=x.intensifierFinalSet!=='Straight Sets'&&!x.strengthEligible;
  const stages=hasBlock?STAGES[x.intensifierFinalSet]||1:0;
  const programmed=x.sets;                       // straight sets + (final set counted once)
  const extended=hasBlock?x.sets-1+stages:x.sets; // every logged effort counted as one hard effort
  for(const [m,w] of (MUSCLE[x.slot]||[])){const o=out[m]??={direct:0,indirect:0,extendedDirect:0};if(w===1){o.direct+=programmed;o.extendedDirect+=extended}else o.indirect+=programmed*w}
 }
 return out;
}
function add(a,b,k=1){for(const m in b){const o=a[m]??={direct:0,indirect:0,extendedDirect:0};o.direct+=b[m].direct*k;o.indirect+=b[m].indirect*k;o.extendedDirect+=b[m].extendedDirect*k}return a}
const A=sessionSets('a'),B=[0,1,2].map(c=>sessionSets('b',c)),Bavg={};B.forEach(x=>add(Bavg,x,1/3));
const BU=sessionSets('bu'),BL=sessionSets('bl'),C=sessionSets('c');
const week=(parts)=>parts.reduce((acc,p)=>add(acc,p),{});
const weeks={normal_A_plus_B:week([A,Bavg]),extra_with_Upper:week([A,Bavg,BU]),extra_with_Lower:week([A,Bavg,BL]),extra_with_both_B_splits:week([A,Bavg,BU,BL]),normal_plus_GiantC:week([A,Bavg,C])};
const fmt=x=>({direct:+x.direct.toFixed(1),indirect:+x.indirect.toFixed(1),extendedDirect:+x.extendedDirect.toFixed(1)});
const result={perSession:{A:A,B_cycle0:B[0],B_cycle1:B[1],B_cycle2:B[2],BU,BL,C},weeks};
for(const k in result.perSession)for(const m in result.perSession[k])result.perSession[k][m]=fmt(result.perSession[k][m]);
for(const k in weeks)for(const m in weeks[k])weeks[k][m]=fmt(weeks[k][m]);
// ---- Duration model (assumptions printed with the result)
const MODEL={workSecPerSet:45,setupSecPerExercise:60,loadedStretchSec:20+45,warmupMin:{a:12,b:12,bu:12,bl:12,c:12},cooldownMin:5,
 stageWorkSec:25,primerExtraSecA:210+30};
function duration(tpl,cycle=0,opts={}){
 let sec=0;const r=rows.filter(x=>x.tpl===tpl&&x.cycle===cycle);
 for(const x of r){
  const hasBlock=x.intensifierFinalSet!=='Straight Sets'&&!x.strengthEligible;
  const straight=hasBlock?x.sets-1:x.sets;
  sec+=MODEL.setupSecPerExercise;
  sec+=straight*(MODEL.workSecPerSet+x.restSec);
  if(hasBlock){const ip=IP[x.intensifierFinalSet];const st=STAGES[x.intensifierFinalSet]||1;const restIn=ip.rest??x.restSec;
   sec+=st*MODEL.stageWorkSec+(st-1)*restIn;
   if(x.intensifierFinalSet==='Widowmaker')sec+=MODEL.workSecPerSet*2;}
  if(x.activator&&opts.activators)sec+=MODEL.workSetPerSet||0;
  if(x.loadedStretch&&!opts.noLoadedStretch)sec+=MODEL.loadedStretchSec;
 }
 if(tpl==='a')sec+=MODEL.primerExtraSecA;
 const core=sec/60;const warm=opts.noWarmup?0:MODEL.warmupMin[tpl]||10,cool=opts.noCooldown?0:MODEL.cooldownMin;
 return {coreMin:Math.round(core),warmupMin:warm,cooldownMin:cool,totalMin:Math.round(core+warm+cool)};
}
const dur={};
for(const [t,c] of [['a',0],['b',0],['b',1],['b',2],['bu',0],['bl',0],['c',0]]){dur[t+(t==='b'?'#'+c:'')]={default:duration(t,c),withoutLoadedStretches:duration(t,c,{noLoadedStretch:true}),withoutWarmupCooldown:duration(t,c,{noWarmup:true,noCooldown:true})}}
result.durationModel={assumptions:MODEL,results:dur};
fs.writeFileSync(path.join(D,'analysis.json'),JSON.stringify(result,null,1));
const pr=(title,w)=>{console.log('\n'+title);const ms=Object.keys(w).sort((a,b)=>w[b].direct-w[a].direct);console.log('muscle'.padEnd(24)+'direct  indirect  directEfforts');for(const m of ms)console.log(m.padEnd(24)+String(w[m].direct).padEnd(8)+String(w[m].indirect).padEnd(10)+w[m].extendedDirect)};
for(const k in weeks)pr(k,weeks[k]);
for(const k in result.perSession)pr('SESSION '+k,result.perSession[k]);
console.log('\nDURATIONS (modelled, min)');for(const k in dur)console.log(k.padEnd(6),JSON.stringify(dur[k].default),'| no LS core',dur[k].withoutLoadedStretches.coreMin,'| core only',dur[k].withoutWarmupCooldown.coreMin);

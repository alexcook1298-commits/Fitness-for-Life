'use strict';
// Project America HQ 2.3 — Phase 4 suite: evidence-engine defects (written BEFORE the fixes).
//   EN1 back-off-only partial -> false ACT   EN2 evening session counted twice   EN3 unfinished drafts in evidence   EN4 NEXT target anchor   EN5 preservation guards
// Usage: node tests/phase4.test.js <appDir> [--json out.json] [--only ID,ID] [--group EN]
// Drives the real app in headless Chrome. Synthetic data, disposable profiles. Written BEFORE each implementation.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const {launch}=require('./lib/cdp'),{serve}=require('./lib/server'),clock=require('./lib/clock');

const args=process.argv.slice(2);
const opt=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
const appDir=args.find(a=>!a.startsWith('--')&&!['--json','--only','--group'].includes(args[args.indexOf(a)-1]));
if(!appDir){console.error('Usage: node tests/phase4.test.js <appDir> [--json out.json] [--only ID,ID] [--group EN]');process.exit(2)}
const jsonOut=opt('--json'),only=opt('--only')?opt('--only').split(','):null,groups=opt('--group')?opt('--group').split(','):null;
const work=fs.mkdtempSync(path.join(os.tmpdir(),'pa-p4-'));const dl=path.join(work,'downloads');fs.mkdirSync(dl);
const tests=[];const test=(id,title,fn)=>tests.push({id,group:id.replace(/[0-9.]+$/,''),title,fn});
let ctx;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const openApp=async()=>{const p=await ctx.browser.newPage(dl);await p.goto(ctx.origin+'/');return p};
let fileCounter=0;
const writeFile=obj=>{const f=path.join(work,`file-${++fileCounter}.json`);fs.writeFileSync(f,typeof obj==='string'?obj:JSON.stringify(obj,null,2));return f};
const storage=p=>p.eval(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
const PA=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k.startsWith('pa_')&&!k.startsWith('pa_restore_rollback')));
const notice=p=>p.eval(()=>{const n=document.getElementById('appNotice');return n.classList.contains('hidden')?'':n.textContent});
const clearNotice=p=>p.eval(()=>document.getElementById('appNotice').classList.add('hidden'));
const bsess=(id,template,status='complete',daysAgo=1,over={})=>({id,template,phase:1,weekMode:'normal',status,startedAt:new Date(Date.now()-daysAgo*86400000-3600000).toISOString(),...(status==='complete'?{finishedAt:new Date(Date.now()-daysAgo*86400000).toISOString()}:{}),forms:{},checks:{},choices:{},modes:{},clusters:{},...over});
const seedS=(p,rows)=>p.eval(r=>{localStorage.setItem('pa_sessions_v2',JSON.stringify(r))},rows).then(()=>p.goto(ctx.origin+'/'));

const GROUPS=[[3,4],[1,5],[0,6]];

const evDay=(n,h=0)=>new Date(Date.now()-n*86400000+h*3600000).toISOString();
const evSeed=(p,rows,sess)=>p.eval((r,s)=>{localStorage.pa_hist=JSON.stringify(r);if(s)localStorage.pa_sessions_v2=JSON.stringify(s)},rows,sess||null);
// A Top Set + Back-Offs exposure as the app writes it: set 1 is the top set, later sets are lighter back-offs.
const TSB='Top Set + Back-Offs',BENCH='Bench Press (BB)';
const PPT='Primer + Paused Top/Back-Offs';
const tsb=(sid,daysAgo,{top=200,back=[170,170],reps=5,withTop=true,name=BENCH,hour=0,method=TSB}={})=>{
 const rows=[];if(withTop)rows.push({id:sid+'|0|'+name+'|1|Straight Sets',sessionId:sid,name,intensifier:'Straight Sets',strengthMethod:method,template:'a',block:1,setNumber:1,w:top,reps,rir:2,date:evDay(daysAgo,hour)});
 back.forEach((w,k)=>rows.push({id:sid+'|0|'+name+'|'+(k+2)+'|Straight Sets',sessionId:sid,name,intensifier:'Straight Sets',strengthMethod:method,template:'a',block:1,setNumber:k+2,w,reps,rir:2,date:evDay(daysAgo,hour+0.01*(k+1))}));return rows};
const sess=(id,status='complete',daysAgo=1)=>bsess(id,'a',status,daysAgo);
const decision=p=>p.eval(()=>{const e=evidenceDecision();return {name:e.name,state:e.state,vals:e.vals&&e.vals.map(v=>Math.round(v*10)/10),why:e.why}});
const target=(p,n,m)=>p.eval((n,m)=>targetStrength(n,m),n,m);

// =====================================================================
// EN1: back-off-only partial sessions generate a false ACT
// =====================================================================
test('EN1a','Defect reproduced: three partial sessions that logged only the lighter BACK-OFF sets after a top-set session must not read as a four-exposure deterioration (ACT)',async p=>{
 await evSeed(p,[...tsb('s0',20),...tsb('s1',13,{withTop:false,back:[170,170]}),...tsb('s2',7,{withTop:false,back:[170,170]}),...tsb('s3',2,{withTop:false,back:[170,170]})],[0,1,2,3].map(k=>sess('s'+k,'complete',[20,13,7,2][k])));
 const d=await decision(p);assert.notStrictEqual(d.state,'ACT','false ACT: '+JSON.stringify(d));assert.notStrictEqual(d.state,'INVESTIGATE','false INVESTIGATE: '+JSON.stringify(d));
});
test('EN1b','Back-off sets never enter the top-set series: a session with a top set and lighter back-offs contributes its TOP set (same value as before the change)',async p=>{
 await evSeed(p,[...tsb('s0',14),...tsb('s1',7),...tsb('s2',2)],[0,1,2].map(k=>sess('s'+k,'complete',[14,7,2][k])));
 const d=await decision(p);const top=200*(1+5/30);assert.deepStrictEqual(d.vals,[top,top,top].map(v=>Math.round(v*10)/10),JSON.stringify(d));assert.strictEqual(d.state,'OBSERVE');
});
test('EN1c','A genuine decline of the TOP set is still detected: four exposures with a falling top set still reach ACT (valid evidence is preserved)',async p=>{
 const rows=[[20,230],[13,215],[7,205],[2,190]].flatMap(([d,w],k)=>tsb('s'+k,d,{top:w}));
 await evSeed(p,rows,[0,1,2,3].map(k=>sess('s'+k,'complete',[20,13,7,2][k])));const d=await decision(p);assert.strictEqual(d.state,'ACT',JSON.stringify(d));
});
test('EN1d','Back-off sets of OTHER methods and straight sets are untouched: a straight-set series still compares every set (best per exposure)',async p=>{
 const sr=(id,sid,d,w,s)=>({id,sessionId:sid,name:'Row (DB)',intensifier:'Straight Sets',strengthMethod:null,template:'a',block:1,setNumber:s,w,reps:10,rir:2,date:evDay(d)});
 await evSeed(p,[sr('a','s0',14,100,1),sr('b','s0',14,90,2),sr('c','s1',7,100,1),sr('d','s1',7,95,2),sr('e','s2',2,102,1)],[0,1,2].map(k=>sess('s'+k,'complete',[14,7,2][k])));
 const d=await decision(p);assert.strictEqual(d.vals.length,3);
});
test('EN1e','The same holds for the app\'s default bench method, Primer + Paused Top/Back-Offs (the method Bench Press (BB) actually uses): back-off-only partials never read as ACT, a real top-set decline still does',async p=>{
 const o={method:PPT};
 await evSeed(p,[...tsb('s0',20,o),...tsb('s1',13,{...o,withTop:false}),...tsb('s2',7,{...o,withTop:false}),...tsb('s3',2,{...o,withTop:false})],[0,1,2,3].map(k=>sess('s'+k,'complete',[20,13,7,2][k])));
 const d=await decision(p);assert(!['ACT','INVESTIGATE'].includes(d.state),'false decline: '+JSON.stringify(d));
 const rows=[[20,230],[13,215],[7,205],[2,190]].flatMap(([dd,w],k)=>tsb('s'+k,dd,{...o,top:w}));await evSeed(p,rows,[0,1,2,3].map(k=>sess('s'+k,'complete',[20,13,7,2][k])));
 assert.strictEqual((await decision(p)).state,'ACT');
});
test('EN1f','Methods whose later sets are NOT lighter back-offs keep every set in the series: Heavy Primer + Work Sets, Straight Heavy Sets and Cluster Sets are untouched (set 2 can still be the best set)',async p=>{
 for(const m of ['Heavy Primer + Work Sets','Straight Heavy Sets','Cluster Sets']){
  const mk=(id,sid,d,w,s)=>({id,sessionId:sid,name:'Squat (BB)',intensifier:'Straight Sets',strengthMethod:m,template:'a',block:1,setNumber:s,w,reps:5,rir:2,date:evDay(d)});
  await evSeed(p,[mk('a','s0',9,200,1),mk('b','s1',5,190,1),mk('c','s1',5,210,2),mk('d','s2',2,200,1)],[sess('s0','complete',9),sess('s1','complete',5),sess('s2','complete',2)]);
  const d=await decision(p);assert.strictEqual(d.vals.length,3,m);assert(Math.abs(d.vals[1]-210*(1+5/30))<0.2,m+' '+JSON.stringify(d.vals));
 }
});

// =====================================================================
// EN2: an evening session straddling UTC midnight is counted as two exposures
// =====================================================================
test('EN2a','Defect reproduced: ONE session whose sets straddle UTC midnight is one exposure, not two',async p=>{
 const d0=new Date();d0.setUTCHours(0,0,0,0);const mid=d0.getTime()-3*86400000;
 const at=(ms,k)=>new Date(mid+ms).toISOString();
 const mk=(id,sid,ms,w,s)=>({id,sessionId:sid,name:'Row (DB)',intensifier:'Straight Sets',strengthMethod:null,template:'a',block:1,setNumber:s,w,reps:10,rir:2,date:at(ms)});
 const rows=[mk('a','s0',-10*86400000,100,1),mk('b','s1',-5*86400000,100,1),mk('c','s2',-6*60000,100,1),mk('d','s2',+9*60000,90,2)];
 await evSeed(p,rows,['s0','s1','s2'].map((id,k)=>sess(id,'complete',[10,5,3][k])));const d=await decision(p);
 assert.strictEqual(d.vals.length,3,'one evening session counted as '+(d.vals.length-2)+' exposures: '+JSON.stringify(d.vals));
});
test('EN2b','Controls: two separate sessions on adjacent days stay two exposures; two sessions on the same UTC day still merge to the best set as before',async p=>{
 const mk=(id,sid,d,h,w)=>({id,sessionId:sid,name:'Row (DB)',intensifier:'Straight Sets',strengthMethod:null,template:'a',block:1,setNumber:1,w,reps:10,rir:2,date:evDay(d,h)});
 await evSeed(p,[mk('a','s0',9,0,100),mk('b','s1',6,0,100),mk('c','s2',3,0,100),mk('d','s3',3,2,105)],['s0','s1','s2','s3'].map((id,k)=>sess(id,'complete',[9,6,3,3][k])));
 const d=await decision(p);assert(d.vals.length>=3&&d.vals.length<=4,JSON.stringify(d.vals));
 const days=new Set([9,6,3,3].map((n,k)=>new Date(Date.now()-n*86400000+[0,0,0,2][k]*3600000).toISOString().slice(0,10)));assert.strictEqual(d.vals.length,days.size);
});
test('EN2c','Legacy records without a session id keep the old day grouping (no data is dropped or re-dated)',async p=>{
 const mk=(id,d,w)=>({id,name:'Row (DB)',intensifier:'Straight Sets',w,reps:10,date:evDay(d)});
 await evSeed(p,[mk('a',9,100),mk('b',6,100),mk('c',3,100),mk('d',3,90)]);const d=await decision(p);assert.strictEqual(d.vals.length,3,JSON.stringify(d.vals));
});

// =====================================================================
// EN3: unfinished drafts influence completed-session evidence
// =====================================================================
test('EN3a','Defect reproduced: sets logged in an UNFINISHED draft do not enter the evidence of finished sessions',async p=>{
 const mk=(id,sid,d,w)=>({id,sessionId:sid,name:'Row (DB)',intensifier:'Straight Sets',strengthMethod:null,template:'a',block:1,setNumber:1,w,reps:10,rir:2,date:evDay(d)});
 await evSeed(p,[mk('a','s0',20,100),mk('b','s1',13,100),mk('c','s2',7,100),mk('d','s3',1,60)],[sess('s0'),sess('s1'),sess('s2'),sess('s3','draft',1)]);
 const d=await decision(p);assert.deepStrictEqual(d.vals,[100*(1+1/3),100*(1+1/3),100*(1+1/3)].map(v=>Math.round(v*10)/10),'a draft set entered the series: '+JSON.stringify(d));assert.strictEqual(d.state,'OBSERVE');
});
test('EN3b','The same sets count as soon as the session is finished (nothing is lost, only deferred)',async p=>{
 const mk=(id,sid,d,w)=>({id,sessionId:sid,name:'Row (DB)',intensifier:'Straight Sets',strengthMethod:null,template:'a',block:1,setNumber:1,w,reps:10,rir:2,date:evDay(d)});
 await evSeed(p,[mk('a','s0',20,100),mk('b','s1',13,100),mk('c','s2',7,100),mk('d','s3',1,60)],[sess('s0'),sess('s1'),sess('s2'),sess('s3','complete',1)]);
 const d=await decision(p);assert.strictEqual(d.vals.length,4);assert(d.vals[3]<d.vals[2]);
});
test('EN3c','A live workout does not move the evidence: logging a light set in the running (draft) session leaves the decision unchanged, and nothing is written',async p=>{
 await p.eval(()=>{weekMode='normal';start('a')});const name=await p.eval(()=>selected('a',0)),m=await p.eval(()=>todayStrength(0,selected('a',0)));
 const mk=(id,sid,d)=>({id,sessionId:sid,name,intensifier:'Straight Sets',strengthMethod:m,template:'a',block:1,setNumber:1,w:100,reps:10,rir:2,date:evDay(d)});
 await p.eval(r=>{localStorage.pa_hist=JSON.stringify(r)},[mk('a','x0',20),mk('b','x1',13),mk('c','x2',7)]);
 const before=await decision(p);assert.strictEqual(before.name,name);assert.strictEqual(before.vals.length,3);
 await p.eval(()=>{currentSession.modes['0:'+selected('a',0)]='Straight Sets';render();const key=formKey(0,1,'Straight Sets','');const put=(f,v)=>{document.querySelector(`#exs input[data-save="${key}${f}"]`).value=v};put('w','20');put('r','10');put('rir','2');logSet(null,0,1)});
 assert.strictEqual(await p.eval(()=>JSON.parse(localStorage.pa_hist).filter(x=>x.sessionId===currentSession.id).length),1,'the light set must have been logged');
 const raw=await p.eval(()=>localStorage.pa_hist);const after=await decision(p);
 assert.deepStrictEqual(after,before,'the running workout changed the evidence: '+JSON.stringify(after));assert.strictEqual(await p.eval(()=>localStorage.pa_hist),raw);
});
test('EN3d','Records with no matching session (legacy or older install) are NOT excluded: only records that belong to a DRAFT session are held back',async p=>{
 const mk=(id,sid,d,w)=>({id,sessionId:sid,name:'Row (DB)',intensifier:'Straight Sets',strengthMethod:null,template:'a',block:1,setNumber:1,w,reps:10,rir:2,date:evDay(d)});
 await evSeed(p,[mk('a','x0',20,100),mk('b','x1',13,100),mk('c','x2',7,100)],[]);const d=await decision(p);assert.strictEqual(d.vals.length,3);
});

// =====================================================================
// EN4: NEXT target anchors on the last logged set
// =====================================================================
test('EN4a','Defect reproduced: after a full Top Set + Back-Offs session the NEXT target is built from the TOP set, not from the last (lighter) back-off set',async p=>{
 await evSeed(p,tsb('s0',3),[sess('s0','complete',3)]);const t=await target(p,BENCH,TSB);
 assert(/^200 lb/.test(t),'NEXT anchored on the last logged set: '+t);
});
test('EN4b','A back-off-only partial session does not lower the target: NEXT keeps the most recent TOP set (no performance is inferred from the omitted top set)',async p=>{
 await evSeed(p,[...tsb('s0',9),...tsb('s1',2,{withTop:false})],[sess('s0','complete',9),sess('s1','complete',2)]);const t=await target(p,BENCH,TSB);
 assert(/^200 lb/.test(t),t);
});
test('EN4c','Only back-offs ever logged: no top set exists, so no target weight is invented from a back-off ("Establish ... baseline")',async p=>{
 await evSeed(p,tsb('s0',3,{withTop:false}),[sess('s0','complete',3)]);const t=await target(p,BENCH,TSB);assert(/^Establish/.test(t),t);
});
test('EN4d','Straight Heavy Sets: the target anchors on the best set of the latest session even when the last set was lighter through fatigue; an earlier heavier session does not override the latest one',async p=>{
 const mk=(id,sid,d,w,s)=>({id,sessionId:sid,name:'Squat (BB)',intensifier:'Straight Sets',strengthMethod:'Straight Heavy Sets',template:'a',block:1,setNumber:s,w,reps:5,rir:2,date:evDay(d,s*0.01)});
 await evSeed(p,[mk('a','s0',9,300,1),mk('b','s1',2,250,1),mk('c','s1',2,240,2),mk('d','s1',2,225,3)],[sess('s0','complete',9),sess('s1','complete',2)]);
 const t=await target(p,'Squat (BB)','Straight Heavy Sets');assert(/^250 lb/.test(t),t);
});
test('EN4e','targetMode (intensifier modes) also anchors on the best set of the latest session, not the last logged one; time/rep exercises keep their text',async p=>{
 const mk=(id,sid,d,w,s)=>({id,sessionId:sid,name:'Lat Pulldown',intensifier:'Straight Sets',template:'a',block:1,setNumber:s,w,reps:10,rir:2,date:evDay(d,s*0.01)});
 await evSeed(p,[mk('a','s1',2,120,1),mk('b','s1',2,110,2),mk('c','s1',2,100,3)],[sess('s1','complete',2)]);
 const t=await p.eval(()=>targetMode('Lat Pulldown','Straight Sets'));assert(/^120 lb/.test(t),t);
 const none=await p.eval(()=>targetMode('Lat Pulldown','Myo-Reps'));assert(/^Establish Myo-Reps baseline/.test(none),none);
});
test('EN4f','Target text for the other strength methods is unchanged (no history -> establish baseline; method-specific guidance text identical)',async p=>{
 await evSeed(p,[],[]);assert.strictEqual(await target(p,BENCH,TSB),'Establish Top Set + Back-Offs baseline');
 const mk=(m)=>({id:'a'+m,sessionId:'s0',name:'Farmer Carry (DB)',intensifier:'Straight Sets',strengthMethod:m,template:'a',block:1,setNumber:1,w:100,reps:1,date:evDay(2)});
 await evSeed(p,[mk('Density Progression'),mk('Load / Distance Progression'),mk('Speed / Dynamic Work'),mk('Rep-PR Set')],[sess('s0','complete',2)]);
 assert.strictEqual(await target(p,'Farmer Carry (DB)','Density Progression'),'Match quality, then reduce recovery slightly');
 assert.strictEqual(await target(p,'Farmer Carry (DB)','Load / Distance Progression'),'Beat clean load or distance/time before reducing rest');
 assert.strictEqual(await target(p,'Farmer Carry (DB)','Speed / Dynamic Work'),'Keep load until every rep stays crisp and fast');
 assert.strictEqual(await target(p,'Farmer Carry (DB)','Rep-PR Set'),'Beat clean reps at similar RIR before adding load');
});
test('EN4g','The workout screen shows the corrected NEXT target for the exercise (end to end), using the exercise\'s actual default strength method',async p=>{
 await p.eval(()=>{weekMode='normal'});const name=await p.eval(()=>{start('a');return selected('a',0)});const m=await p.eval(()=>todayStrength(0,selected('a',0)));
 assert([TSB,PPT].includes(m),'slot 0 of Giant A defaults to '+m);
 const rows=tsb('s0',3,{name,top:150,back:[130,130],method:m});await p.eval(r=>{localStorage.pa_hist=JSON.stringify(r)},rows);await p.eval(()=>render());
 const text=await p.eval(()=>[...document.querySelectorAll('#exs .strengthinfo .stat')][0].textContent);
 assert(/NEXT[^]*150 lb/.test(text),text);
});
test('EN4h','Same anchoring for Primer + Paused Top/Back-Offs: top set after a full session, and no weight invented from back-offs alone',async p=>{
 await evSeed(p,tsb('s0',3,{method:PPT}),[sess('s0','complete',3)]);assert(/^200 lb/.test(await target(p,BENCH,PPT)));
 await evSeed(p,[...tsb('s0',9,{method:PPT}),...tsb('s1',2,{method:PPT,withTop:false})],[sess('s0','complete',9),sess('s1','complete',2)]);assert(/^200 lb/.test(await target(p,BENCH,PPT)));
 await evSeed(p,tsb('s0',3,{method:PPT,withTop:false}),[sess('s0','complete',3)]);assert(/^Establish/.test(await target(p,BENCH,PPT)));
});

// =====================================================================
// EN5: safeguards that must hold before and after
// =====================================================================
test('EN5a','Preserved: a finished partial session in which only one exercise was done still adds that exercise\'s exposure; omitted exercises do not read as decline',async p=>{
 const mk=(id,sid,n,d,w)=>({id,sessionId:sid,name:n,intensifier:'Straight Sets',strengthMethod:null,template:'a',block:1,setNumber:1,w,reps:10,rir:2,date:evDay(d)});
 await evSeed(p,[mk('a','s0','Row (DB)',14,100),mk('b','s1','Row (DB)',7,100),mk('c','s2','Row (DB)',2,104),mk('d','s0','Curl (DB)',14,40),mk('e','s1','Curl (DB)',7,40)],[sess('s0','complete',14),sess('s1','complete',7),sess('s2','complete',2)]);
 const d=await decision(p);assert.strictEqual(d.state,'OBSERVE');
});
test('EN5b','Nothing raises a load automatically: the decision functions still only report OBSERVE / INVESTIGATE / ACT about a decline',async p=>{
 const src=await p.eval(()=>[evidenceDecision,targetStrength,targetMode].map(f=>f.toString()).join('\n'));
 assert(!/\.w\s*\+\s*|inc\)?\s*\+(?!\s*\$)/.test(src.replace(/before \+\$\{e\?\.inc\|\|5\} lb/,'')),'a function appears to compute a heavier load');
 assert(/earn reps\/quality before \+\$\{e\?\.inc\|\|5\} lb/.test(src));
});
test('EN5c','Reading evidence never writes: pa_hist and pa_sessions_v2 are byte-identical after every decision and target call',async p=>{
 await evSeed(p,[...tsb('s0',9),...tsb('s1',2,{withTop:false})],[sess('s0','complete',9),sess('s1','draft',2)]);
 const a=await p.eval(()=>[localStorage.pa_hist,localStorage.pa_sessions_v2]);await decision(p);await target(p,BENCH,TSB);await p.eval(()=>{coachSummary();renderAARPage()});
 assert.deepStrictEqual(await p.eval(()=>[localStorage.pa_hist,localStorage.pa_sessions_v2]),a);
});
test('EN5d','Structured intensifier blocks still never enter the evidence series',async p=>{
 const r=(id,sid,d,reps)=>({id,sessionId:sid,name:'Rear-Delt Fly (DB)',intensifier:'Myo-Reps',structured:true,w:30,reps,efforts:[{stage:1,w:30,reps:10}],setNumber:2,date:evDay(d)});
 await evSeed(p,[r('a','s0',20,30),r('b','s1',12,10),r('c','s2',4,5)],[sess('s0'),sess('s1'),sess('s2')]);assert.strictEqual((await decision(p)).name,'SYSTEM');
});
test('EN5e','Full Session prescriptions are untouched: slot table and set counts are unchanged by the evidence code',async p=>{
 const r=await p.eval(()=>{start('a');return Object.fromEntries(Object.keys(slots).map(k=>[k,slots[k].map(s=>s.slice(0,5).join('|'))]))});
 const sum=JSON.stringify(r);assert(sum.length>200);assert.strictEqual(Object.keys(r).length>=3,true);
});
test('EN4i','A finished 200 lb session stays the NEXT anchor when a later 60 lb set is only an unfinished draft; PREVIOUS still shows that 60 lb set',async p=>{
 const rows=[...tsb('s0',9,{top:200,back:[170,170]}),...tsb('s2',3,{top:200,back:[170,170]}),{id:'draft60',sessionId:'s1',name:BENCH,intensifier:'Straight Sets',strengthMethod:TSB,template:'a',block:1,setNumber:1,w:60,reps:5,rir:2,date:evDay(0)}];
 const sessions=[sess('s0','complete',9),sess('s2','complete',3),sess('s1','draft',0)];
 await evSeed(p,rows,sessions);
 const before=await p.eval(()=>[localStorage.pa_hist,localStorage.pa_sessions_v2]);
 const t=await target(p,BENCH,TSB);
 assert(/^200 lb/.test(t),'NEXT used the draft: '+t);
 const d=await decision(p);
 assert(Array.isArray(d.vals)&&d.vals.length===2&&!d.vals.some(v=>v<100),'draft entered evidence: '+JSON.stringify(d));
 const prev=await p.eval((n,m)=>prevStrength(n,m),BENCH,TSB);
 assert(/60 ×/.test(prev),'PREVIOUS hid the draft set: '+prev);
 assert.deepStrictEqual(await p.eval(()=>[localStorage.pa_hist,localStorage.pa_sessions_v2]),before);
});
test('EN4j','Straight-set NEXT ignores an unfinished draft and PREVIOUS still shows its latest set',async p=>{
 const mk=(id,sid,w,days)=>({id,sessionId:sid,name:'Lat Pulldown',intensifier:'Straight Sets',template:'b',block:1,setNumber:1,w,reps:10,rir:2,date:evDay(days)});
 await evSeed(p,[mk('a','s0',120,3),mk('b','s1',60,0)],[sess('s0','complete',3),sess('s1','draft',0)]);
 assert(/^120 lb/.test(await p.eval(()=>targetMode('Lat Pulldown','Straight Sets'))));
 assert(/60 ×/.test(await p.eval(()=>prevMode('Lat Pulldown','Straight Sets'))));
});
test('EN4k','The same 60 lb set becomes the NEXT anchor once its session is finished; a row with no session id stays eligible',async p=>{
 const mk=(id,sid,w)=>({id,sessionId:sid,name:'Lat Pulldown',intensifier:'Straight Sets',template:'b',block:1,setNumber:1,w,reps:10,rir:2,date:evDay(0)});
 await evSeed(p,[mk('a','s0',120),mk('b','s1',60)],[sess('s0','complete',1),sess('s1','complete',0)]);
 assert(/^60 lb/.test(await p.eval(()=>targetMode('Lat Pulldown','Straight Sets'))));
 await evSeed(p,[{id:'legacy',name:'Lat Pulldown',intensifier:'Straight Sets',template:'b',block:1,setNumber:1,w:95,reps:10,rir:2,date:evDay(1)}],[]);
 assert(/^95 lb/.test(await p.eval(()=>targetMode('Lat Pulldown','Straight Sets'))));
 await evSeed(p,[mk('only','s1',60)],[sess('s1','draft',0)]);
 assert(/^Establish/.test(await p.eval(()=>targetMode('Lat Pulldown','Straight Sets'))));
});

const baseSlots=JSON.parse(fs.readFileSync(path.join(__dirname,'../audit/data/baseline/slots.json'),'utf8'));
const slotSig=rows=>rows.map(s=>s.slice(0,5).join('|')).join('||');
const headings=p=>p.eval(()=>[...document.querySelectorAll('#exs h3, #exs .exhead > small')].map(el=>el.textContent.trim()));
test('EVO1','3.0 Evolution keeps Giant A prescriptions and inserts the approved optional items in order',async p=>{
 await p.eval(()=>localStorage.setItem('pa_program_v1','evo30'));await p.goto(ctx.origin+'/');
 const seq=await p.eval(()=>{start('a');return [...document.querySelectorAll('#exs h3, #exs .exhead > small')].map(el=>el.textContent.trim())});
 const at=s=>seq.indexOf(s);
 assert(at('Giant A WARM-UP')<at('Power Primer — Medicine-Ball Chest Pass')&&at('Power Primer — Medicine-Ball Chest Pass')<at('Horizontal Press'),seq.join(' | '));
 assert(at('Loaded Carry')<at('Trunk Control — Dead Bug')&&at('Trunk Control — Dead Bug')<at('Giant A COOLDOWN'),seq.join(' | '));
 const text=await p.eval(()=>document.getElementById('exs').textContent);
 assert(/3 sets × 3 explosive reps/.test(text)&&/2 sets × 8 controlled reps per side/.test(text));
 const live=await p.eval(()=>['a','b','c'].map(k=>slots[k].map(s=>s.slice(0,5).join('|')).join('||')).join('\n'));
 assert.strictEqual(live,['a','b','c'].map(k=>slotSig(baseSlots[k])).join('\n'));
 const hist=await p.eval(()=>{document.querySelector('[data-check="evo:mb:0"]').click();return localStorage.pa_hist||''});
 assert(!/Medicine-Ball|Dead Bug/.test(hist));
 const kept=await p.eval(()=>{const id=currentSession.id;render();return currentSession.checks['evo:mb:0']===true&&document.querySelector('[data-check="evo:mb:0"]').classList.contains('y')&&sessions.find(s=>s.id===id).status==='draft'});
 assert.strictEqual(kept,true);
 await p.eval(()=>finishSession());
 const done=await p.eval(()=>sessions.some(s=>s.template==='a'&&s.status==='complete'&&s.checks['evo:mb:0']===true));
 assert.strictEqual(done,true);
 const resumed=await p.eval(()=>{start('a');document.querySelector('[data-check="evo:dba:0"]').click();const id=currentSession.id;show('home');resumeSession(id);return document.querySelector('[data-check="evo:dba:0"]').classList.contains('y')&&document.getElementById('exs').textContent.includes('Horizontal Press')});
 assert.strictEqual(resumed,true);
});
test('EVO2','HQ 2.3 hides the 3.0 checklists and still opens Giant A and Giant B',async p=>{
 await p.eval(()=>setProgramEdition('hq23'));
 const a=await p.eval(()=>{start('a');return document.getElementById('exs').textContent});
 assert(!a.includes('Medicine-Ball Chest Pass')&&!a.includes('Dead Bug')&&a.includes('Horizontal Press'));
 const b=await p.eval(()=>{start('b');return document.getElementById('exs').textContent});
 assert(!b.includes('Controlled Push-Up')&&b.includes('Hip Hinge'));
});
test('EVO3','Giant B 3.0 adds the push-up after the primary pull and the dead bug at the end',async p=>{
 await p.eval(()=>localStorage.setItem('pa_program_v1','evo30'));await p.goto(ctx.origin+'/');
 const seq=await p.eval(()=>{start('b');return [...document.querySelectorAll('#exs h3, #exs .exhead > small')].map(el=>el.textContent.trim())});
 const at=s=>seq.indexOf(s);
 assert(at('Vertical Pull')<at('Calisthenics — Controlled Push-Up')&&at('Calisthenics — Controlled Push-Up')<at('Hip Hinge'),seq.join(' | '));
 assert(at('Calves')<at('Trunk Control — Dead Bug')&&at('Trunk Control — Dead Bug')<at('Giant B COOLDOWN'),seq.join(' | '));
 const text=await p.eval(()=>document.getElementById('exs').textContent);
 assert(/2 sets × 6–12 reps/.test(text)&&/Do not add weight automatically/.test(text));
 const saved=await p.eval(()=>{document.querySelector('[data-save="evo:pu:var"]').value='Incline';document.querySelector('[data-save="evo:pu:r0"]').value='8';saveDraft();return currentSession.forms['evo:pu:var']+' '+currentSession.forms['evo:pu:r0']+' '+(localStorage.pa_hist||'')});
 assert(saved.startsWith('Incline 8 ')&&!/Push-Up/.test(saved));
});
test('EVO4','Optional plyometric and capability modules are separate, skippable, and do not duplicate Giant C inside the capability session',async p=>{
 await p.eval(()=>localStorage.setItem('pa_program_v1','evo30'));await p.goto(ctx.origin+'/');
 const plyo=await p.eval(()=>{start('evo-plyo');return document.getElementById('exs').textContent});
 assert(/Defer this module/.test(plyo)&&/knee symptoms/.test(plyo)&&plyo.includes('Snap-Down to Stable Landing')&&plyo.includes('Low-Amplitude Pogo Hops'));
 assert(/does not include depth jumps/.test(plyo));
 const cap=await p.eval(()=>{start('evo-cap');return document.getElementById('exs').textContent});
 assert(cap.includes('Strict Pull-Up Practice')&&cap.includes('Suitcase Carry')&&cap.includes('Dead Hang'));
 assert(!cap.includes('Weighted Pull-Up')&&!cap.includes('Hanging Knee Raise'));
 const c=await p.eval(()=>{start('c');return document.getElementById('exs').textContent});
 assert(c.includes('Weighted Pull-Up')&&!c.includes('Medicine-Ball Chest Pass'));
 const payload=await p.eval(()=>backupPayload());
 await p.eval(b=>{validateBackup(b);localStorage.clear();replacePAData(b.data)},payload);
 await p.goto(ctx.origin+'/');
 const again=await p.eval(()=>{const s=JSON.parse(localStorage.pa_sessions_v2).find(x=>x.template==='c');return s&&s.template});
 assert.strictEqual(again,'c');
});

// ---------- runner ----------
(async()=>{
 const server=await serve(appDir),browser=await launch();ctx={browser,origin:server.origin};
 const results=[];let failed=0;
 console.log(`Project America Phase 4 suite (evidence-engine defects)\nApp under test: ${path.resolve(appDir)}\n`);
 try{
  for(const t of tests){
   if(only&&!only.includes(t.id))continue;if(groups&&!groups.includes(t.group))continue;
   let p,error=null;const start=Date.now();
   try{p=await openApp();await t.fn(p)}catch(e){error=e.message.split('\n').slice(0,4).join(' | ').slice(0,520)}
   finally{if(p)await p.close()}
   results.push({id:t.id,group:t.group,title:t.title,pass:!error,error,ms:Date.now()-start});if(error)failed++;
   console.log(`${error?'FAIL':'PASS'} ${t.id.padEnd(5)} ${t.title.slice(0,170)}${error?'\n      → '+error:''}`);
  }
 }finally{await browser.close();await server.close()}
 console.log(`\n${results.length-failed} passed, ${failed} failed, ${results.length} total`);
 if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify({app:path.resolve(appDir),date:new Date().toISOString(),passed:results.length-failed,failed,results},null,1));
 process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=2});

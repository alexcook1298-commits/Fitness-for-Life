'use strict';
// Project America HQ 2.3 reliability regression suite (session status, evidence engine, readiness).
// Usage: node tests/reliability.test.js <appDir> [--json results.json] [--only ID,ID]
// Drives the real app in headless Chrome via the DevTools protocol. Synthetic data only, disposable profiles.
const fs=require('fs'),path=require('path'),assert=require('assert');
const {launch}=require('./lib/cdp');
const {serve}=require('./lib/server');

const args=process.argv.slice(2);
const appDir=args.find(a=>!a.startsWith('--')&&args[args.indexOf(a)-1]!=='--json'&&args[args.indexOf(a)-1]!=='--only');
if(!appDir){console.error('Usage: node tests/reliability.test.js <appDir> [--json out.json] [--only ID,ID]');process.exit(2)}
const jsonOut=args.includes('--json')?args[args.indexOf('--json')+1]:null;
const only=args.includes('--only')?args[args.indexOf('--only')+1].split(','):null;

const tests=[];
const test=(id,group,title,fn)=>tests.push({id,group,title,fn});
let ctx;
const openApp=async()=>{const p=await ctx.browser.newPage(require('os').tmpdir());await p.goto(ctx.origin+'/');return p};
// Anchored to the moment the suite starts: recentSessions() windows are measured against Date.now(), so a fixed calendar anchor would make S1.* fail once the real date passes it.
const ANCHOR=Date.now();
const D=(daysAgo,extra='')=>new Date(ANCHOR-daysAgo*86400000).toISOString();

// ---------- page-side helpers (serialised into the page) ----------
const seedHist=(p,rows)=>p.eval(r=>{localStorage.setItem('pa_hist',JSON.stringify(r))},rows);
const seedSessions=(p,rows)=>p.eval(r=>{localStorage.setItem('pa_sessions_v2',JSON.stringify(r))},rows);
const evidence=p=>p.eval(()=>{const e=evidenceDecision();return {name:e.name,state:e.state,delta:e.delta,vals:e.vals||null}});
const rec=(name,daysAgo,w,reps,extra={})=>({id:`${name}|${daysAgo}|${w}|${reps}|${extra.setNumber||1}|${extra.intensifier||''}`,name,w,reps,rir:2,date:D(daysAgo),...extra});
const straight=(name,daysAgo,w,reps,extra={})=>rec(name,daysAgo,w,reps,{intensifier:'Straight Sets',strengthMethod:null,...extra});

// =====================================================================
// FIX 1 — completed-session status (finishSession writes 'complete')
// =====================================================================
const sess=(id,status,dateField,daysAgo,template='a')=>({id,template,phase:1,weekMode:'normal',status,startedAt:D(daysAgo+0.05),...(dateField?{[dateField]:D(daysAgo)}:{})});

test('S1.1','Fix 1: session status','A session saved with status "complete" (what finishSession writes) is counted by recentSessions(7)',async p=>{
 await seedSessions(p,[sess('s1','complete','finishedAt',1)]);
 assert.strictEqual(await p.eval(()=>recentSessions(7).length),1);
});
test('S1.2','Fix 1: session status','Legacy status "completed" with completedAt remains counted (compatibility)',async p=>{
 await seedSessions(p,[sess('s1','completed','completedAt',1)]);
 assert.strictEqual(await p.eval(()=>recentSessions(7).length),1);
});
test('S1.3','Fix 1: session status','Drafts are never counted; window boundaries respected (7 vs 42 days)',async p=>{
 await seedSessions(p,[sess('d','draft','updatedAt',1),sess('new','complete','finishedAt',2),sess('mid','complete','finishedAt',20),sess('old','complete','finishedAt',60)]);
 const r=await p.eval(()=>({w7:recentSessions(7).map(x=>x.id),w42:recentSessions(42).map(x=>x.id)}));
 assert.deepStrictEqual(r.w7,['new']);assert.deepStrictEqual(r.w42.sort(),['mid','new']);
});
test('S1.4','Fix 1: session status','Complete sessions with missing, invalid or future-garbage dates do not throw and are not miscounted',async p=>{
 await seedSessions(p,[{id:'x1',template:'a',status:'complete'},{id:'x2',template:'a',status:'complete',finishedAt:'not-a-date',startedAt:'also-bad'},sess('ok','complete','finishedAt',1)]);
 const ids=await p.eval(()=>recentSessions(7).map(x=>x.id));
 assert.deepStrictEqual(ids,['ok']);
});
test('S1.5','Fix 1: session status','Empty / malformed pa_sessions_v2 values return zero without throwing',async p=>{
 for(const raw of ['[]','null','{}','"x"','[null,1,"a"]']){
  const n=await p.eval(raw=>{localStorage.setItem('pa_sessions_v2',raw);try{return recentSessions(7).length}catch(e){return 'THROW:'+e.message}},raw);
  assert.strictEqual(n,0,`raw ${raw} -> ${n}`);
 }
});
test('S1.6','Fix 1: session status','End-to-end: a session finished through the real finishSession() flows into Training Budget and Coach Handoff',async p=>{
 const r=await p.eval(()=>{
  localStorage.removeItem('pa_sessions_v2');sessions=[];currentSession=null;
  start('a');const id=currentSession.id;
  upsertHistory('pa_hist',{id:id+'|t',sessionId:id,name:'Bench Press (BB)',intensifier:'Straight Sets',strengthMethod:null,template:'a',block:1,setNumber:1,finalSet:false,date:new Date().toISOString(),w:100,reps:8,rir:2});
  openFinish();finishSession();
  const st=readJSON('pa_sessions_v2',[]).map(x=>x.status);
  return {st,recent7:recentSessions(7).length,budget:budgetData(),coach:coachSummary()};
 });
 assert.deepStrictEqual(r.st,['complete']);
 assert.strictEqual(r.recent7,1);
 assert.strictEqual(r.budget.Strength,1,'budget Strength');
 assert(/Completed sessions: 1\b/.test(r.coach),'coach text: '+r.coach.slice(0,300));
});
test('S1.7','Fix 1: session status','The fix does not mutate stored sessions (read-only compatibility)',async p=>{
 const before=JSON.stringify([sess('s1','complete','finishedAt',1),sess('s2','completed','completedAt',2),sess('d','draft','updatedAt',1)]);
 await p.eval(raw=>localStorage.setItem('pa_sessions_v2',raw),before);
 await p.eval(()=>{recentSessions(7);recentSessions(42);budgetData();coachSummary()});
 assert.strictEqual(await p.eval(()=>localStorage.getItem('pa_sessions_v2')),before);
});
test('S1.8','Fix 1: session status / Training Budget','Training Budget classification is exact: "athletic" counts only as Explosive + Capability and "mobility" only as Low-intensity engine, never as Strength or Hypertrophy (corrected assertion; the original defect assertion is preserved in tests/historical/)',async p=>{
 await seedSessions(p,[sess('m','complete','finishedAt',1,'mobility'),sess('t','complete','finishedAt',1,'athletic')]);
 const b=await p.eval(()=>budgetData());
 assert.strictEqual(b.Hypertrophy,0,'mobility must not count as Hypertrophy');
 assert.strictEqual(b.Strength,0,'athletic must not count as Strength');
 assert.strictEqual(b['Low-intensity engine'],1,'mobility counts as Low-intensity engine');
 assert.strictEqual(b.Explosive,1,'athletic counts as Explosive');assert.strictEqual(b.Capability,1,'athletic counts as Capability');
});

// =====================================================================
// FIX 2 — evidence engine false deterioration
// =====================================================================
test('E1.1','Fix 2: evidence engine','Steady Leg Press 300x8 on 3 dates followed by one Widowmaker 200x20 is NOT flagged ACT/INVESTIGATE',async p=>{
 await seedHist(p,[straight('Leg Press',21,300,8),straight('Leg Press',14,300,8),straight('Leg Press',7,300,8),rec('Leg Press',1,200,20,{intensifier:'Widowmaker',strengthMethod:null})]);
 const e=await evidence(p);assert.strictEqual(e.state,'OBSERVE',JSON.stringify(e));
});
test('E1.2','Fix 2: evidence engine','Progressing leg curl followed by ONE light day is not flagged',async p=>{
 await seedHist(p,[straight('Seated Leg Curl',21,100,10),straight('Seated Leg Curl',14,105,10),straight('Seated Leg Curl',7,110,10),straight('Seated Leg Curl',1,90,10)]);
 const e=await evidence(p);assert.strictEqual(e.state,'OBSERVE',JSON.stringify(e));
});
test('E1.3','Fix 2: evidence engine','Progressing paused-bench method followed by a single back-off-only day is not flagged',async p=>{
 const m={intensifier:'Straight Sets',strengthMethod:'Primer + Paused Top/Back-Offs'};
 await seedHist(p,[rec('Bench Press (BB)',21,200,5,m),rec('Bench Press (BB)',14,205,5,m),rec('Bench Press (BB)',7,210,5,m),rec('Bench Press (BB)',1,170,8,{...m,setNumber:2})]);
 const e=await evidence(p);assert.strictEqual(e.state,'OBSERVE',JSON.stringify(e));
});
test('E1.4','Fix 2: evidence engine','Records of different strength methods for the same exercise are never compared with each other',async p=>{
 const c={intensifier:'Straight Sets',strengthMethod:'Cluster Sets'};
 await seedHist(p,[rec('Chest-Supported Row (DB)',28,100,6,c),rec('Chest-Supported Row (DB)',21,100,6,c),rec('Chest-Supported Row (DB)',14,100,6,c),straight('Chest-Supported Row (DB)',7,60,10),straight('Chest-Supported Row (DB)',1,55,10)]);
 const e=await evidence(p);assert.strictEqual(e.state,'OBSERVE',JSON.stringify(e));
});
test('E1.5','Fix 2: evidence engine','Heavy low-rep exposures are not compared with a later high-rep (>12) exposure of the same exercise',async p=>{
 await seedHist(p,[straight('Hack Squat',28,250,5),straight('Hack Squat',21,250,5),straight('Hack Squat',14,250,5),straight('Hack Squat',7,160,16)]);
 const e=await evidence(p);assert.strictEqual(e.state,'OBSERVE',JSON.stringify(e));
});
test('E1.6','Fix 2: evidence engine','True positive preserved: four consecutive Straight Set exposures declining >5% still raise ACT',async p=>{
 await seedHist(p,[straight('Lat Pulldown',28,150,10),straight('Lat Pulldown',21,145,10),straight('Lat Pulldown',14,140,10),straight('Lat Pulldown',7,130,10)]);
 const e=await evidence(p);assert.strictEqual(e.state,'ACT',JSON.stringify(e));assert.strictEqual(e.name,'Lat Pulldown');
});
test('E1.7','Fix 2: evidence engine','True positive preserved: three consecutive declining exposures raise INVESTIGATE',async p=>{
 await seedHist(p,[straight('Incline Press (DB)',21,80,10),straight('Incline Press (DB)',14,75,10),straight('Incline Press (DB)',7,70,10)]);
 const e=await evidence(p);assert.strictEqual(e.state,'INVESTIGATE',JSON.stringify(e));
});
test('E1.8','Fix 2: evidence engine','Legacy records with no intensifier/strengthMethod fields are still evaluated (as Straight Sets)',async p=>{
 const legacy=(d,w)=>({name:'Cable Curl',w,reps:10,rir:2,date:D(d)});
 await seedHist(p,[legacy(28,60),legacy(21,57),legacy(14,54),legacy(7,50)]);
 const e=await evidence(p);assert.strictEqual(e.state,'ACT',JSON.stringify(e));
});
test('E1.9','Fix 2: evidence engine','Mixed legacy and new-format records of the same exercise form one series',async p=>{
 await seedHist(p,[{name:'Cable Curl',w:60,reps:10,rir:2,date:D(21)},{name:'Cable Curl',w:57,reps:10,rir:2,date:D(14)},straight('Cable Curl',7,54,10)]);
 const e=await evidence(p);assert.strictEqual(e.state,'INVESTIGATE',JSON.stringify(e));
});
test('E1.10','Fix 2: evidence engine','Top set + back-off on the same date: the top set represents the date, steady performance stays OBSERVE',async p=>{
 const m={intensifier:'Straight Sets',strengthMethod:'Top Set + Back-Offs'};
 const day=d=>[rec('Hack Squat',d,200,5,m),rec('Hack Squat',d,170,8,{...m,setNumber:2})];
 await seedHist(p,[...day(21),...day(14),...day(7)]);
 const e=await evidence(p);assert.strictEqual(e.state,'OBSERVE',JSON.stringify(e));
});
test('E1.11','Fix 2: evidence engine','Positive trend and insufficient data still return OBSERVE with unchanged messages',async p=>{
 await seedHist(p,[straight('Pushdown',14,50,10),straight('Pushdown',7,55,10)]);
 const pos=await p.eval(()=>evidenceDecision());assert.strictEqual(pos.state,'OBSERVE');assert(/positive/i.test(pos.why),pos.why);
 await seedHist(p,[]);
 const none=await p.eval(()=>evidenceDecision());assert.strictEqual(none.name,'SYSTEM');assert(/Not enough repeated performance data/.test(none.why));
});
test('E1.12','Fix 2: evidence engine','Structured intensifier records remain excluded from the engine',async p=>{
 const s=(d,w)=>({...rec('Lateral Raise (Cable)',d,w,22,{intensifier:'Myo-Reps',strengthMethod:null}),structured:true,efforts:[]});
 await seedHist(p,[s(28,30),s(21,25),s(14,20),s(7,15)]);
 const e=await evidence(p);assert.strictEqual(e.name,'SYSTEM');
});
test('E1.13','Fix 2: evidence engine','Several exercises: the most deteriorated comparable series is the one reported; a noisy one-off elsewhere is ignored',async p=>{
 await seedHist(p,[
  straight('Lat Pulldown',28,150,10),straight('Lat Pulldown',21,145,10),straight('Lat Pulldown',14,140,10),straight('Lat Pulldown',7,130,10),
  straight('Seated Leg Curl',21,100,10),straight('Seated Leg Curl',14,105,10),straight('Seated Leg Curl',7,110,10),straight('Seated Leg Curl',1,80,10)]);
 const e=await evidence(p);assert.strictEqual(e.name,'Lat Pulldown');assert.strictEqual(e.state,'ACT');
});
test('E1.14','Fix 2: evidence engine','Zero/NaN/missing numeric fields and unknown shapes do not throw',async p=>{
 await seedHist(p,[{name:'X',date:D(3)},{name:'X',w:0,reps:0,date:D(2)},{name:'X',w:'abc',reps:'x',date:D(1)},null,{},{name:'Y',w:50,reps:5}]);
 const r=await p.eval(()=>{try{const e=evidenceDecision();return {ok:true,state:e.state}}catch(e){return {ok:false,msg:e.message}}});
 assert(r.ok,JSON.stringify(r));
});
test('E1.15','Fix 2: evidence engine (incidental hardening)','Exercise names that collide with Object.prototype members do not throw',async p=>{
 await seedHist(p,[straight('constructor',14,50,10),straight('constructor',7,50,10),straight('__proto__',14,50,10),straight('__proto__',7,50,10)]);
 const r=await p.eval(()=>{try{evidenceDecision();return 'ok'}catch(e){return 'THROW '+e.message}});
 assert.strictEqual(r,'ok');
});
test('E1.16','Fix 2: evidence engine','The engine is read-only: pa_hist is unchanged after evaluation',async p=>{
 const rows=[straight('Lat Pulldown',28,150,10),straight('Lat Pulldown',21,145,10),straight('Lat Pulldown',14,140,10),straight('Lat Pulldown',7,130,10),rec('Leg Press',1,200,20,{intensifier:'Widowmaker'})];
 await seedHist(p,rows);const before=JSON.stringify(rows);
 await p.eval(()=>{evidenceDecision();coachSummary();updateOSHome&&updateOSHome()});
 assert.strictEqual(await p.eval(()=>localStorage.getItem('pa_hist')),before);
});

// =====================================================================
// FIX 3 — readiness: severe joint warning cannot be an unqualified GREEN
// =====================================================================
const dec=(p,r)=>p.eval(r=>{const d=readinessDecision(r);return {label:d.label,cls:d.cls,text:d.text,score:readinessScore(r)}},r);
const R=(j,o=5)=>({sleep:o,energy:o,soreness:o,joints:j,motivation:o});
test('R1.1','Fix 3: readiness','Joint status 1/5 with every other item 5/5 is not GREEN and says so',async p=>{
 const d=await dec(p,R(1));assert.notStrictEqual(d.label,'GREEN',JSON.stringify(d));assert.strictEqual(d.label,'RED');assert(/joint/i.test(d.text),d.text);assert(!/Run as programmed/.test(d.text));
});
test('R1.2','Fix 3: readiness','Joint status 2/5 with every other item 5/5 cannot be GREEN (capped at YELLOW, joint-qualified)',async p=>{
 const d=await dec(p,R(2));assert.strictEqual(d.label,'YELLOW',JSON.stringify(d));assert(/joint/i.test(d.text),d.text);assert(!/Run as programmed/.test(d.text));
});
test('R1.3','Fix 3: readiness','Joint status 3/4/5 with otherwise high scores remains GREEN with unchanged text',async p=>{
 for(const j of [3,4,5]){const d=await dec(p,R(j));assert.strictEqual(d.label,'GREEN',`joints ${j}: ${JSON.stringify(d)}`);assert.strictEqual(d.text,'Run as programmed. Optional methods remain optional.')}
});
test('R1.4','Fix 3: readiness','Numeric score is unchanged by the fix (override is classification-only)',async p=>{
 assert.strictEqual((await dec(p,R(1))).score,84);assert.strictEqual((await dec(p,R(2))).score,88);assert.strictEqual((await dec(p,R(5))).score,100);
});
test('R1.5','Fix 3: readiness','Property check over all 3,125 inputs: label never improves, and is identical to the original rule whenever joints >= 3',async p=>{
 const r=await p.eval(()=>{
  const orig=x=>x>=76?'GREEN':x>=58?'YELLOW':'RED',rank={GREEN:0,YELLOW:1,RED:2};let bad=[],n=0,changed=0;
  for(let s=1;s<=5;s++)for(let e=1;e<=5;e++)for(let so=1;so<=5;so++)for(let j=1;j<=5;j++)for(let m=1;m<=5;m++){
   const r={sleep:s,energy:e,soreness:so,joints:j,motivation:m},o=orig(readinessScore(r)),d=readinessDecision(r).label;n++;
   if(rank[d]<rank[o])bad.push(['improved',r]);
   if(j>=3&&d!==o)bad.push(['changed>=3',r]);
   if(j<=2&&d!==o)changed++;
   if(j===1&&d!=='RED')bad.push(['j1-not-red',r]);
   if(j===2&&d==='GREEN')bad.push(['j2-green',r]);
  }
  return {n,bad:bad.slice(0,5),badCount:bad.length,changed};
 });
 assert.strictEqual(r.n,3125);assert.strictEqual(r.badCount,0,JSON.stringify(r.bad));
});
test('R1.6','Fix 3: readiness','Default (never checked-in) state is unchanged: 72, YELLOW',async p=>{
 await p.eval(()=>localStorage.removeItem('pa_os_v2'));
 const d=await p.eval(()=>{const r=osData().readiness;return {label:readinessDecision(r).label,score:readinessScore(r)}});
 assert.deepStrictEqual(d,{label:'YELLOW',score:72});
});
test('R1.7','Fix 3: readiness','String, missing and garbage joint values follow the original defaults (unknown = 3, no override)',async p=>{
 assert.strictEqual((await dec(p,{...R('1')})).label,'RED');
 assert.strictEqual((await dec(p,{sleep:5,energy:5,soreness:5,motivation:5})).label,'GREEN');
 assert.strictEqual((await dec(p,{...R('abc')})).label,'GREEN');
 assert.strictEqual((await dec(p,{...R(0)})).label,'GREEN');
});
test('R1.8','Fix 3: readiness','Other low readiness items alone do not trigger the joint override',async p=>{
 assert.strictEqual((await dec(p,{sleep:1,energy:5,soreness:5,joints:5,motivation:5})).label,'GREEN');
 assert.strictEqual((await dec(p,{sleep:2,energy:2,soreness:2,joints:5,motivation:5})).label,'YELLOW');
});
test('R1.9','Fix 3: readiness','UI: saving a check-in with Joint status 1/5 shows RED on the Readiness page and the Mission Status card',async p=>{
 const r=await p.eval(()=>{
  localStorage.removeItem('pa_os_v2');renderReadinessPage();
  for(const [k,v] of [['sleep',5],['energy',5],['soreness',5],['joints',1],['motivation',5]])document.getElementById('r_'+k).value=v;
  saveReadiness();updateOSHome();
  return {page:document.getElementById('mpBody').innerText,home:document.getElementById('osCommand').innerText};
 });
 assert(/RED/.test(r.page)&&!/GREEN/.test(r.page),r.page.slice(0,200));
 assert(/RED/.test(r.home)&&!/GREEN/.test(r.home),r.home.slice(0,200));
});
test('R1.10','Fix 3: readiness','Coach Handoff reports the qualified label for a joint-flagged check-in',async p=>{
 await p.eval(()=>{const d=osData();d.readiness={...d.readiness,sleep:5,energy:5,soreness:5,joints:1,motivation:5,date:new Date().toISOString()};saveOS(d)});
 const t=await p.eval(()=>coachSummary());assert(/READINESS: RED/.test(t),t.slice(0,200));
});
test('R1.11','Fix 3: readiness','The override does not write or alter stored readiness data',async p=>{
 const os=JSON.stringify({bodyweight:189,mode:'standard',readiness:{...R(1),date:D(1)},tests:{},fuel:{},skill:{},experiments:[],combine:[],notes:[],gymProfiles:[],activeGym:0,friction:[],lifeWins:[],technique:[],availability:{}});
 await p.eval(s=>localStorage.setItem('pa_os_v2',s),os);
 await p.eval(()=>{readinessDecision(osData().readiness);renderReadinessPage();updateOSHome()});
 assert.strictEqual(await p.eval(()=>localStorage.getItem('pa_os_v2')),os);
});

// ---------- runner ----------
(async()=>{
 const server=await serve(appDir),browser=await launch();ctx={browser,origin:server.origin};
 const results=[];let failed=0;
 console.log(`Project America reliability regression suite\nApp under test: ${path.resolve(appDir)}\n`);
 try{
  for(const t of tests){
   if(only&&!only.includes(t.id))continue;
   let p,error=null;const start=Date.now();
   try{p=await openApp();await t.fn(p)}catch(e){error=e.message.split('\n').slice(0,4).join(' | ').slice(0,420)}
   finally{if(p)await p.close()}
   results.push({id:t.id,group:t.group,title:t.title,pass:!error,error,ms:Date.now()-start});if(error)failed++;
   console.log(`${error?'FAIL':'PASS'} ${t.id.padEnd(5)} ${t.title}${error?'\n      → '+error:''}`);
  }
 }finally{await browser.close();await server.close()}
 console.log(`\n${results.length-failed} passed, ${failed} failed, ${results.length} total`);
 if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify({app:path.resolve(appDir),date:new Date().toISOString(),passed:results.length-failed,failed,results},null,1));
 process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=2});

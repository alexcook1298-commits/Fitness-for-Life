'use strict';
// Project America HQ 2.3 — Phase 1 integration suite (items 4 and 5 of the integration brief, plus the restore-failure message).
// Usage: node tests/integration.test.js <appDir> [--json results.json] [--only ID,ID]
// Drives the real app in headless Chrome over the DevTools protocol. Synthetic data, disposable profiles.
// Written BEFORE the implementation: on the reliability-patched candidate the INT-B, INT-R and INT-K1 groups fail.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const {launch}=require('./lib/cdp');
const {serve}=require('./lib/server');
const {buildDataset}=require('./fixtures');
const clock=require('./lib/clock');

const args=process.argv.slice(2);
const appDir=args.find(a=>!a.startsWith('--')&&args[args.indexOf(a)-1]!=='--json'&&args[args.indexOf(a)-1]!=='--only');
if(!appDir){console.error('Usage: node tests/integration.test.js <appDir> [--json out.json] [--only ID,ID]');process.exit(2)}
const jsonOut=args.includes('--json')?args[args.indexOf('--json')+1]:null;
const only=args.includes('--only')?args[args.indexOf('--only')+1].split(','):null;
const work=fs.mkdtempSync(path.join(os.tmpdir(),'pa-int-'));
const dl=path.join(work,'downloads');fs.mkdirSync(dl);

const tests=[];
const test=(id,group,title,fn)=>tests.push({id,group,title,fn});
let ctx;
const openApp=async()=>{const p=await ctx.browser.newPage(dl);await p.goto(ctx.origin+'/');return p};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fileCounter=0;
const writeBackup=obj=>{const f=path.join(work,`backup-${++fileCounter}.json`);fs.writeFileSync(f,typeof obj==='string'?obj:JSON.stringify(obj,null,2));return f};
const payload=data=>({format:'project-america-full-backup',version:1,appVersion:'2.3',createdAt:'2026-10-12T09:00:00.000Z',data});
const ROLLBACK1='pa_restore_rollback',ROLLBACK2='pa_restore_rollback_2';
const storage=p=>p.eval(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
const pickPA=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k.startsWith('pa_')&&k!==ROLLBACK1&&k!==ROLLBACK2));
async function seed(p,map,reload=true){await p.eval(m=>{localStorage.clear();for(const [k,v] of Object.entries(m))localStorage.setItem(k,v)},map);if(reload)await p.reload()}
async function openBackupPage(p){await p.click('#n-more');await p.click('button.moreitem[onclick="morePage(\'data\')"]');await p.waitForFunction('!!document.querySelector("#morepage input[type=file]")')}
async function importViaUI(p,file){
 await openBackupPage(p);await p.eval('document.getElementById("importPreview").textContent=""');
 await p.setFile('#morepage input[type=file]',file);
 await p.waitForFunction('document.getElementById("importPreview").textContent.trim().length>0',20000);
 return p.eval(()=>({text:document.getElementById('importPreview').textContent,canRestore:[...document.querySelectorAll('#importPreview button')].some(b=>b.textContent.trim()==='RESTORE THIS BACKUP')}));
}
async function restoreViaUI(p){
 const reloaded=p.waitForLoad(30000).then(()=>true,()=>false);
 // A notice left over from an earlier failed restore on the same page must not be mistaken for this attempt's outcome.
 await p.eval(()=>{const n=document.getElementById('appNotice');n.textContent='';n.classList.add('hidden')});
 await p.click('button','RESTORE THIS BACKUP');
 const outcome=await Promise.race([reloaded,p.waitForFunction('!document.getElementById("appNotice").classList.contains("hidden")&&/Restore failed|could not|rollback/i.test(document.getElementById("appNotice").textContent)',30000).then(()=>false,()=>null)]);
 if(outcome){await p.waitForFunction('typeof validateBackup==="function"&&document.readyState==="complete"');return {reloaded:true}}
 return {reloaded:false,notice:await p.eval('document.getElementById("appNotice").textContent')};
}
const sess=(id,template,status='complete',daysAgo=1)=>({id,template,phase:1,weekMode:'normal',status,startedAt:new Date(Date.now()-daysAgo*86400000-3600000).toISOString(),...(status==='complete'?{finishedAt:new Date(Date.now()-daysAgo*86400000).toISOString()}:{}),forms:{},checks:{},choices:{},modes:{},clusters:{}});
const seedSessions=(p,rows)=>p.eval(r=>{localStorage.setItem('pa_sessions_v2',JSON.stringify(r))},rows);

// =====================================================================
// INT-B  Training Budget classification (item 4) — exact template matching
// =====================================================================
const budgetOf=async(p,templates)=>{await seedSessions(p,templates.map((t,i)=>sess('b'+i,t)));return p.eval(()=>budgetData())};
const ZERO={Strength:0,Hypertrophy:0,Explosive:0,'High-intensity engine':0,'Low-intensity engine':0,Capability:0};
const expectBudget=(got,over)=>assert.deepStrictEqual(got,{...ZERO,...over});

test('B1','INT-B: budget classification','Giant A counts as Strength only',async p=>expectBudget(await budgetOf(p,['a']),{Strength:1}));
test('B2','INT-B: budget classification','Giant B, B-Upper and B-Lower count as Hypertrophy only',async p=>expectBudget(await budgetOf(p,['b','bu','bl']),{Hypertrophy:3}));
test('B3','INT-B: budget classification','Athletic counts as Explosive and Capability, and NOT as Strength',async p=>expectBudget(await budgetOf(p,['athletic']),{Explosive:1,Capability:1}));
test('B4','INT-B: budget classification','Mobility counts as Low-intensity engine only, and NOT as Hypertrophy',async p=>expectBudget(await budgetOf(p,['mobility']),{'Low-intensity engine':1}));
test('B5','INT-B: budget classification','Conditioning counts as High-intensity engine only',async p=>expectBudget(await budgetOf(p,['conditioning']),{'High-intensity engine':1}));
test('B6','INT-B: budget classification','Block A variants (b2a…b7a) count as Strength only; block B variants (b2b…b7b, b3c) as Hypertrophy only',async p=>{
 expectBudget(await budgetOf(p,['b2a','b3a','b4a','b5a','b6a','b7a']),{Strength:6});
 expectBudget(await budgetOf(p,['b2b','b3b','b3c','b4b','b5b','b6b','b7b']),{Hypertrophy:7});
});
test('B7','INT-B: budget classification','Optional bonus sessions count as Hypertrophy only (previously also Strength)',async p=>expectBudget(await budgetOf(p,['bonusarms','bonusback']),{Hypertrophy:2}));
test('B8','INT-B: budget classification','Practice and skill sessions whose purpose the source does not settle are not counted in any bar (Phase 2: Giant C now counts as Capability; see tests/phase2.test.js BU1-BU9 for the full model)',async p=>{
 expectBudget(await budgetOf(p,['bodycontrol','athletepractice','carrypractice','combatintro','waterpractice','practicalskills']),{});
 expectBudget(await budgetOf(p,['c']),{Capability:1});
});
test('B9','INT-B: budget classification','A mixed week totals correctly: A + B + athletic + conditioning + mobility',async p=>expectBudget(await budgetOf(p,['a','b','athletic','conditioning','mobility']),{Strength:1,Hypertrophy:1,Explosive:1,Capability:1,'High-intensity engine':1,'Low-intensity engine':1}));
test('B10','INT-B: budget classification','Training Budget page shows the corrected counts',async p=>{
 await seedSessions(p,[sess('x1','athletic'),sess('x2','mobility')]);
 const t=await p.eval(()=>{renderBudgetPage();return document.getElementById('mpBody').innerText});
 const row=n=>(t.match(new RegExp(n+'\\s*\\n?\\s*(\\d+) exposure'))||[])[1];
 assert.strictEqual(row('Strength'),'0',t);assert.strictEqual(row('Hypertrophy'),'0',t);assert.strictEqual(row('Explosive'),'1',t);assert.strictEqual(row('Low-intensity engine'),'1',t);
});
test('B11','INT-B: budget classification','Drafts and sessions older than 7 days are still excluded',async p=>{
 await seedSessions(p,[sess('d1','a','draft',1),sess('o1','a','complete',9),sess('n1','a','complete',2)]);
 expectBudget(await p.eval(()=>budgetData()),{Strength:1});
});
test('B12','INT-B: budget classification','Budget classification is read-only: stored sessions are unchanged',async p=>{
 await seedSessions(p,[sess('a1','a')]);const before=await p.eval(()=>localStorage.getItem('pa_sessions_v2'));
 await p.eval(()=>{budgetData();renderBudgetPage()});assert.strictEqual(await p.eval(()=>localStorage.getItem('pa_sessions_v2')),before);
});

// =====================================================================
// INT-R  Stale-readiness detection and warnings (item 5)
// =====================================================================
const hoursAgo=h=>`new Date(Date.now()-(${h})*3600000).toISOString()`;
async function setReadiness(p,vals,ageHours){
 await p.eval(`(()=>{const d=osData();d.readiness=Object.assign({},${JSON.stringify(vals)},{date:${ageHours===null?'null':ageHours===undefined?'undefined':hoursAgo(ageHours)}});if(${ageHours===undefined})delete d.readiness.date;saveOS(d)})()`);
}
const ALL5={sleep:5,energy:5,soreness:5,joints:5,motivation:5};
const home=p=>p.eval(()=>{updateOSHome();return {card:document.getElementById('osCommand').innerText,dir:document.getElementById('osDirective').innerText}});
const readinessPage=p=>p.eval(()=>{renderReadinessPage();return document.getElementById('mpBody').innerText});
const coach=p=>p.eval(()=>coachSummary());

test('R1','INT-R: stale readiness','A check-in saved 1 hour ago is fresh: still GREEN with no stale warning (current behaviour preserved)',async p=>{
 await setReadiness(p,ALL5,1);const h=await home(p);
 assert(/GREEN/.test(h.card),h.card);assert(!/STALE|NOT CHECKED IN/i.test(h.card+h.dir),h.card);
});
test('R2','INT-R: stale readiness','The freshness rule is the local calendar day (Phase 2 replaced the provisional 48-hour threshold): 2 h earlier the same day is fresh, 30 h earlier is stale',async p=>{
 const r=await p.eval(()=>[2,30].map(h=>readinessFreshness({sleep:5,energy:5,soreness:5,joints:5,motivation:5,date:new Date(Date.now()-h*3600000).toISOString()}).state));
 assert.deepStrictEqual(r,['fresh','stale']);
});
test('R3','INT-R: stale readiness','A GREEN check-in from 6 days ago is NOT shown as GREEN on Home; a visible stale warning gives its age',async p=>{
 await setReadiness(p,ALL5,6*24);const h=await home(p);
 assert(!/GREEN/.test(h.card+h.dir),'stale GREEN still shown: '+h.card);
 assert(/STALE CHECK-IN/.test(h.card),h.card);assert(/6 days ago/.test(h.card+h.dir),h.card+h.dir);
});
test('R4','INT-R: stale readiness','Never checked in (no saved date) shows NOT CHECKED IN instead of a YELLOW score',async p=>{
 await p.eval(()=>localStorage.removeItem('pa_os_v2'));const h=await home(p);
 assert(/NOT CHECKED IN/.test(h.card),h.card);assert(!/YELLOW/.test(h.card),h.card);
});
test('R5','INT-R: stale readiness','A stored joint flag is never hidden by staleness: joints 1/5 from 10 days ago still shows RED, with the stale note',async p=>{
 await setReadiness(p,{...ALL5,joints:1},10*24);const h=await home(p);
 assert(/RED/.test(h.card),h.card);assert(/10 days ago/.test(h.card+h.dir),h.card+h.dir);assert(/joint flag still applies/i.test(h.dir+h.card),h.dir);
});
test('R6','INT-R: stale readiness','Joints 2/5 from 10 days ago still shows YELLOW (not GREEN), with the stale note',async p=>{
 await setReadiness(p,{...ALL5,joints:2},10*24);const h=await home(p);
 assert(/YELLOW/.test(h.card)&&!/GREEN/.test(h.card),h.card);assert(/10 days ago/.test(h.card+h.dir));
});
test('R7','INT-R: stale readiness','A missing, null or unreadable date is treated as never checked in (no exception)',async p=>{
 for(const date of [undefined,null,'','not-a-date',12345678]){
  await p.eval(d=>{const o=osData();o.readiness={sleep:5,energy:5,soreness:5,joints:5,motivation:5};if(d!==undefined)o.readiness.date=d;saveOS(o)},date===undefined?undefined:date);
  const s=await p.eval(()=>readinessFreshness(osData().readiness).state);
  assert(s==='never'||s==='stale'||s==='future',String(date)+' -> '+s);
  const h=await home(p);assert(!/GREEN/.test(h.card),String(date)+': '+h.card);
 }
});
test('R8','INT-R: stale readiness','A check-in dated in the future (clock or time-zone change) is flagged, not trusted as fresh',async p=>{
 await setReadiness(p,ALL5,-72);const h=await home(p);
 assert(!/GREEN/.test(h.card),h.card);assert(/future|clock/i.test(h.card+h.dir),h.card+h.dir);
});
test('R9','INT-R: stale readiness','Readiness page: stale check-in shows the warning and the age, and still offers SAVE CHECK-IN',async p=>{
 await setReadiness(p,ALL5,5*24);const t=await readinessPage(p);
 assert(/STALE CHECK-IN/.test(t),t.slice(0,300));assert(/5 days ago/.test(t),t.slice(0,300));assert(/SAVE CHECK-IN/.test(t));assert(!/GREEN/.test(t),t.slice(0,300));
});
test('R10','INT-R: stale readiness','Coach Handoff states the check-in is stale and how old it is, not an unqualified label',async p=>{
 await setReadiness(p,ALL5,6*24);const t=await coach(p);
 assert(/READINESS: STALE CHECK-IN/.test(t),t.slice(0,300));assert(/6 days/.test(t));assert(!/READINESS: GREEN/.test(t));
});
test('R11','INT-R: stale readiness','Saving a new check-in makes the status current immediately',async p=>{
 await setReadiness(p,ALL5,9*24);
 await p.eval(()=>{renderReadinessPage();for(const [k,v] of [['sleep',5],['energy',5],['soreness',5],['joints',5],['motivation',5]])document.getElementById('r_'+k).value=v;saveReadiness();updateOSHome()});
 const h=await home(p);assert(/GREEN/.test(h.card)&&!/STALE/.test(h.card),h.card);
});
test('R12','INT-R: stale readiness','readinessDecision itself is unchanged by staleness (classification guard from the reliability patch)',async p=>{
 const r=await p.eval(()=>[readinessDecision({sleep:5,energy:5,soreness:5,joints:5,motivation:5,date:'2020-01-01T00:00:00.000Z'}).label,readinessDecision({sleep:5,energy:5,soreness:5,joints:1,motivation:5,date:null}).label,readinessDecision({sleep:3,energy:3,soreness:4,joints:4,motivation:4,date:null}).label]);
 assert.deepStrictEqual(r,['GREEN','RED','YELLOW']);
});
test('R13','INT-R: stale readiness','Rendering and classifying readiness never writes or alters stored data',async p=>{
 await setReadiness(p,{...ALL5,joints:2},20*24);const before=await p.eval(()=>localStorage.getItem('pa_os_v2'));
 await home(p);await readinessPage(p);await coach(p);
 assert.strictEqual(await p.eval(()=>localStorage.getItem('pa_os_v2')),before);
});
test('R14','INT-R: stale readiness','Fresh check-ins of every joint level are classified exactly as before (no stale text anywhere)',async p=>{
 for(const j of [1,2,3,4,5]){
  await setReadiness(p,{...ALL5,joints:j},2);const h=await home(p),t=await readinessPage(p);
  assert(!/STALE|NOT CHECKED IN/i.test(h.card+h.dir+t),'joints '+j);
  const want=j===1?'RED':j===2?'YELLOW':'GREEN';assert(h.card.includes(want),`joints ${j}: ${h.card}`);
 }
});
test('R15','INT-R: stale readiness','Backup round trip preserves the saved readiness date, so staleness is the same after restore',async p=>{
 await setReadiness(p,ALL5,4*24);const before=await p.eval(()=>osData().readiness.date);
 const bk=await p.eval(()=>backupPayload());const r=await importViaUI(p,writeBackup(bk));assert(r.canRestore,r.text);
 assert((await restoreViaUI(p)).reloaded);
 assert.strictEqual(await p.eval(()=>osData().readiness.date),before);assert.strictEqual(await p.eval(()=>readinessFreshness(osData().readiness).state),'stale');
});

// =====================================================================
// INT-K  Restore-failure honesty (previously identified edge case)
// =====================================================================
const SMALL=()=>payload({pa_hist:'[]',pa_week_mode:'busy'});
async function failDataWrites(p){await p.eval(()=>{window.__realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).startsWith('pa_restore_rollback'))return window.__realSet.call(this,k,v);throw new DOMException('forced failure','QuotaExceededError')}})}
async function failEveryWrite(p){await p.eval(()=>{window.__realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('forced failure','QuotaExceededError')}})}
async function failFirstDataWrite(p){await p.eval(()=>{window.__realSet=Storage.prototype.setItem;let hit=0;Storage.prototype.setItem=function(k,v){if(!String(k).startsWith('pa_restore_rollback')&&hit++===0)throw new DOMException('forced failure','QuotaExceededError');return window.__realSet.call(this,k,v)}})}
async function healWrites(p){await p.eval(()=>{if(window.__realSet)Storage.prototype.setItem=window.__realSet})}
async function startRestore(p,original,mode){
 await seed(p,original);const r=await importViaUI(p,writeBackup(SMALL()));assert(r.canRestore,r.text);
 await mode(p);return restoreViaUI(p);
}

test('K1','INT-K: restore-failure honesty','When the restore fails AND putting the original data back also fails, the message does not claim the data was retained, and points to the snapshot',async p=>{
 const A=await p.eval(buildDataset);
 const out=await startRestore(p,A,failDataWrites);assert(!out.reloaded);
 assert(!/original data was retained/i.test(out.notice),'misleading: '+out.notice);
 assert(/snapshot/i.test(out.notice),'does not mention the snapshot: '+out.notice);
});
test('K2','INT-K: restore-failure honesty','After that failure the pre-restore snapshot still holds ALL the original data and re-imports through the normal UI',async p=>{
 const A=await p.eval(buildDataset);await startRestore(p,A,failDataWrites);
 await healWrites(p);
 const snap=JSON.parse(await p.eval(k=>localStorage.getItem(k),ROLLBACK1));
 assert.strictEqual(snap.format,'project-america-full-backup');
 assert.deepStrictEqual(snap.data,pickPA(A),'snapshot differs from the original data');
 const r=await importViaUI(p,writeBackup(snap));assert(r.canRestore,r.text);
 assert((await restoreViaUI(p)).reloaded);assert.deepStrictEqual(pickPA(await storage(p)),pickPA(A),'original not recovered');
});
test('K3','INT-K: restore-failure honesty','When every write fails (not even a snapshot can be stored), restore is refused, nothing changes, and the message says so',async p=>{
 const A=await p.eval(buildDataset);await seed(p,A);
 const r=await importViaUI(p,writeBackup(SMALL()));assert(r.canRestore);await failEveryWrite(p);
 const out=await restoreViaUI(p);assert(!out.reloaded);assert(/nothing was changed/i.test(out.notice),out.notice);
 await healWrites(p);assert.deepStrictEqual(pickPA(await storage(p)),pickPA(A));
});
test('K4','INT-K: restore-failure honesty','A transient failure that the rollback survives still says the original data was retained, and storage is byte-identical',async p=>{
 const A=await p.eval(buildDataset);await seed(p,A);const before=await storage(p);
 const r=await importViaUI(p,writeBackup(SMALL()));assert(r.canRestore);await failFirstDataWrite(p);
 const out=await restoreViaUI(p);assert(!out.reloaded);assert(/original data was retained/i.test(out.notice),out.notice);
 await healWrites(p);const after=await storage(p);
 assert.deepStrictEqual(pickPA(after),pickPA(before),'data changed');
});
test('K5','INT-K: restore-failure honesty','A normal successful restore is unchanged: reloads, replaces the data, keeps a snapshot',async p=>{
 const A=await p.eval(buildDataset);await seed(p,A);
 const r=await importViaUI(p,writeBackup(SMALL()));assert(r.canRestore);const out=await restoreViaUI(p);assert(out.reloaded);
 const s=await storage(p);assert.strictEqual(s.pa_hist,'[]');assert(s[ROLLBACK1]);assert.deepStrictEqual(JSON.parse(s[ROLLBACK1]).data,pickPA(A));
});

// ---------- runner ----------
(async()=>{
 const server=await serve(appDir),browser=await launch();ctx={browser,origin:server.origin};
 const results=[];let failed=0;
 console.log(`Project America integration suite (items 4, 5 and restore-failure honesty)\nApp under test: ${path.resolve(appDir)}\n`);
 try{
  for(const t of tests){
   if(only&&!only.includes(t.id))continue;
   let p,error=null;const start=Date.now();
   try{p=await openApp();if(t.group==='INT-R'&&t.id!=='R15')await clock.freezeLocal(p,2026,10,19,12,0,0);await t.fn(p)}catch(e){error=e.message.split('\n').slice(0,4).join(' | ').slice(0,420)}
   finally{if(p)await p.close()}
   results.push({id:t.id,group:t.group,title:t.title,pass:!error,error,ms:Date.now()-start});if(error)failed++;
   console.log(`${error?'FAIL':'PASS'} ${t.id.padEnd(4)} ${t.title}${error?'\n      → '+error:''}`);
  }
 }finally{await browser.close();await server.close()}
 console.log(`\n${results.length-failed} passed, ${failed} failed, ${results.length} total`);
 if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify({app:path.resolve(appDir),date:new Date().toISOString(),passed:results.length-failed,failed,results},null,1));
 process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=2});

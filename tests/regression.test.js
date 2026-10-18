'use strict';
// Project America HQ backup/restore regression suite.
// Usage: node tests/regression.test.js <appDir> [--json results.json] [--only ID,ID]
// Drives the real app in locally installed headless Chrome via the DevTools protocol.
// Uses synthetic data in disposable browser profiles only; external requests are recorded and asserted absent.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const {launch}=require('./lib/cdp');
const {serve}=require('./lib/server');
const {buildDataset,buildHostileOS}=require('./fixtures');

const args=process.argv.slice(2);
const appDir=args.find(a=>!a.startsWith('--')&&args[args.indexOf(a)-1]!=='--json'&&args[args.indexOf(a)-1]!=='--only');
if(!appDir){console.error('Usage: node tests/regression.test.js <appDir> [--json out.json] [--only ID,ID]');process.exit(2)}
const jsonOut=args.includes('--json')?args[args.indexOf('--json')+1]:null;
const only=args.includes('--only')?args[args.indexOf('--only')+1].split(','):null;
const work=fs.mkdtempSync(path.join(os.tmpdir(),'pa-tests-'));
const dl=path.join(work,'downloads');fs.mkdirSync(dl);

const tests=[];
const test=(id,group,title,fn)=>tests.push({id,group,title,fn});
let fileCounter=0;
const writeBackup=(obj,name='backup')=>{const f=path.join(work,`${name}-${++fileCounter}.json`);fs.writeFileSync(f,typeof obj==='string'?obj:JSON.stringify(obj,null,2));return f};
const payload=data=>({format:'project-america-full-backup',version:1,appVersion:'2.3',createdAt:'2026-10-12T09:00:00.000Z',data});
const ROLLBACK1='pa_restore_rollback',ROLLBACK2='pa_restore_rollback_2';

// ---------- UI helpers ----------
let ctx;
async function openApp(){const p=await ctx.browser.newPage(dl);await p.goto(ctx.origin+'/');return p}
const storage=p=>p.eval(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
async function seed(p,map,reload=true){await p.eval(m=>{localStorage.clear();for(const [k,v] of Object.entries(m))localStorage.setItem(k,v)},map);if(reload)await p.reload()}
const dataset=p=>p.eval(buildDataset);
// Same dataset minus the content that triggers defects 1–3 (pa_os_v2, pa_strength_hist, '<'/'>' in cluster notes),
// so a baseline failure in another test is attributable to that test's own subject.
async function isolatedDataset(p){const d=await dataset(p);delete d.pa_os_v2;delete d.pa_strength_hist;d.pa_hist=JSON.stringify(JSON.parse(d.pa_hist).map(x=>x.clusterSplit?{...x,clusterSplit:x.clusterSplit.replace(/[<>]/g,'')}:x));return d}
async function openBackupPage(p){await p.click('#n-more');await p.click('button.moreitem[onclick="morePage(\'data\')"]');await p.waitForFunction('!!document.querySelector("#morepage input[type=file]")')}
async function exportViaUI(p){await openBackupPage(p);const d=await p.download(()=>p.click('button','EXPORT FULL BACKUP'));return {file:d.file,json:JSON.parse(fs.readFileSync(d.file,'utf8'))}}
async function importViaUI(p,file){
 await openBackupPage(p);await p.eval('document.getElementById("importPreview").textContent=""');
 await p.setFile('#morepage input[type=file]',file);
 await p.waitForFunction('document.getElementById("importPreview").textContent.trim().length>0',20000);
 return p.eval(()=>({text:document.getElementById('importPreview').textContent,canRestore:[...document.querySelectorAll('#importPreview button')].some(b=>b.textContent.trim()==='RESTORE THIS BACKUP')}));
}
async function restoreViaUI(p){
 const reloaded=p.waitForLoad(30000).then(()=>true,()=>false);
 await p.click('button','RESTORE THIS BACKUP');
 const outcome=await Promise.race([reloaded,p.waitForFunction('!document.getElementById("appNotice").classList.contains("hidden")&&/Restore failed|could not/i.test(document.getElementById("appNotice").textContent)',30000).then(()=>false,()=>null)]);
 if(outcome){await p.waitForFunction('typeof validateBackup==="function"&&document.readyState==="complete"');return {reloaded:true}}
 return {reloaded:false,notice:await p.eval('document.getElementById("appNotice").textContent')};
}
async function restoreFile(p,obj){const r=await importViaUI(p,writeBackup(obj));assert(r.canRestore,'Valid backup was not accepted: '+r.text);const out=await restoreViaUI(p);assert(out.reloaded,'Restore did not complete: '+out.notice);return out}
const pickPA=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k.startsWith('pa_')&&k!==ROLLBACK1&&k!==ROLLBACK2));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pwned(p){await sleep(250);return p.eval('({pwned:window.__pwned||[],injected:document.querySelectorAll("img[src=\'x\'],[onerror]").length})')}
const OS_PAGES=['athlete','readiness','capability','combine','budget','lab','simulator','aar','adaptive','schedule','gyms','friction','story','technique','coach'];
async function snapshotJSON(raw){const x=JSON.parse(raw);return x&&x.format?x.data:x}

// =====================================================================
// DEFECT 1 — pa_os_v2 backup rejection
// =====================================================================
test('D1.1','Defect 1: pa_os_v2','Full backup containing saved OS state (pa_os_v2) exported from the UI is accepted and restored byte-identically',async p=>{
 const data=await dataset(p);await seed(p,data);
 const exp=await exportViaUI(p);assert.strictEqual(exp.json.data.pa_os_v2,data.pa_os_v2,'export lost pa_os_v2');
 await p.eval(()=>{const d=osData();d.lifeWins.push({text:'changed after export',date:new Date().toISOString()});saveOS(d)});
 const r=await importViaUI(p,exp.file);assert(r.canRestore,'Backup rejected: '+r.text);
 const out=await restoreViaUI(p);assert(out.reloaded,'Restore failed: '+out.notice);
 assert.strictEqual((await storage(p)).pa_os_v2,data.pa_os_v2);
});
test('D1.2','Defect 1: pa_os_v2','Older full backup without pa_os_v2 still restores and leaves no OS key behind',async p=>{
 const data=await dataset(p);delete data.pa_os_v2;await seed(p,{...data,pa_os_v2:'{"bodyweight":1}'});
 await restoreFile(p,payload(data));const s=await storage(p);assert(!('pa_os_v2' in s));assert.deepStrictEqual(pickPA(s),data);
});

// =====================================================================
// DEFECT 2 — pa_strength_hist treated as a strength-method preference
// =====================================================================
test('D2.1','Defect 2: pa_strength_hist','Heavy primer logged through the real Giant A UI produces a backup that validates and restores',async p=>{
 await p.click('#homePlan button.tpl','Giant ACore workout');
 await p.waitForFunction('!!document.querySelector("#exs [data-record=primer]")');
 const key=await p.eval(()=>document.querySelector('#exs input[data-save^="primer:0:"][data-save$=":w"]').dataset.save);
 await p.type(`#exs input[data-save="${key}"]`,'245');await p.click('#exs button[data-record="primer"]');
 await p.waitForFunction('JSON.parse(localStorage.pa_strength_hist||"[]").length===1');
 const exp=await exportViaUI(p);assert(exp.json.data.pa_strength_hist);
 const r=await importViaUI(p,exp.file);assert(r.canRestore,'Backup rejected: '+r.text);
 const before=(await storage(p)).pa_strength_hist;assert((await restoreViaUI(p)).reloaded);assert.strictEqual((await storage(p)).pa_strength_hist,before);
});
test('D2.2','Defect 2: pa_strength_hist','Strength-method preference keys are still validated (unknown method rejected)',async p=>{
 const data=await isolatedDataset(p);data['pa_strength_a_1_'+(await p.eval('baseSlots.a[1][1][0]'))]='Mystery Method';
 const r=await importViaUI(p,writeBackup(payload(data)));assert(!r.canRestore);assert.match(r.text,/strength method/i);
});
test('D2.3','Defect 2: pa_strength_hist','pa_strength_hist records still receive history-record validation (non-list rejected)',async p=>{
 const data=await isolatedDataset(p);data.pa_strength_hist='{"not":"a list"}';
 const r=await importViaUI(p,writeBackup(payload(data)));assert(!r.canRestore);assert.match(r.text,/pa_strength_hist/);
});

// =====================================================================
// DEFECT 3 — cluster-split notes containing < or > block restore
// =====================================================================
test('D3.1','Defect 3: cluster-split notes','Cluster-split note with < and > logged through the real workout UI backs up and restores',async p=>{
 await p.click('#homePlan button.tpl','Giant ACore workout');
 await p.waitForFunction('!!document.querySelector("#exs input[data-save$=clusterSplit]")');
 const prefix=await p.eval(()=>{const el=document.querySelector('#exs input[data-save$="clusterSplit"]');el.closest('.straight-set-block').querySelector('button[data-record="straight"]').id='__log';return el.dataset.save.replace(/clusterSplit$/,'')});
 const note='2+2+2 <15s rest> drop to 1s if speed < target';
 await p.type(`#exs input[data-save="${prefix}w"]`,'80');await p.type(`#exs input[data-save="${prefix}r"]`,'6');await p.type(`#exs input[data-save="${prefix}rir"]`,'2');
 await p.type(`#exs input[data-save="${prefix}clusterSplit"]`,note);await p.click('#__log');
 await p.waitForFunction('JSON.parse(localStorage.pa_hist||"[]").some(x=>x.clusterSplit)');
 const exp=await exportViaUI(p);assert.strictEqual(JSON.parse(exp.json.data.pa_hist)[0].clusterSplit,note);
 const r=await importViaUI(p,exp.file);assert(r.canRestore,'Backup rejected: '+r.text);
 assert((await restoreViaUI(p)).reloaded);assert.strictEqual(JSON.parse((await storage(p)).pa_hist)[0].clusterSplit,note);
});
test('D3.2','Defect 3: cluster-split notes','Markup typed as a cluster-split note is shown as text and never rendered as HTML after reload/resume',async p=>{
 await p.click('#homePlan button.tpl','Giant ACore workout');
 await p.waitForFunction('!!document.querySelector("#exs input[data-save$=clusterSplit]")');
 const sel=await p.eval(()=>'#exs input[data-save="'+document.querySelector('#exs input[data-save$="clusterSplit"]').dataset.save+'"]');
 const evil='"><img src=x onerror="(window.__pwned=window.__pwned||[]).push(1)">';
 await p.type(sel,evil);await p.eval('saveDraft()');await p.reload();
 await p.click('#homePlan button.secondary','RESUME Giant A');await p.waitForFunction(`!!document.querySelector(${JSON.stringify(sel)})`);
 assert.strictEqual(await p.eval(s=>document.querySelector(s).value,sel),evil);
 const x=await pwned(p);assert.deepStrictEqual(x.pwned,[]);assert.strictEqual(x.injected,0);
});
test('D3.3','Defect 3: cluster-split notes','Markup in other history text (exercise name) is still rejected',async p=>{
 const data=await isolatedDataset(p);const h=JSON.parse(data.pa_hist);h[1].name='<img src=x onerror=alert(1)>';data.pa_hist=JSON.stringify(h);
 const r=await importViaUI(p,writeBackup(payload(data)));assert(!r.canRestore);
});
test('D3.4','Defect 3: cluster-split notes','Cluster-split notes must be text without control characters',async p=>{
 const data=await isolatedDataset(p);const h=JSON.parse(data.pa_hist);h[2].clusterSplit={html:'<b>'};data.pa_hist=JSON.stringify(h);
 assert(!(await importViaUI(p,writeBackup(payload(data)))).canRestore,'object clusterSplit accepted');
 h[2].clusterSplit='2+2\u0007';data.pa_hist=JSON.stringify(h);
 assert(!(await importViaUI(p,writeBackup(payload(data)))).canRestore,'control character accepted');
});

// =====================================================================
// DEFECT 4 — rollback snapshot failures and overwriting
// =====================================================================
test('D4.1','Defect 4: rollback snapshots','Pre-restore snapshot downloaded from the UI is itself a restorable backup that recovers the original data exactly',async p=>{
 const data=await dataset(p);await seed(p,{...data,unrelated_setting:'keep'});
 await restoreFile(p,payload({pa_hist:'[]',pa_week_mode:'busy'}));
 await openBackupPage(p);const snap=await p.download(()=>p.click('button','DOWNLOAD PRE-RESTORE SNAPSHOT'));
 const r=await importViaUI(p,snap.file);assert(r.canRestore,'Snapshot rejected: '+r.text);
 assert((await restoreViaUI(p)).reloaded);const s=await storage(p);assert.deepStrictEqual(pickPA(s),data);assert.strictEqual(s.unrelated_setting,'keep');
});
test('D4.2','Defect 4: rollback snapshots','Two consecutive restores keep two recovery generations; the older one is downloadable from the UI',async p=>{
 const A=await dataset(p);await seed(p,A);
 const B={pa_hist:'[]',pa_week_mode:'busy'},C={pa_hist:'[]',pa_week_mode:'extra'};
 await restoreFile(p,payload(B));await restoreFile(p,payload(C));
 const s=await storage(p);
 assert(s[ROLLBACK1],'no latest snapshot');assert.deepStrictEqual(await snapshotJSON(s[ROLLBACK1]),B,'latest snapshot is not the data replaced by the last restore');
 assert(s[ROLLBACK2],'older generation was overwritten/lost');assert.deepStrictEqual(await snapshotJSON(s[ROLLBACK2]),A);
 await openBackupPage(p);const older=await p.download(()=>p.click('button','DOWNLOAD OLDER PRE-RESTORE SNAPSHOT'));
 assert.deepStrictEqual(JSON.parse(fs.readFileSync(older.file,'utf8')).data,A);
});
test('D4.3','Defect 4: rollback snapshots','Restore that fails mid-write (real browser storage quota) leaves data AND existing snapshots unchanged, with a clear error',async p=>{
 const A=await dataset(p);await seed(p,A);await restoreFile(p,payload({pa_hist:'[]',pa_week_mode:'busy'}));
 const before=await storage(p);assert(before[ROLLBACK1]);
 // ~5.4M characters of valid lifting history: passes validation but exceeds Chrome's ~5.24M-character origin quota.
 const big=await p.eval(()=>{const n=baseSlots.a[0][1][0],h=[];for(let i=0;i<27000;i++)h.push({id:'big-'+i,sessionId:'big',name:n,intensifier:'Straight Sets',w:100+i%50,reps:5,rir:2,date:'2026-10-01T12:00:00.000Z',pad:'x'.repeat(80)});return JSON.stringify(h)});
 const r=await importViaUI(p,writeBackup(payload({pa_hist:big})));assert(r.canRestore,'large valid backup rejected: '+r.text);
 const out=await restoreViaUI(p);assert(!out.reloaded,'restore unexpectedly succeeded');
 assert.match(out.notice,/storage/i,'error does not explain the storage problem: '+out.notice);
 assert.deepStrictEqual(await storage(p),before,'storage changed after failed restore');
});
test('D4.4','Defect 4: rollback snapshots','When no rollback snapshot can be stored, restore is refused before anything changes, with a clear error',async p=>{
 const big=await p.eval(()=>{const n=baseSlots.a[0][1][0],h=[];for(let i=0;i<15000;i++)h.push({id:'cur-'+i,sessionId:'cur',name:n,intensifier:'Straight Sets',w:100,reps:5,rir:2,date:'2026-10-01T12:00:00.000Z',pad:'y'.repeat(80)});return JSON.stringify(h)});
 await seed(p,{pa_hist:big,pa_week_mode:'normal',unrelated:'keep'});const before=await storage(p);
 const r=await importViaUI(p,writeBackup(payload({pa_hist:'[]',pa_week_mode:'busy'})));assert(r.canRestore);
 const out=await restoreViaUI(p);assert(!out.reloaded,'restore proceeded without a rollback snapshot');
 assert.match(out.notice,/rollback snapshot/i,'unclear error: '+out.notice);assert.deepStrictEqual(await storage(p),before);
});
test('D4.5','Defect 4: rollback snapshots','When space allows only one generation, the older generation is dropped (not the newest) and restore proceeds',async p=>{
 const sizes=await p.eval(()=>{
  const n=baseSlots.a[0][1][0],mk=(tag,count)=>{const h=[];for(let i=0;i<count;i++)h.push({id:tag+i,sessionId:tag,name:n,intensifier:'Straight Sets',w:100,reps:5,rir:2,date:'2026-10-01T12:00:00.000Z',pad:'z'.repeat(80)});return JSON.stringify(h)};
  const wrap=data=>JSON.stringify({format:'project-america-full-backup',version:1,appVersion:'2.3',createdAt:'2026-10-01T00:00:00.000Z',data});
  // ~238 chars/record; quota ~5.24M chars. current+snapshot (~4.55M) fits only once the older generation (~1.07M) is dropped.
  localStorage.clear();localStorage.setItem('pa_hist',mk('cur',9000));localStorage.setItem('pa_restore_rollback',wrap({pa_hist:mk('g1',3500)}));localStorage.setItem('pa_restore_rollback_2',wrap({pa_hist:mk('g2',4000)}));
  return Object.keys(localStorage).map(k=>[k,localStorage.getItem(k).length]);
 });
 await p.reload();const current=(await storage(p)).pa_hist;
 await restoreFile(p,payload({pa_hist:'[]',pa_week_mode:'busy'}));
 const s=await storage(p);assert.strictEqual(s.pa_week_mode,'busy');
 assert.deepStrictEqual(await snapshotJSON(s[ROLLBACK1]),{pa_hist:current},'newest snapshot missing: '+JSON.stringify(sizes));
 assert(!(ROLLBACK2 in s),'scenario did not exercise the one-generation fallback: '+JSON.stringify(sizes));
});

test('D4.6','Defect 4: rollback snapshots','A snapshot left by HQ 2.3 (bare key map) is still downloadable as a restorable backup and is kept as the older generation',async p=>{
 const A=await isolatedDataset(p),B={pa_hist:'[]',pa_week_mode:'busy'};
 await seed(p,{...B,[ROLLBACK1]:JSON.stringify(A)});
 await openBackupPage(p);const snap=await p.download(()=>p.click('button','DOWNLOAD PRE-RESTORE SNAPSHOT'));
 const file=JSON.parse(fs.readFileSync(snap.file,'utf8'));assert.strictEqual(file.format,'project-america-full-backup');assert.deepStrictEqual(file.data,A);
 assert((await importViaUI(p,snap.file)).canRestore,'legacy snapshot not restorable');
 await restoreFile(p,payload({pa_hist:'[]',pa_week_mode:'extra'}));const s=await storage(p);
 assert.deepStrictEqual(await snapshotJSON(s[ROLLBACK1]),B);assert.deepStrictEqual(await snapshotJSON(s[ROLLBACK2]),A);
});

// =====================================================================
// DEFECT 5 — legacy drafts missing clusters
// =====================================================================
function legacyDraft(p){return p.eval(()=>{const b0=baseSlots.b[0][1][0];return {id:'legacy-draft-1',template:'b',phase:1,weekMode:'normal',startedAt:'2026-03-01T10:00:00.000Z',status:'draft',forms:{['lift:0:'+b0+':1:Straight Sets:w']:'55'},checks:{},choices:{},modes:{},mobTier:5,cardioMachine:'Peloton'}})}
test('D5.1','Defect 5: legacy drafts','Backup containing a legacy draft without clusters validates and restores byte-identically',async p=>{
 const data=await isolatedDataset(p);const s=JSON.parse(data.pa_sessions_v2);s.push(await legacyDraft(p));data.pa_sessions_v2=JSON.stringify(s);
 const r=await importViaUI(p,writeBackup(payload(data)));assert(r.canRestore,'Rejected: '+r.text);
 assert((await restoreViaUI(p)).reloaded);assert.strictEqual((await storage(p)).pa_sessions_v2,data.pa_sessions_v2);
});
test('D5.2','Defect 5: legacy drafts','Legacy draft without clusters resumes in the real UI; Myo-Reps stages render and ADD MINI-SET works without errors',async p=>{
 const draft=await legacyDraft(p);await seed(p,{pa_sessions_v2:JSON.stringify([draft])});
 await p.click('#homePlan button.secondary','RESUME Giant B');
 await p.waitForFunction('document.getElementById("title").textContent.length>0');await sleep(200);
 assert.deepStrictEqual(p.errors,[],'page errors on resume');
 const stages=await p.eval('document.querySelectorAll("#exs .method-stage").length');assert(stages>0,'no structured-method stages rendered');
 const wKey=Object.keys(draft.forms)[0];
 assert.strictEqual(await p.eval(k=>document.querySelector(`#exs input[data-save="${k}"]`)?.value,wKey),'55','draft form value not restored');
 const before=await p.eval('document.querySelectorAll("#exs .method-stage").length');
 await p.click('#exs button','ADD MINI-SET');await sleep(150);
 assert.deepStrictEqual(p.errors,[],'page errors on ADD MINI-SET');
 assert.strictEqual(await p.eval('document.querySelectorAll("#exs .method-stage").length'),before+1);
 const stored=JSON.parse((await storage(p)).pa_sessions_v2)[0];assert.strictEqual(stored.forms[wKey],'55');for(const k of Object.keys(draft))if(k!=='updatedAt'&&k!=='forms'&&k!=='checks'&&k!=='timerEnd')assert.deepStrictEqual(stored[k],draft[k],'draft field changed: '+k);
});
test('D5.3','Defect 5: legacy drafts','Sessions with malformed clusters are still rejected',async p=>{
 const data=await isolatedDataset(p);const s=JSON.parse(data.pa_sessions_v2);
 s[1].clusters=[5];data.pa_sessions_v2=JSON.stringify(s);assert(!(await importViaUI(p,writeBackup(payload(data)))).canRestore,'array clusters accepted');
 s[1].clusters={x:99};data.pa_sessions_v2=JSON.stringify(s);assert(!(await importViaUI(p,writeBackup(payload(data)))).canRestore,'out-of-range count accepted');
});

// =====================================================================
// DEFECT 6 — imported OS text reaching HTML without escaping
// =====================================================================
async function visitAllOSScreens(p){
 const leaks={};await p.click('#n-home');let x=await pwned(p);if(x.pwned.length||x.injected)leaks.home=x;
 for(const k of OS_PAGES){await p.eval('window.__pwned=[]');await p.click('#n-more');await p.click(`button.moreitem[onclick="osPage('${k}')"]`);if(k==='schedule')await p.click('button','NEGOTIATE WEEK');if(k==='adaptive')await p.click('button','RESHAPE TODAY');x=await pwned(p);if(x.pwned.length||x.injected)leaks[k]=x}
 return leaks;
}
test('D6.1','Defect 6: OS escaping','OS text already in storage (including values the validator would reject) is escaped on Home and all 15 OS screens',async p=>{
 await seed(p,{pa_os_v2:JSON.stringify(await p.eval(buildHostileOS,false))});
 const leaks=await visitAllOSScreens(p);assert.deepStrictEqual(leaks,{},'markup executed/injected: '+JSON.stringify(leaks));assert.deepStrictEqual(p.errors,[]);
});
test('D6.2','Defect 6: OS escaping','Imported OS backup with markup in every text field restores, displays literally, and never executes',async p=>{
 const osState=await p.eval(buildHostileOS,true);
 const r=await importViaUI(p,writeBackup(payload({pa_hist:'[]',pa_os_v2:JSON.stringify(osState)})));assert(r.canRestore,'Rejected: '+r.text);
 assert((await restoreViaUI(p)).reloaded);
 const leaks=await visitAllOSScreens(p);assert.deepStrictEqual(leaks,{},'markup executed/injected: '+JSON.stringify(leaks));
 await p.click('#n-home');assert(await p.eval(()=>document.getElementById('osHomeGrid').textContent.includes('<img src=x onerror=')),'40-yard value not shown literally');
 await p.click('#n-more');await p.click(`button.moreitem[onclick="osPage('combine')"]`);
 assert.strictEqual(await p.eval('document.getElementById("c_notes").value'),osState.combine[0].notes,'combine notes not preserved literally in textarea');
});

// =====================================================================
// NORMAL DATA / COMPATIBILITY
// =====================================================================
test('N1','Normal data','Full realistic dataset (all storage keys) round-trips byte-identically via UI export → import → restore; unrelated keys preserved',async p=>{
 const data=await dataset(p);await seed(p,{...data,theme:'dark',other_app_state:'{"x":1}'});
 const exp=await exportViaUI(p);assert.deepStrictEqual(exp.json.data,data,'export differs from stored data');
 await seed(p,{pa_hist:'[]',pa_week_mode:'busy',pa_sel_a_0:data.pa_sel_a_0,theme:'dark',other_app_state:'{"x":1}'},true);
 const r=await importViaUI(p,exp.file);assert(r.canRestore,'Rejected: '+r.text);assert((await restoreViaUI(p)).reloaded);
 const s=await storage(p);assert.deepStrictEqual(pickPA(s),data);assert.strictEqual(s.theme,'dark');assert.strictEqual(s.other_app_state,'{"x":1}');
 assert.deepStrictEqual(p.errors,[]);
});
test('N2','Normal data','Specialized methods (Myo-Reps, DC Rest-Pause efforts, cluster sets, primer, activator, strength/intensifier preferences) survive restore and render',async p=>{
 const data=await dataset(p);await restoreFile(p,payload(data));
 const s=await storage(p);const h=JSON.parse(s.pa_hist);
 assert(h.some(x=>x.intensifier==='Myo-Reps'&&x.efforts.length===3));assert(h.some(x=>x.intensifier==='DC Rest-Pause'&&x.structured));
 assert(JSON.parse(s.pa_strength_hist)[0].kind==='Heavy Primer');assert(JSON.parse(s.pa_activator_hist)[0].kind==='Activator');
 assert.strictEqual(await p.eval('getStrength("a",1,baseSlots.a[1][1][0])'),'Cluster Sets');
 await p.click('#n-progress');await sleep(100);assert.deepStrictEqual(p.errors,[]);
});
test('N3','Normal data','OS data: defaults, fully populated, and older/partial OS shapes all validate; OS screens render',async p=>{
 const full=await dataset(p);
 const shapes=await p.eval(()=>{const def=osData();const v20={bodyweight:189,mode:'standard',readiness:{sleep:3,energy:3,soreness:4,joints:4,motivation:4,date:null},tests:{},fuel:{},skill:{},experiments:[],combine:[],notes:[]};const minimal={bodyweight:180,mode:'survival',readiness:{sleep:2,energy:2,soreness:2,joints:3,motivation:3,date:null},tests:{},skill:{}};const nullGym={...def,activeGym:null};return {def,v20,minimal,nullGym}});
 for(const [name,o] of Object.entries(shapes)){const r=await importViaUI(p,writeBackup(payload({pa_hist:'[]',pa_os_v2:JSON.stringify(o)})));assert(r.canRestore,name+' OS shape rejected: '+r.text)}
 await restoreFile(p,payload({pa_hist:'[]',pa_os_v2:JSON.stringify(shapes.minimal)}));
 const leaks=await visitAllOSScreens(p);assert.deepStrictEqual(leaks,{});assert.deepStrictEqual(p.errors,[],'OS screens failed with minimal OS data');
 await restoreFile(p,payload(full));assert.strictEqual((await storage(p)).pa_os_v2,full.pa_os_v2);
});
test('N4','Normal data','Unfinished session restores and resumes in the real UI with its entered values',async p=>{
 const data=await dataset(p);await restoreFile(p,payload(data));
 await p.click('#homePlan button.secondary','RESUME Giant B');await p.waitForFunction('document.querySelectorAll("#exs .method-stage").length>0');
 const b0=await p.eval('baseSlots.b[0][1][0]');assert.strictEqual(await p.eval(k=>document.querySelector(`#exs input[data-save="${k}"]`)?.value,'lift:0:'+b0+':1:Straight Sets:w'),'60');
 assert.strictEqual(await p.eval('document.querySelectorAll("#exs .method-stage").length>=5'),true,'saved Myo mini-set count not restored');
 assert.strictEqual(await p.eval('document.getElementById("finishNotes").value'),'Elbow fine; keep RIR >2');assert.deepStrictEqual(p.errors,[]);
});
test('N5','Normal data','Unknown pa_ key in storage does not make the exported backup unrestorable, and restore leaves it untouched',async p=>{
 const data=await dataset(p);await seed(p,{...data,pa_future_feature:'{"v":1}'});
 const exp=await exportViaUI(p);const r=await importViaUI(p,exp.file);assert(r.canRestore,'Own export rejected: '+r.text);
 assert((await restoreViaUI(p)).reloaded);const s=await storage(p);assert.strictEqual(s.pa_future_feature,'{"v":1}');assert.deepStrictEqual(pickPA(s),{...data,pa_future_feature:'{"v":1}'});
});
test('N6','Normal data','Export warns clearly when stored data cannot pass this version\'s restore validation (file is still downloaded)',async p=>{
 await seed(p,{pa_hist:'[]',pa_sel_a_0:'Retired Exercise Name'});
 const exp=await exportViaUI(p);assert.strictEqual(exp.json.data.pa_sel_a_0,'Retired Exercise Name');
 const n=await p.eval('document.getElementById("appNotice").classList.contains("hidden")?"":document.getElementById("appNotice").textContent');
 assert.match(n,/cannot restore/i,'no warning shown: '+n);
});
test('N7','Normal data','After restore, the app reloads offline from the service worker with restored data intact',async p=>{
 const data=await dataset(p);await restoreFile(p,payload(data));
 await p.waitForFunction('navigator.serviceWorker.getRegistration().then(r=>!!r?.active)',15000);await p.reload();await p.waitForFunction('!!navigator.serviceWorker.controller',15000);
 await p.offline(true);try{await p.reload();assert.deepStrictEqual(pickPA(await storage(p)),data);assert.deepStrictEqual(p.errors,[])}finally{await p.offline(false)}
});
test('N8','Normal data','App starts without script errors and makes no external network requests',async p=>{
 const data=await dataset(p);await seed(p,data);await visitAllOSScreens(p);assert.deepStrictEqual(p.errors,[]);
 assert.deepStrictEqual(p.requests.filter(u=>!u.startsWith(ctx.origin)&&!u.startsWith('data:')&&!u.startsWith('blob:')),[]);
});

// =====================================================================
// MALICIOUS / MALFORMED IMPORTS — each must be rejected with storage left byte-identical
// =====================================================================
function maliciousCases(data,osState,names){
 const P=d=>JSON.stringify(payload(d));
 const withHist=f=>{const h=JSON.parse(data.pa_hist);f(h);return P({...data,pa_hist:JSON.stringify(h)})};
 const withSess=f=>{const s=JSON.parse(data.pa_sessions_v2);f(s);return P({...data,pa_sessions_v2:JSON.stringify(s)})};
 const osRaw=raw=>P({...data,pa_os_v2:raw});
 const withOS=f=>{const o=JSON.parse(osState);f(o);return osRaw(JSON.stringify(o))};
 const rawData=inner=>`{"format":"project-america-full-backup","version":1,"data":${inner}}`;
 return [
  ['M01','__proto__ storage key at data root',rawData('{"__proto__":{"polluted":"yes"},"pa_hist":"[]"}')],
  ['M02','__proto__ key inside a lifting record',withHist(h=>{h[1]=JSON.parse('{"__proto__":{"admin":true},"name":"'+names.a0+'"}')})],
  ['M03','constructor key nested in OS state',withOS(o=>{o.fuel=JSON.parse('{"constructor":{"prototype":{"x":1}}}')})],
  ['M04','prototype key inside session forms',withSess(s=>{s[0].forms=JSON.parse('{"prototype":"x"}')})],
  ['M05','unknown pa_ storage key',P({...data,pa_evil:'1'})],
  ['M06','non-Project-America storage key',P({...data,evil:'1'})],
  ['M07','rollback key smuggled into backup',P({...data,pa_restore_rollback:'{}'})],
  ['M08','non-string storage value',P({...data,pa_week_mode:5})],
  ['M09','oversized entry (>10M chars)',P({...data,pa_current_session:'x'.repeat(10000001)})],
  ['M10','excessive nesting in a record',withHist(h=>{let x=h[1];for(let i=0;i<14;i++)x=x.n={}})],
  ['M11','invalid JSON in history list',P({...data,pa_hist:'[{"name":'})],
  ['M12','script markup in exercise name',withHist(h=>{h[1].name='<script>alert(1)</script>'})],
  ['M13','session id crafted to break out of onclick',withSess(s=>{s[1].id="x');alert(1);//"})],
  ['M14','session with unknown template',withSess(s=>{s[1].template='__proto__'})],
  ['M15','session clusters count out of range',withSess(s=>{s[1].clusters={k:500}})],
  ['M16','OS invalid operating mode',withOS(o=>{o.mode='<img src=x>'})],
  ['M17','OS readiness out of range',withOS(o=>{o.readiness.sleep=9})],
  ['M18','OS unknown top-level field',withOS(o=>{o.injected='<b>'})],
  ['M19','OS unknown test key',withOS(o=>{o.tests.evil={value:'1',date:null}})],
  ['M20','OS gym equipment not in catalog',withOS(o=>{o.gymProfiles[0].equipment=['<svg onload=alert(1)>']})],
  ['M21','OS activeGym out of range',withOS(o=>{o.activeGym=9})],
  ['M22','OS control characters in text',withOS(o=>{o.lifeWins[0].text='ok\u0000bad'})],
  ['M23','OS non-finite number (1e999)',osRaw(osState.replace('"bodyweight":191.5','"bodyweight":1e999'))],
  ['M24a','OS root is an array',osRaw('[]')],
  ['M24b','OS root is null',osRaw('null')],
  ['M24c','OS root is a string',osRaw('"hello"')],
  ['M25','OS invalid JSON',osRaw('{"bodyweight":')],
  ['M26','OS experiment status not OBSERVE',withOS(o=>{o.experiments[0].status='<i>ADOPT</i>'})],
  ['M27','OS skill progress out of range',withOS(o=>{o.skill.SPEED=50})],
  ['M28','OS friction with unknown session',withOS(o=>{o.friction[0].session='<b>'})],
  ['M29a','wrong backup format',JSON.stringify({format:'other',version:1,data:{}})],
  ['M29b','unsupported backup version',JSON.stringify({...payload(data),version:2})],
  ['M29c','old lifting-only export (array)',data.pa_hist],
  ['M29d','not JSON at all','<html><script>alert(1)</script>'],
  ['M30','strength preference with unknown method',P({...data,pa_strength_a_0_X:'<b>Heavy</b>'})],
  ['M31','movement preference not in exercise catalog',P({...data,pa_sel_a_0:'<img src=x>'})],
  ['M32','OS string beyond per-field limit',withOS(o=>{o.lifeWins[0].text='w'.repeat(200001)})],
  ['M33','OS excessive nesting',withOS(o=>{let x=o.fuel;for(let i=0;i<14;i++)x=x.n={}})],
  ['M34','invalid active block',P({...data,pa_plan_v1:'{"active":99,"visited":[1]}'})],
  ['M35','OS technique for unknown exercise',withOS(o=>{o.technique[0].exercise='<b>x</b>'})],
  ['M36','unsafe key name with control characters in OS',withOS(o=>{o.fuel={['a\u0001b']:1}})]
 ];
}
test('M','Malicious imports','Every malicious or malformed import is rejected in the UI (no RESTORE button) and storage stays byte-identical',async p=>{
 const full=await dataset(p),data=await isolatedDataset(p);const names={a0:await p.eval('baseSlots.a[0][1][0]')};
 await seed(p,{...full,unrelated:'keep'});const before=await storage(p);const failures=[];
 for(const [id,label,text] of maliciousCases(data,full.pa_os_v2,names)){
  const r=await importViaUI(p,writeBackup(text,'mal-'+id));const after=await storage(p);
  const ok=!r.canRestore&&JSON.stringify(after)===JSON.stringify(before);
  ctx.sub.push({id,label,ok,message:r.text.slice(0,140)});if(!ok)failures.push(id+' '+label+(r.canRestore?' (ACCEPTED)':' (storage changed)'));
 }
 const x=await pwned(p);assert.strictEqual(x.injected,0);
 assert.deepStrictEqual(failures,[]);
});
test('M37','Malicious imports','A previewed backup that is modified before RESTORE is re-validated and refused; storage unchanged',async p=>{
 const data=await isolatedDataset(p);await seed(p,data);const before=await storage(p);
 const r=await importViaUI(p,writeBackup(payload(data)));assert(r.canRestore);
 await p.eval('pendingImport.data.pa_evil="1"');const out=await restoreViaUI(p);assert(!out.reloaded);assert.deepStrictEqual(await storage(p),before);
});

// ---------- runner ----------
(async()=>{
 const server=await serve(appDir),browser=await launch();ctx={browser,origin:server.origin,sub:[]};
 const results=[];let failed=0;
 console.log(`Project America backup/restore regression suite\nApp under test: ${path.resolve(appDir)}\nBrowser: headless Chrome via DevTools protocol\n`);
 try{
  for(const t of tests){
   if(only&&!only.includes(t.id))continue;
   ctx.sub=[];let p,error=null;const start=Date.now();
   try{p=await openApp();await t.fn(p)}catch(e){error=e.message.split('\n').slice(0,6).join(' | ')}
   finally{if(p)await p.close()}
   const r={id:t.id,group:t.group,title:t.title,pass:!error,error,ms:Date.now()-start};if(ctx.sub.length)r.cases=ctx.sub;results.push(r);if(error)failed++;
   console.log(`${error?'FAIL':'PASS'} ${t.id.padEnd(5)} ${t.title}${error?'\n      → '+error:''}`);
   if(ctx.sub.length)for(const c of ctx.sub)console.log(`        ${c.ok?'ok  ':'FAIL'} ${c.id.padEnd(5)} ${c.label} — ${c.message.replace(/\s+/g,' ')}`);
  }
 }finally{await browser.close();await server.close();fs.rmSync(work,{recursive:true,force:true})}
 console.log(`\n${results.length-failed} passed, ${failed} failed, ${results.length} total`);
 if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify({app:path.resolve(appDir),date:new Date().toISOString(),passed:results.length-failed,failed,results},null,1));
 process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=2});

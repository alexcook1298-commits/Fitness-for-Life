'use strict';
// Project America HQ 2.3 — Phase 2 suite: data integrity & workout semantics.
//   RD  readiness freshness = same local calendar day            (Priority 2)
//   CB  cardio text and backup round trip                         (Priority 1)
//   BU  training-budget classification and uncounted exposures    (Priority 3)
//   CS  workout completion semantics                              (Priority 4)
// Usage: node tests/phase2.test.js <appDir> [--json out.json] [--only ID,ID] [--group RD,CB,...]
// Drives the real app in headless Chrome. Synthetic data, disposable profiles. Written BEFORE each implementation.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const {launch}=require('./lib/cdp'),{serve}=require('./lib/server'),clock=require('./lib/clock');

const args=process.argv.slice(2);
const opt=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
const appDir=args.find(a=>!a.startsWith('--')&&!['--json','--only','--group'].includes(args[args.indexOf(a)-1]));
if(!appDir){console.error('Usage: node tests/phase2.test.js <appDir> [--json out.json] [--only ID,ID] [--group RD,CB,BU,CS]');process.exit(2)}
const jsonOut=opt('--json'),only=opt('--only')?opt('--only').split(','):null,groups=opt('--group')?opt('--group').split(','):null;
const work=fs.mkdtempSync(path.join(os.tmpdir(),'pa-p2-'));const dl=path.join(work,'downloads');fs.mkdirSync(dl);
const tests=[];const test=(id,title,fn)=>tests.push({id,group:id.replace(/[0-9.]+$/,''),title,fn});
let ctx;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const openApp=async()=>{const p=await ctx.browser.newPage(dl);await p.goto(ctx.origin+'/');return p};
const SAFE_TZ='UTC';
const ALL5={sleep:5,energy:5,soreness:5,joints:5,motivation:5};
const readinessAt=(p,vals,date)=>p.eval((v,d)=>{const o=osData();o.readiness=Object.assign({},v);if(d!==undefined)o.readiness.date=d;saveOS(o)},vals,date===undefined?undefined:date);
const home=p=>p.eval(()=>{updateOSHome();return {card:document.getElementById('osCommand').innerText,dir:document.getElementById('osDirective').innerText}});
const stateAt=(p,date,nowMs)=>p.eval((d,n)=>{const f=readinessFreshness({...{sleep:5,energy:5,soreness:5,joints:5,motivation:5},date:d},n);return {state:f.state,days:f.days}},date,nowMs);

// =====================================================================
// RD — readiness freshness
// =====================================================================
const LOCAL=async(p,y,m,d,h,mi,s)=>clock.localMs(p,y,m,d,h,mi,s);
const iso=ms=>new Date(ms).toISOString();

test('RD1','The provisional 48-hour threshold is gone: READINESS_STALE_HOURS no longer exists',async p=>{
 assert.strictEqual(await p.eval(()=>typeof READINESS_STALE_HOURS),'undefined');
});
test('RD2','A check-in from 00:00:00 today is fresh at 23:59:59 the same local day (almost 24 h old)',async p=>{
 await clock.setTimezone(p,'America/New_York');
 const rec=await LOCAL(p,2026,10,19,0,0,0),now=await LOCAL(p,2026,10,19,23,59,59);
 assert.strictEqual((await stateAt(p,iso(rec),now)).state,'fresh');
});
test('RD3','Midnight: a check-in from 23:59 is stale at 00:01 the next local day, although only two minutes old',async p=>{
 await clock.setTimezone(p,'America/New_York');
 const rec=await LOCAL(p,2026,10,19,23,59,0),now=await LOCAL(p,2026,10,20,0,1,0);
 const r=await stateAt(p,iso(rec),now);assert.deepStrictEqual(r,{state:'stale',days:1});
});
test('RD4','A check-in 30 hours old is stale (the old 48-hour rule called it fresh); one from the previous evening is stale the next morning',async p=>{
 await clock.setTimezone(p,'America/Chicago');
 const now=await LOCAL(p,2026,10,20,10,0,0),rec30=now-30*3600000,recEve=await LOCAL(p,2026,10,19,20,0,0);
 assert.strictEqual((await stateAt(p,iso(rec30),now)).state,'stale');assert.strictEqual((await stateAt(p,iso(recEve),now)).state,'stale');
});
test('RD5','Earlier today is fresh at any time of day (checked at every hour for a morning check-in)',async p=>{
 await clock.setTimezone(p,'Europe/London');
 const rec=await LOCAL(p,2026,10,19,6,30,0);
 for(let h=7;h<24;h++){const now=await LOCAL(p,2026,10,19,h,0,0);assert.strictEqual((await stateAt(p,iso(rec),now)).state,'fresh','hour '+h)}
 assert.strictEqual((await stateAt(p,iso(rec),await LOCAL(p,2026,10,20,0,0,1))).state,'stale');
});
test('RD6','Live midnight transition in the app: Home is GREEN at 23:59:50, and STALE after midnight when the app is brought back to the foreground, with no user action',async p=>{
 await clock.setTimezone(p,'America/Los_Angeles');await clock.freezeLocal(p,2026,10,19,23,59,50);
 await readinessAt(p,ALL5,await p.eval(()=>new Date().toISOString()));
 await p.click('#n-home');let h=await home(p);assert(/GREEN/.test(h.card)&&!/STALE/.test(h.card),h.card);
 await clock.freezeLocal(p,2026,10,20,0,0,20);
 await p.eval(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))});
 const card=await p.eval(()=>document.getElementById('osCommand').innerText);
 assert(/STALE CHECK-IN/.test(card)&&!/GREEN/.test(card),'Home not refreshed after midnight: '+card);
});
test('RD7','Left open across midnight with no focus event: the app schedules its own refresh for the next local midnight',async p=>{
 await clock.setTimezone(p,'America/Denver');
 const info=await p.eval(()=>({fn:typeof scheduleReadinessMidnightRefresh,pending:typeof window.__readinessMidnightAt}));
 assert.strictEqual(info.fn,'function','no midnight scheduler');
 await clock.freezeLocal(p,2026,10,19,15,0,0);
 const at=await p.eval(()=>{scheduleReadinessMidnightRefresh();return window.__readinessMidnightAt});
 const want=await LOCAL(p,2026,10,20,0,0,0);assert.ok(Math.abs(at-want)<=5000,`scheduled for ${new Date(at).toISOString()} wanted ${new Date(want).toISOString()}`);
});
test('RD8','Missing, null, empty, invalid, NaN or non-text timestamps are "never checked in" and never throw',async p=>{
 await clock.setTimezone(p,SAFE_TZ);
 for(const d of [undefined,null,'','   ','not-a-date','2026-13-45',{},[],false,NaN]){
  const r=await p.eval(d=>{try{return readinessFreshness({...{sleep:5,energy:5,soreness:5,joints:5,motivation:5},...(d===undefined?{}:{date:d})}).state}catch(e){return 'THROW '+e.message}},typeof d==='number'&&isNaN(d)?null:d);
  assert.strictEqual(r,'never',JSON.stringify(d)+' -> '+r);
 }
 await readinessAt(p,ALL5,undefined);await p.click('#n-home');const h=await home(p);assert(/NOT CHECKED IN/.test(h.card)&&!/GREEN/.test(h.card),h.card);
});
test('RD9','Legacy date shapes: date-only strings are LOCAL calendar days (not UTC), zone-less ISO strings are local, epoch milliseconds work',async p=>{
 await clock.setTimezone(p,'America/Los_Angeles');
 const now=await LOCAL(p,2026,10,19,20,0,0);   // 03:00Z on Oct 20 — a different UTC day than the local day
 assert.strictEqual((await stateAt(p,'2026-10-19',now)).state,'fresh','date-only for today read as UTC?');
 assert.strictEqual((await stateAt(p,'2026-10-18',now)).state,'stale');
 assert.strictEqual((await stateAt(p,'2026-10-19T07:15:00',now)).state,'fresh','zone-less local ISO today');
 assert.strictEqual((await stateAt(p,'2026-10-18T23:30:00',now)).state,'stale');
 assert.strictEqual((await stateAt(p,await LOCAL(p,2026,10,19,1,0,0),now)).state,'fresh','epoch ms today');
 assert.strictEqual((await stateAt(p,await LOCAL(p,2026,10,18,23,0,0),now)).state,'stale','epoch ms yesterday');
});
test('RD10','Time-zone change: the calendar day is judged in the device\'s CURRENT zone (same saved instant, different verdicts)',async p=>{
 const saved='2026-10-20T05:00:00.000Z';            // 22:00 Oct 19 in Los Angeles, 14:00 Oct 20 in Tokyo
 const later=Date.parse('2026-10-20T08:00:00.000Z');  // 01:00 Oct 20 in LA, 17:00 Oct 20 in Tokyo
 await clock.setTimezone(p,'America/Los_Angeles');assert.strictEqual((await stateAt(p,saved,later)).state,'stale','LA: previous local day');
 await clock.setTimezone(p,'Asia/Tokyo');assert.strictEqual((await stateAt(p,saved,later)).state,'fresh','Tokyo: same local day');
 await clock.setTimezone(p,'America/Los_Angeles');assert.strictEqual((await stateAt(p,saved,Date.parse('2026-10-20T05:30:00.000Z'))).state,'fresh','LA, 30 minutes later');
});
test('RD11','A saved check-in on a LATER local day than now (clock or time-zone change) is flagged "future", never fresh and never "never"',async p=>{
 await clock.setTimezone(p,'America/Los_Angeles');
 const r=await stateAt(p,'2026-10-25T12:00:00.000Z',Date.parse('2026-10-20T12:00:00.000Z'));
 assert.strictEqual(r.state,'future');
 await clock.setTimezone(p,'Asia/Tokyo');   // 21:00 Oct 20 -> now Oct 20 in Tokyo; a record at 08:00 Oct 21 Tokyo is the next local day
 assert.strictEqual((await stateAt(p,'2026-10-20T23:00:00.000Z',Date.parse('2026-10-20T12:00:00.000Z'))).state,'future');
});
test('RD12','Small clock skew: up to five minutes ahead the same day is accepted; two hours ahead is "future"',async p=>{
 await clock.setTimezone(p,SAFE_TZ);const now=Date.parse('2026-10-19T12:00:00.000Z');
 assert.strictEqual((await stateAt(p,iso(now+3*60000),now)).state,'fresh');
 assert.strictEqual((await stateAt(p,iso(now+2*3600000),now)).state,'future');
});
test('RD13','Daylight-saving changes: the 25-hour fall-back day and the 23-hour spring-forward day are still one calendar day each',async p=>{
 await clock.setTimezone(p,'America/New_York');
 let rec=await LOCAL(p,2026,11,1,0,30,0),now=await LOCAL(p,2026,11,1,23,30,0);   // 24 h 0 m apart across fall back (25 h day)
 assert.strictEqual((await stateAt(p,iso(rec),now)).state,'fresh','fall-back day');
 rec=await LOCAL(p,2026,10,31,23,30,0);now=await LOCAL(p,2026,11,1,0,10,0);
 assert.deepStrictEqual(await stateAt(p,iso(rec),now),{state:'stale',days:1});
 rec=await LOCAL(p,2027,3,13,23,0,0);now=await LOCAL(p,2027,3,14,3,30,0);        // spring forward: 02:00 does not exist
 assert.deepStrictEqual(await stateAt(p,iso(rec),now),{state:'stale',days:1});
 rec=await LOCAL(p,2027,3,14,0,10,0);now=await LOCAL(p,2027,3,14,23,50,0);
 assert.strictEqual((await stateAt(p,iso(rec),now)).state,'fresh','spring-forward day');
});
test('RD14','Age is counted in calendar days, not 24-hour blocks: yesterday evening is "1 day", three days ago is "3 days" even across DST',async p=>{
 await clock.setTimezone(p,'America/New_York');const now=await LOCAL(p,2026,11,2,9,0,0);
 assert.strictEqual((await stateAt(p,iso(await LOCAL(p,2026,11,1,22,0,0)),now)).days,1);
 assert.strictEqual((await stateAt(p,iso(await LOCAL(p,2026,10,30,9,0,0)),now)).days,3);
});
test('RD15','A historical check-in stays visible but labelled: Home, Readiness page and Coach Handoff all say STALE and give the age; none presents it as today\'s status',async p=>{
 await clock.setTimezone(p,SAFE_TZ);await clock.freezeLocal(p,2026,10,19,9,0,0);
 await readinessAt(p,ALL5,'2026-10-18T20:00:00.000Z');
 await p.click('#n-home');const h=await home(p);
 assert(/STALE CHECK-IN/.test(h.card)&&/1 day ago/.test(h.card+h.dir)&&!/GREEN/.test(h.card+h.dir),h.card+h.dir);
 assert(!/Run as programmed/.test(h.card+h.dir),'stale check-in still gives the GREEN recommendation');
 const page=await p.eval(()=>{renderReadinessPage();return document.getElementById('mpBody').innerText});
 assert(/STALE CHECK-IN/.test(page)&&!/GREEN/.test(page)&&/SAVE CHECK-IN/.test(page),page.slice(0,300));
 const coach=await p.eval(()=>coachSummary());assert(/READINESS: STALE CHECK-IN/.test(coach)&&!/READINESS: GREEN/.test(coach),coach.slice(0,300));
});
test('RD16','A restrictive joint flag from an earlier day is still shown (restrict-only), labelled stale, until the check-in is updated',async p=>{
 await clock.setTimezone(p,SAFE_TZ);await clock.freezeLocal(p,2026,10,19,9,0,0);
 await readinessAt(p,{...ALL5,joints:1},'2026-10-18T20:00:00.000Z');await p.click('#n-home');const h=await home(p);
 assert(/RED/.test(h.card)&&/joint flag still applies/i.test(h.card+h.dir)&&/1 day ago/.test(h.card+h.dir),h.card+h.dir);
});
test('RD17','Saving a check-in today makes it current immediately; it becomes stale at the next local midnight',async p=>{
 await clock.setTimezone(p,SAFE_TZ);await clock.freezeLocal(p,2026,10,19,22,0,0);
 await p.eval(()=>{renderReadinessPage();for(const k of ['sleep','energy','soreness','joints','motivation'])document.getElementById('r_'+k).value=5;saveReadiness()});
 assert.strictEqual(await p.eval(()=>readinessStatus(osData().readiness).stale),false);
 await clock.freezeLocal(p,2026,10,20,0,0,5);
 assert.strictEqual(await p.eval(()=>readinessStatus(osData().readiness).stale),true);
});
test('RD18','The readiness scoring formula and the GREEN/YELLOW/RED thresholds are unchanged for all 3,125 possible check-ins',async p=>{
 const r=await p.eval(()=>{const bad=[];for(let a=1;a<=5;a++)for(let b=1;b<=5;b++)for(let c=1;c<=5;c++)for(let d=1;d<=5;d++)for(let e=1;e<=5;e++){
   const r={sleep:a,energy:b,soreness:c,joints:d,motivation:e},score=Math.round((a+b+c+d+e)/25*100),base=score>=76?'GREEN':score>=58?'YELLOW':'RED';
   let want=base;if(d<=1)want='RED';else if(d<=2&&base==='GREEN')want='YELLOW';
   if(readinessScore(r)!==score||readinessDecision(r).label!==want)bad.push([a,b,c,d,e])}return bad.length});
 assert.strictEqual(r,0);
});
test('RD19','Readiness is only ever presented through the freshness gate: readinessDecision has exactly one caller (readinessStatus)',async p=>{
 const src=fs.readFileSync(path.join(appDir,'index.html'),'utf8');
 const calls=src.match(/readinessDecision\(/g)||[];assert.strictEqual(calls.length,2,'definition + one caller expected, found '+calls.length);
 assert(/function readinessStatus[\s\S]{0,200}readinessDecision\(/.test(src),'the single caller is not readinessStatus');
});
test('RD20','Freshness evaluation never writes or alters stored readiness data',async p=>{
 await clock.setTimezone(p,SAFE_TZ);await readinessAt(p,{...ALL5,joints:2},'2026-09-01T10:00:00.000Z');
 const before=await p.eval(()=>localStorage.getItem('pa_os_v2'));
 await p.eval(()=>{updateOSHome();renderReadinessPage();coachSummary()});
 assert.strictEqual(await p.eval(()=>localStorage.getItem('pa_os_v2')),before);
});

// =====================================================================
// CB — cardio text and backup round trip
// =====================================================================
let fileCounter=0;
const writeFile=obj=>{const f=path.join(work,`file-${++fileCounter}.json`);fs.writeFileSync(f,typeof obj==='string'?obj:JSON.stringify(obj,null,2));return f};
const storage=p=>p.eval(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
const PA=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k.startsWith('pa_')&&!k.startsWith('pa_restore_rollback')));
const notice=p=>p.eval(()=>{const n=document.getElementById('appNotice');return n.classList.contains('hidden')?'':n.textContent});
const clearNotice=p=>p.eval(()=>document.getElementById('appNotice').classList.add('hidden'));
async function tagClick(p,finderSrc,...a){const ok=await p.eval(`(()=>{document.querySelectorAll('[data-tc]').forEach(e=>e.removeAttribute('data-tc'));const el=(${finderSrc})(...${JSON.stringify(a)});if(!el)return false;el.setAttribute('data-tc','1');return true})()`);if(!ok)throw Error('element not found');await p.click('[data-tc="1"]')}
async function openCardio(p,machine='Outdoor'){
 await p.eval(()=>start('conditioning'));
 await p.click('#exs .machine-btn',machine);
 return p.eval(()=>document.querySelector('#exs [data-cardio]').dataset.cardio);
}
async function typeCardio(p,field,value){await p.eval(f=>{const i=document.querySelector(`#exs [data-cardio] input[data-field="${f}"]`);i.scrollIntoView({block:'center'});i.focus();i.select()},field);await p.send('Input.insertText',{text:value});}
async function saveCardioUI(p){await clearNotice(p);await p.click('#exs button.save-cardio')}
const cardioHist=p=>p.eval(()=>JSON.parse(localStorage.pa_cardio_hist||'[]'));
async function openBackupPage(p){await p.click('#n-more');await p.click('button.moreitem[onclick="morePage(\'data\')"]');await p.waitForFunction('!!document.querySelector("#morepage input[type=file]")')}
async function importFile(p,file){await openBackupPage(p);await p.eval('document.getElementById("importPreview").textContent=""');await p.setFile('#morepage input[type=file]',file);await p.waitForFunction('document.getElementById("importPreview").textContent.trim().length>0',20000);return p.eval(()=>({text:document.getElementById('importPreview').textContent,can:[...document.querySelectorAll('#importPreview button')].some(b=>b.textContent.trim()==='RESTORE THIS BACKUP')}))}
async function restoreUI(p){const re=p.waitForLoad(30000).then(()=>true,()=>false);await p.click('button','RESTORE THIS BACKUP');const ok=await re;if(ok)await p.waitForFunction('typeof validateBackup==="function"&&document.readyState==="complete"');return ok}
const bkWrap=data=>({format:'project-america-full-backup',version:1,appVersion:'2.3',createdAt:'2026-10-12T09:00:00.000Z',data});
const cardioRec=(data,extra={})=>({id:'s1|Outdoor|conditioning',sessionId:'s1',date:'2026-10-10T12:00:00.000Z',machine:'Outdoor',mode:'conditioning',data,...extra});
const backupWith=records=>bkWrap({pa_cardio_hist:JSON.stringify(records)});
const LEGIT=['<10:00','>8:30/mi','8:30 > 9:00','HR <140 bpm','<=150','5 < 6','a<b','x>y','<','>','<<','>>','<3','>=4'];
const TAGLIKE=['<b>','<img src=x onerror=window.__pwn=1>','</script>','<!-- x -->','<?php echo 1 ?>','<svg/onload=window.__pwn=1>','<a href="javascript:window.__pwn=1">x</a>','<script>window.__pwn=1</script>','<iframe src=javascript:1>','<B>x'];

test('CB1','Legitimate comparison text ("<10:00", ">8:30/mi", "HR <140 bpm", ...) typed into cardio fields through the UI is saved exactly as typed',async p=>{
 await openCardio(p,'Outdoor');
 for(const v of LEGIT){
  await p.eval(()=>{localStorage.pa_cardio_hist='[]'});await clearNotice(p);
  await typeCardio(p,'pace',v);await saveCardioUI(p);
  const h=await cardioHist(p);assert.strictEqual(h.length,1,JSON.stringify(v)+' not saved: '+await notice(p));assert.strictEqual(h[0].data.pace,v);
 }
});
test('CB2','Round trip: a cardio entry containing < and > exports, previews, restores into a clean profile and is byte-identical',async p=>{
 await openCardio(p,'Outdoor');await typeCardio(p,'pace','<10:00');await typeCardio(p,'hr','HR >150 <170');await saveCardioUI(p);
 const before=PA(await storage(p));assert(before.pa_cardio_hist.includes('<10:00'));
 await openBackupPage(p);const d=await p.download(()=>p.click('button','EXPORT FULL BACKUP'));
 const q=await openApp();
 try{const r=await importFile(q,d.file);assert(r.can,'restore refused: '+r.text);assert(await restoreUI(q));
  const after=PA(await storage(q));assert.strictEqual(after.pa_cardio_hist,before.pa_cardio_hist,'cardio history changed');
 }finally{await q.close()}
});
test('CB3','Every LEGIT string passes backup validation as a cardio value, in every cardio field',async p=>{
 for(const v of LEGIT){const r=await p.eval(rec=>{try{validateBackup(rec);return 'ok'}catch(e){return e.message}},backupWith([cardioRec({pace:v,hr:v,duration:v,distance:v,calories:v})]));assert.strictEqual(r,'ok',JSON.stringify(v)+': '+r)}
});
test('CB4','HTML-like cardio text is refused when logging, with a message explaining that < and > are allowed as comparison signs, and nothing is stored',async p=>{
 await openCardio(p,'Outdoor');
 for(const v of TAGLIKE){await p.eval(()=>{localStorage.pa_cardio_hist='[]'});await typeCardio(p,'pace',v);await saveCardioUI(p);
  assert.strictEqual((await cardioHist(p)).length,0,JSON.stringify(v)+' was stored');const n=await notice(p);assert(/comparison/i.test(n)&&/pace/i.test(n),JSON.stringify(v)+' -> '+n)}
 assert.strictEqual(await p.eval(()=>window.__pwn),undefined);
});
test('CB5','Malicious cardio text in a backup file is refused at preview: restore is never offered, the reason names the cardio entry and field, and storage is untouched',async p=>{
 await p.eval(()=>{localStorage.pa_cardio_hist='[{"id":"keep","sessionId":"k","date":"2026-10-01T00:00:00.000Z","machine":"Outdoor","mode":"conditioning","data":{"hr":"150"}}]'});
 const before=await storage(p);
 for(const v of TAGLIKE){
  const r=await importFile(p,writeFile(backupWith([cardioRec({pace:v})])));assert(!r.can,'restore offered for '+JSON.stringify(v));
  assert(/cardio/i.test(r.text)&&/pace/i.test(r.text),'unhelpful message: '+r.text);
 }
 assert.deepStrictEqual(PA(await storage(p)),PA(before));assert.strictEqual(await p.eval(()=>window.__pwn),undefined);
});
test('CB6','Stored markup that predates this fix is never executed or turned into elements: the cardio "PREVIOUS" line shows it as literal text',async p=>{
 const mode=await openCardio(p,'Outdoor');
 await p.eval(m=>{localStorage.pa_cardio_hist=JSON.stringify([{date:'2026-10-01T00:00:00.000Z',machine:'Outdoor',mode:m,data:{pace:'<img src=x onerror=window.__pwn=1>',hr:'<b id=pwnb>bold</b>'}}]);render()},mode);
 await sleep(300);
 const r=await p.eval(()=>{const prev=document.querySelector('#exs .cardio-prev');return {pwn:window.__pwn,kids:[...prev.children].map(c=>c.tagName),text:prev.textContent,pwnb:!!document.getElementById('pwnb')}});
 assert.strictEqual(r.pwn,undefined,'script executed');assert.strictEqual(r.pwnb,false,'markup became an element');
 assert.deepStrictEqual(r.kids.filter(k=>!['B','BR'].includes(k)),[],'unexpected elements: '+r.kids);assert(r.text.includes('<img src=x onerror=window.__pwn=1>'),'text not shown literally: '+r.text);
});
test('CB7','Data keys in a cardio record must be plain identifiers: markup, control characters, __proto__ and over-long keys are refused on import',async p=>{
 for(const k of ['<img src=x onerror=1>','a b','__proto__','constructor','pace\u0001','x'.repeat(40),'']){
  const rec=cardioRec({});Object.defineProperty(rec.data,k,{value:'1',enumerable:true,configurable:true,writable:true});
  const r=await p.eval(rec=>{try{validateBackup(rec);return 'ok'}catch(e){return e.message}},backupWith([rec]));assert.notStrictEqual(r,'ok','key '+JSON.stringify(k)+' accepted');
 }
});
test('CB8','Cardio values must be text or numbers: nested objects, arrays, booleans and non-finite numbers are refused; data must be an object',async p=>{
 for(const data of [{pace:{a:1}},{pace:['1']},{pace:true},{pace:null,hr:{}},'30',[1,2],null]){
  const r=await p.eval(rec=>{try{validateBackup(rec);return 'ok'}catch(e){return e.message}},backupWith([cardioRec(data)]));assert.notStrictEqual(r,'ok',JSON.stringify(data)+' accepted');
 }
 for(const data of [{pace:'8:30',hr:150},{pace:''},{}]){
  const r=await p.eval(rec=>{try{validateBackup(rec);return 'ok'}catch(e){return e.message}},backupWith([cardioRec(data)]));assert.strictEqual(r,'ok',JSON.stringify(data)+': '+r);
 }
});
test('CB9','Control characters and over-long text in cardio values are still refused',async p=>{
 for(const v of ['a\u0000b','a\u0007b','x'.repeat(2000),'a\u001fb']){
  const r=await p.eval(rec=>{try{validateBackup(rec);return 'ok'}catch(e){return e.message}},backupWith([cardioRec({pace:v})]));assert.notStrictEqual(r,'ok',JSON.stringify(v.slice(0,12))+' accepted');
 }
});
test('CB10','Import protection elsewhere is NOT weakened: < or > is still refused in work-set, stretch, strength and activator history and in record ids/names/machine fields',async p=>{
 const cases={
  pa_hist:[{id:'x',name:'Bench <b>',w:1,reps:1,date:'2026-10-01T00:00:00.000Z'},{id:'x',name:'Bench',w:1,reps:1,date:'2026-10-01T00:00:00.000Z',clusterSplit:'3+3 <20s>'}],
  pa_ls_hist:[{id:'x',exercise:'<i>',load:1,seconds:30,date:'2026-10-01T00:00:00.000Z'}],
  pa_strength_hist:[{id:'x',name:'<i>',w:1,reps:1,date:'2026-10-01T00:00:00.000Z'}],
  pa_activator_hist:[{id:'x',name:'<i>',reps:1,date:'2026-10-01T00:00:00.000Z'}],
  pa_cardio_hist:[cardioRec({hr:'1'},{machine:'<b>'}),cardioRec({hr:'1'},{id:'<b>'}),cardioRec({hr:'1'},{mode:'a>b'}),cardioRec({hr:'1'},{sessionId:'<s>'})]};
 const verdicts=[];
 for(const [k,list] of Object.entries(cases))for(const rec of list){
  const r=await p.eval((k,rec)=>{try{validateBackup({format:'project-america-full-backup',version:1,appVersion:'2.3',createdAt:'2026-10-12T09:00:00.000Z',data:{[k]:JSON.stringify([rec])}});return 'ok'}catch(e){return e.message}},k,rec);verdicts.push([k,JSON.stringify(rec),r]);
 }
 const ok=verdicts.filter(v=>v[2]==='ok');
 // the only acceptable "ok" is the pre-existing clusterSplit exemption
 assert.deepStrictEqual(ok.map(v=>v[0]+' '+v[1]).filter(x=>!/clusterSplit/.test(x)),[],'accepted: '+JSON.stringify(ok).slice(0,300));
});
test('CB11','Historical cardio records (old shapes without id or sessionId, numeric-looking text, empty values, unknown keys) still import and round-trip byte-identically',async p=>{
 const old=[{date:'2025-01-02T10:00:00.000Z',machine:'Peloton',mode:'zone2',data:{duration:'30',distance:'',resistance:'45',cadence:'80',hr:'140',calories:'250'}},{date:'2025-02-02T10:00:00.000Z',machine:'Rower',mode:'intervals',data:{duration:'20',pace:'2:05',spm:'28',legacyField:'x'}},cardioRec({minutes:'30',output:'210'})];
 const r=await importFile(p,writeFile(backupWith(old)));assert(r.can,r.text);assert(await restoreUI(p));
 assert.deepStrictEqual(await cardioHist(p),old);
});
test('CB12','Existing cardio records are never altered: loading, rendering, exporting and a refused import leave pa_cardio_hist byte-identical',async p=>{
 const legacy=JSON.stringify([{date:'2025-03-01T10:00:00.000Z',machine:'Outdoor',mode:'conditioning',data:{pace:'<10:00',hr:'<img src=x>'}},cardioRec({pace:'8:30'})]);
 await p.eval(v=>{localStorage.pa_cardio_hist=v},legacy);await p.reload();
 await openCardio(p,'Outdoor');await p.eval(()=>{render();backupPayload()});
 await importFile(p,writeFile(backupWith([cardioRec({pace:'<b>'})])));
 assert.strictEqual(await p.eval(()=>localStorage.pa_cardio_hist),legacy);
});
test('CB13','A draft with a typed-but-unsaved cardio value containing < resumes with it after reload, and survives backup/restore',async p=>{
 await openCardio(p,'Outdoor');await typeCardio(p,'pace','<9:45');await p.eval(()=>saveDraft());
 const bk=await p.eval(()=>backupPayload());const r=await importFile(p,writeFile(bk));assert(r.can,r.text);assert(await restoreUI(p));
 await p.click('#homePlan button.secondary','RESUME Conditioning');
 assert.strictEqual(await p.eval(()=>document.querySelector('#exs [data-cardio] input[data-field="pace"]').value),'<9:45');
});
test('CB14','Every place that renders cardio history is escaped: static check that no cardio value reaches innerHTML unescaped',async p=>{
 const src=fs.readFileSync(path.join(appDir,'index.html'),'utf8');
 const fn=/function cardioPrevious\([\s\S]*?\n\}/.exec(src);assert(fn,'cardioPrevious not found');
 assert(/esc\(k\)/.test(fn[0])&&/esc\(v\)/.test(fn[0]),'cardioPrevious does not escape keys and values:\n'+fn[0]);
});
test('CB15','A full real workflow with cardio containing < and > still passes every other backup property: draft, finished session, history all restore identically',async p=>{
 await openCardio(p,'Outdoor');await typeCardio(p,'pace','<10:00');await saveCardioUI(p);
 await p.click('button','FINISH WORKOUT');await p.click('button','SAVE COMPLETED WORKOUT');
 const before=PA(await storage(p));const bk=await p.eval(()=>backupPayload());
 const q=await openApp();try{const r=await importFile(q,writeFile(bk));assert(r.can,r.text);assert(await restoreUI(q));assert.deepStrictEqual(PA(await storage(q)),before)}finally{await q.close()}
});

// ---------- runner ----------
(async()=>{
 const server=await serve(appDir),browser=await launch();ctx={browser,origin:server.origin};
 const results=[];let failed=0;
 console.log(`Project America Phase 2 suite (data integrity & workout semantics)\nApp under test: ${path.resolve(appDir)}\n`);
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

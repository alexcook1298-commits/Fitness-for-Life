'use strict';
// Project America HQ 2.3 — gym-workflow verification suite (integration brief, Step 3).
// Usage: node tests/gym-workflow.test.js <appDir> [--json results.json] [--only ID,ID] [--old-app <dir>]
// Drives the real app UI in headless Chrome (real mouse clicks, real typing, real file input, real downloads, real storage quota).
// Synthetic data only, disposable browser profiles. Headless Chrome on Linux is NOT evidence of real-device behaviour.
// Groups named "gap" are CHARACTERIZATION tests: they pass when a known user-visible limitation is present exactly as documented.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),assert=require('assert');
const {launch}=require('./lib/cdp');
const {serve}=require('./lib/server');
const {buildDataset}=require('./fixtures');

const args=process.argv.slice(2);
const opt=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
const appDir=args.find(a=>!a.startsWith('--')&&!['--json','--only','--old-app'].includes(args[args.indexOf(a)-1]));
if(!appDir){console.error('Usage: node tests/gym-workflow.test.js <appDir> [--json out.json] [--only ID,ID] [--old-app dir]');process.exit(2)}
const jsonOut=opt('--json'),only=opt('--only')?opt('--only').split(','):null,oldApp=opt('--old-app');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'pa-gym-'));
const dl=path.join(work,'downloads');fs.mkdirSync(dl);
const EFFECTIVE=JSON.parse(fs.readFileSync(path.join(__dirname,'..','audit','data','effective_prescription.json'),'utf8'));

const tests=[];
const test=(id,group,title,fn)=>tests.push({id,group,title,fn});
let ctx;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const openApp=async()=>{const p=await ctx.browser.newPage(dl);await p.goto(ctx.origin+'/');return p};
let fileCounter=0;
const writeFile=obj=>{const f=path.join(work,`file-${++fileCounter}.json`);fs.writeFileSync(f,typeof obj==='string'?obj:JSON.stringify(obj,null,2));return f};
const storage=p=>p.eval(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
const PA=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k.startsWith('pa_')&&!k.startsWith('pa_restore_rollback')));
const firstDiff=(x,y)=>{x=String(x);y=String(y);let i=0;while(i<x.length&&x[i]===y[i])i++;return '@'+i+' '+JSON.stringify(x.slice(Math.max(0,i-40),i+60))+' vs '+JSON.stringify(y.slice(Math.max(0,i-40),i+60))};
const normStore=o=>({...o,pa_sessions_v2:typeof o.pa_sessions_v2==='string'?o.pa_sessions_v2.replace(/"updatedAt":"[^"]*"/g,'"updatedAt":"-"'):o.pa_sessions_v2});
// Navigating Home/More re-saves the open draft, which only moves its updatedAt; every other byte must match unless raw=true.
const sameStore=(a0,b0,msg='',raw=false)=>{const a=raw?a0:normStore(a0),b=raw?b0:normStore(b0);const ks=[...new Set([...Object.keys(a),...Object.keys(b)])].sort(),d=ks.filter(k=>a[k]!==b[k]);assert(d.length===0,msg+' storage differs in: '+d.map(k=>k+' ('+firstDiff(a[k],b[k])+')').join('; '))};
const hist=p=>p.eval(()=>JSON.parse(localStorage.pa_hist||'[]'));
const sessionsOf=p=>p.eval(()=>JSON.parse(localStorage.pa_sessions_v2||'[]'));
const notice=p=>p.eval(()=>{const n=document.getElementById('appNotice');return n.classList.contains('hidden')?'':n.textContent});
const clearNotice=p=>p.eval(()=>document.getElementById('appNotice').classList.add('hidden'));

// ---------- UI helpers (real clicks/typing) ----------
async function tagClick(p,finderSrc,...a){
 const ok=await p.eval(`(()=>{document.querySelectorAll('[data-tc]').forEach(e=>e.removeAttribute('data-tc'));const el=(${finderSrc})(...${JSON.stringify(a)});if(!el)return false;el.setAttribute('data-tc','1');return true})()`);
 if(!ok)throw Error('element not found: '+finderSrc.slice(0,120));
 await p.click('[data-tc="1"]');
}
const startUI=async(p,label)=>{await p.click('#homePlan button.tpl',label);await p.waitForFunction('document.querySelectorAll("#exs .exercise").length>0||document.querySelectorAll("#exs .card").length>0')};
const startApp=(p,k)=>p.eval(k=>{start(k);return currentSession.id},k);
const slotIndex=(p,tpl,label)=>p.eval((t,l)=>slots[t].findIndex(s=>s[0]===l),tpl,label);
const key=(p,i,j,mode,part)=>p.eval((i,j,m,pt)=>formKey(i,j,m,pt),i,j,mode,part);
async function typeKey(p,k,value){await p.type(`#exs input[data-save="${k}"]`,String(value))}
async function logStraight(p,i,j,{w,r,rir}){
 const mode=await p.eval((i,j)=>setMode(i,j,selected(active,i)),i,j);
 const base=await key(p,i,j,mode,'');
 if(w!=null)await typeKey(p,base+'w',w);if(r!=null)await typeKey(p,base+'r',r);if(rir!=null)await typeKey(p,base+'rir',rir);
 await tagClick(p,(i,j)=>document.querySelectorAll('#exs .exercise')[i].querySelector(`.set[data-set="${j}"] button[data-record="straight"]`),i,j);
 return base;
}
async function logStages(p,i,j,efforts,{save=true}={}){
 const mode=await p.eval((i,j)=>setMode(i,j,selected(active,i)),i,j),base=await key(p,i,j,mode,'');
 for(let k=0;k<efforts.length;k++){
  if(efforts[k]==null)continue;
  const [w,r]=efforts[k];await typeKey(p,base+'w'+k,w);await typeKey(p,base+'r'+k,r);
  await tagClick(p,(i,j,k)=>document.querySelectorAll('#exs .exercise')[i].querySelectorAll('.final-set-block [data-record="stage"]')[k],i,j,k);
 }
 if(save)await tagClick(p,(i)=>document.querySelectorAll('#exs .exercise')[i].querySelector('button[data-record="cluster"]'),i);
 return {mode,base};
}
const finishUI=async(p,notes='')=>{await p.click('button','FINISH WORKOUT');if(notes)await p.type('#finishNotes',notes);await p.click('button','SAVE COMPLETED WORKOUT')};
const seedBSessions=(p,n)=>p.eval(n=>{const s=[];for(let k=0;k<n;k++)s.push({id:'seedb'+k,template:'b',phase:1,weekMode:'normal',status:'complete',startedAt:new Date(Date.now()-(k+3)*86400000).toISOString(),finishedAt:new Date(Date.now()-(k+3)*86400000+3600000).toISOString(),forms:{},checks:{},choices:{},modes:{},clusters:{}});localStorage.setItem('pa_sessions_v2',JSON.stringify(s))},n).then(()=>reopen(p));
async function reopen(p){await p.goto(ctx.origin+'/')}
const errorsOf=p=>p.errors.filter(e=>!/ResizeObserver/.test(e));

// =====================================================================
// G1  Workout selection, display, order, prescriptions
// =====================================================================
test('G1.1','G1: selection & display','Home lists the Block 1 core workouts and Train lists conditioning, athletic and mobility; starting Giant A from Home opens it',async p=>{
 const home=await p.eval(()=>document.getElementById('homePlan').innerText);
 assert(/Giant A/.test(home)&&/Giant B/.test(home),home);
 await startUI(p,'Giant ACore workout');
 assert.strictEqual(await p.eval(()=>document.getElementById('title').textContent),'Giant A');
 await p.click('button','EXIT');await p.click('#n-train');
 const train=await p.eval(()=>document.getElementById('train').innerText);assert(/Conditioning/.test(train)&&/Athletic/.test(train)&&/Mobility/.test(train));
});
const cmpPrescription=async(p,tpl,cycle)=>{
 if(tpl==='b')await seedBSessions(p,cycle);
 await p.eval(t=>start(t),tpl);
 const dom=await p.eval(()=>[...document.querySelectorAll('#exs .exercise')].map(box=>{
  const blocks=[...box.querySelectorAll('.straight-set-block,.final-set-block')];const last=blocks.at(-1);
  const info=last?.querySelector('.final-info b')?.textContent||'';
  return {label:box.querySelector('.exhead small.gold').textContent,ex:box.querySelector('select.chooser').value,sets:blocks.length,finalMode:info?info.replace(/^FINAL SET\s*•\s*/,''):'Straight Sets'}}));
 const want=EFFECTIVE.filter(r=>r.tpl===tpl&&r.cycle===cycle);
 assert.strictEqual(dom.length,want.length,`slot count ${dom.length} vs ${want.length}`);
 want.forEach((w,k)=>{
  assert.strictEqual(dom[k].label,w.slot,`slot ${k} label`);assert.strictEqual(dom[k].ex,w.defaultEx,`slot ${k} default exercise`);
  const expectSets=w.intensifierFinalSet==='FST-7'&&w.sets===8?2:w.sets;
  assert.strictEqual(dom[k].sets,expectSets,`${w.slot} set count ${dom[k].sets} vs ${expectSets}`);
  assert.strictEqual(dom[k].finalMode,w.intensifierFinalSet,`${w.slot} final-set method ${dom[k].finalMode} vs ${w.intensifierFinalSet}`);
 });
};
test('G1.2','G1: selection & display','Giant A: exercise order, default exercises, set counts and final-set methods match the baseline effective prescription (7 slots)',async p=>cmpPrescription(p,'a',0));
for(const c of [0,1,2])test('G1.'+(3+c),'G1: selection & display',`Giant B rotation cycle ${c}: order, exercises, sets and final-set methods match the baseline effective prescription (8 slots)`,async p=>cmpPrescription(p,'b',c));
test('G1.6','G1: selection & display','Every one of the 29 templates opens without page errors and renders content',async p=>{
 const keys=await p.eval(()=>Object.keys(T));assert.strictEqual(keys.length,29);
 for(const k of keys){
  await p.eval(k=>{start(k)},k);
  const n=await p.eval(()=>document.getElementById('exs').children.length);assert(n>0,k+' rendered nothing');
  await p.eval(()=>show('home'));
 }
 assert.deepStrictEqual(errorsOf(p),[]);
});
test('G1.7','G1: selection & display','Changing a movement from the dropdown persists to the session and survives a reload and resume',async p=>{
 await p.eval(()=>start('a'));
 const [from,to]=await p.eval(()=>[selected('a',1),slots.a[1][1][1]]);
 await p.eval(v=>{const s=document.querySelectorAll('#exs .exercise')[1].querySelector('select.chooser');s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}))},to);
 assert.notStrictEqual(from,to);
 await reopen(p);await p.click('#homePlan button.secondary','RESUME Giant A');
 assert.strictEqual(await p.eval(()=>document.querySelectorAll('#exs .exercise')[1].querySelector('select.chooser').value),to);
});
test('G1.8','G1: selection & display','Warm-up and cool-down content is shown around the Giant A exercises',async p=>{
 await p.eval(()=>start('a'));const t=await p.eval(()=>document.getElementById('exs').innerText);
 assert(/Bench-Specific Ramp/.test(t)&&/Downshift Breathing/.test(t),'bookends missing');
});

// =====================================================================
// G2  Straight-set logging
// =====================================================================
test('G2.1','G2: straight sets','Logging a straight set through the UI writes one correctly shaped history record, marks it done and starts the rest timer',async p=>{
 await startUI(p,'Giant ACore workout');
 const base=await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});
 const h=await hist(p);assert.strictEqual(h.length,1);const r=h[0];
 const sid=await p.eval(()=>currentSession.id);
 assert.strictEqual(r.sessionId,sid);assert.strictEqual(r.template,'a');assert.strictEqual(r.setNumber,1);assert.strictEqual(r.w,95);assert.strictEqual(r.reps,12);assert.strictEqual(r.rir,2);
 assert.strictEqual(r.intensifier,'Straight Sets');assert.strictEqual(r.id,[sid,3,r.name,1,'Straight Sets'].join('|'));assert(!isNaN(Date.parse(r.date)));
 assert.strictEqual(await p.eval(b=>document.querySelector(`input[data-save="${b}w"]`).closest('.set').querySelector('button.check').textContent,base),'✓');
 assert(!(await p.eval(()=>document.getElementById('timer').classList.contains('hidden'))),'rest timer did not start');
});
test('G2.2','G2: straight sets','Invalid entries are refused with a message and write nothing (no reps, zero reps, negative weight, non-numeric)',async p=>{
 await p.eval(()=>start('a'));
 for(const v of [{w:'95',r:''},{w:'95',r:'0'},{w:'-5',r:'8'},{w:'abc',r:'8'}]){
  await p.eval(()=>{document.querySelectorAll('#exs input[data-save^="lift:3:"]').forEach(e=>e.value='')});
  await clearNotice(p);await logStraight(p,3,1,v);
  assert.strictEqual((await hist(p)).length,0,JSON.stringify(v)+' was recorded');assert(/valid|positive/i.test(await notice(p)),JSON.stringify(v)+' gave no message');
 }
});
test('G2.3','G2: straight sets','Tapping a logged set again removes its record (undo), and logging again after edit stores the new values',async p=>{
 await p.eval(()=>start('a'));
 await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});assert.strictEqual((await hist(p)).length,1);
 await tagClick(p,()=>document.querySelectorAll('#exs .exercise')[3].querySelector('.set[data-set="1"] button[data-record="straight"]'));
 assert.strictEqual((await hist(p)).length,0);
 const base=await key(p,3,1,'Straight Sets','');await typeKey(p,base+'w','100');
 await tagClick(p,()=>document.querySelectorAll('#exs .exercise')[3].querySelector('.set[data-set="1"] button[data-record="straight"]'));
 const h=await hist(p);assert.strictEqual(h.length,1);assert.strictEqual(h[0].w,100);
});
test('G2.4','G2: straight sets','A bodyweight movement can be logged with a blank weight (stored as null)',async p=>{
 await p.eval(()=>start('a'));
 const i=await slotIndex(p,'a','Vertical Pull');await p.eval(i=>{const s=document.querySelectorAll('#exs .exercise')[i].querySelector('select.chooser'),o=[...s.options].find(o=>/^Pull-Up|Assisted/.test(o.value))||s.options[0];s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}))},i);
 await logStraight(p,i,1,{w:null,r:'6',rir:'2'});const h=await hist(p);assert.strictEqual(h.length,1);assert.strictEqual(h[0].w,null);assert.strictEqual(h[0].reps,6);
});
test('G2.5','G2: straight sets','Every straight set of an entire Giant A can be logged through the UI; one record per set, unique ids, correct set numbers',async p=>{
 await p.eval(()=>start('a'));
 const plan=await p.eval(()=>slots.a.map((s,i)=>({i,n:workSetCount(i),mode:setMode(i,workSetCount(i),selected('a',i)),strength:strengthEligible('a',i)})));
 let expected=0;
 for(const s of plan)for(let j=1;j<=s.n;j++){
  const isMethod=j===s.n&&s.mode!=='Straight Sets';
  if(isMethod){await logStages(p,s.i,j,(await p.eval((i,j)=>methodStages(setMode(i,j,selected('a',i))).map(()=>[20,10]),s.i,j)));expected++;continue}
  await logStraight(p,s.i,j,{w:'50',r:'8',rir:'2'});expected++;
 }
 const h=await hist(p);assert.strictEqual(h.length,expected,`${h.length} records vs ${expected} sets`);
 assert.strictEqual(new Set(h.map(x=>x.id)).size,h.length,'duplicate ids');
 assert.deepStrictEqual(errorsOf(p),[]);
});

// =====================================================================
// G3  Methods: Myo-Reps, Rest-Pause, DC, FST-7, partials, drop set, widowmaker, clusters, primer, loaded holds
// =====================================================================
const startB=async(p,cycle)=>{if(cycle)await seedBSessions(p,cycle);await p.eval(()=>start('b'))};
test('G3.1','G3: methods','Myo-Reps: activation + mini-set logged and saved as ONE structured record with efforts, totals and volume',async p=>{
 await startB(p,0);const i=await slotIndex(p,'b','Rear Delts'),j=await p.eval(i=>workSetCount(i),i);
 const {mode}=await logStages(p,i,j,[[20,12],[20,5],null,null]);assert.strictEqual(mode,'Myo-Reps');
 const h=(await hist(p)).filter(x=>x.intensifier==='Myo-Reps');assert.strictEqual(h.length,1);
 assert.strictEqual(h[0].structured,true);assert.strictEqual(h[0].efforts.length,2);assert.strictEqual(h[0].reps,17);assert.strictEqual(h[0].volume,340);
 assert(/UPDATE FINAL BLOCK/.test(await p.eval(i=>document.querySelectorAll('#exs .exercise')[i].innerText,i)),'no UPDATE label after save');
});
test('G3.2','G3: methods','Myo-Reps with only an activation effort is refused with guidance and nothing is stored',async p=>{
 await startB(p,0);const i=await slotIndex(p,'b','Rear Delts'),j=await p.eval(i=>workSetCount(i),i);
 await logStages(p,i,j,[[20,12],null,null,null]);assert.strictEqual((await hist(p)).length,0);assert(/at least one mini-set/i.test(await notice(p)),await notice(p));
});
test('G3.3','G3: methods','Myo-Reps with a gap between efforts is refused',async p=>{
 await startB(p,0);const i=await slotIndex(p,'b','Rear Delts'),j=await p.eval(i=>workSetCount(i),i);
 await logStages(p,i,j,[[20,12],null,[20,4],null]);assert.strictEqual((await hist(p)).length,0);assert(/gaps/i.test(await notice(p)),await notice(p));
});
test('G3.4','G3: methods','ADD MINI-SET adds an effort row and the count survives a reload/resume',async p=>{
 await startB(p,0);const i=await slotIndex(p,'b','Rear Delts'),j=await p.eval(i=>workSetCount(i),i);
 const n0=await p.eval(i=>document.querySelectorAll('#exs .exercise')[i].querySelectorAll('.method-stage').length,i);
 await tagClick(p,i=>[...document.querySelectorAll('#exs .exercise')[i].querySelectorAll('button')].find(b=>b.textContent.trim()==='ADD MINI-SET'),i);
 assert.strictEqual(await p.eval(i=>document.querySelectorAll('#exs .exercise')[i].querySelectorAll('.method-stage').length,i),n0+1);
 await reopen(p);await p.click('#homePlan button.secondary','RESUME Giant B');
 assert.strictEqual(await p.eval(i=>document.querySelectorAll('#exs .exercise')[i].querySelectorAll('.method-stage').length,i),n0+1);
});
test('G3.5','G3: methods','DC Rest-Pause needs all 3 efforts: 2 efforts refused, 3 efforts saved as one structured record',async p=>{
 await startB(p,0);const i=await slotIndex(p,'b','Biceps'),j=await p.eval(i=>workSetCount(i),i);
 const two=await logStages(p,i,j,[[30,9],[30,5],null]);assert.strictEqual(two.mode,'DC Rest-Pause');assert.strictEqual((await hist(p)).length,0);assert(await notice(p),'no message');
 await typeKey(p,two.base+'w2',30);await typeKey(p,two.base+'r2',4);
 await tagClick(p,(i,j)=>document.querySelectorAll('#exs .exercise')[i].querySelectorAll('.final-set-block [data-record="stage"]')[2],i,j);
 await tagClick(p,i=>document.querySelectorAll('#exs .exercise')[i].querySelector('button[data-record="cluster"]'),i);
 const h=await hist(p);assert.strictEqual(h.length,1);assert.strictEqual(h[0].efforts.length,3);assert.strictEqual(h[0].reps,18);
});
test('G3.6','G3: methods','Rest-Pause (Giant B rotation group 1, Vertical Pull) saves a 3-effort structured record',async p=>{
 await startB(p,1);const i=await slotIndex(p,'b','Vertical Pull'),j=await p.eval(i=>workSetCount(i),i);
 const r=await logStages(p,i,j,[[100,8],[100,3],[100,2]]);assert.strictEqual(r.mode,'Rest-Pause');
 const h=await hist(p);assert.strictEqual(h.length,1);assert.strictEqual(h[0].intensifier,'Rest-Pause');assert.strictEqual(h[0].efforts.length,3);
});
test('G3.7','G3: methods','FST-7 (Giant B-Upper Lateral Raise): all 7 sets required; a partial block is refused; the full block saves',async p=>{
 await p.eval(()=>start('bu'));const i=await slotIndex(p,'bu','Lateral Raise'),j=await p.eval(i=>workSetCount(i),i);
 const mode=await p.eval((i,j)=>setMode(i,j,selected('bu',i)),i,j);assert.strictEqual(mode,'FST-7');
 const part=await logStages(p,i,j,Array.from({length:5},()=>[10,12]));assert.strictEqual((await hist(p)).length,0);assert(await notice(p),'no message for partial FST-7');
 for(let k=5;k<7;k++){await typeKey(p,part.base+'w'+k,10);await typeKey(p,part.base+'r'+k,12);await tagClick(p,(i,k)=>document.querySelectorAll('#exs .exercise')[i].querySelectorAll('.final-set-block [data-record="stage"]')[k],i,k)}
 await tagClick(p,i=>document.querySelectorAll('#exs .exercise')[i].querySelector('button[data-record="cluster"]'),i);
 const h=(await hist(p)).filter(x=>x.intensifier==='FST-7');assert.strictEqual(h.length,1);assert.strictEqual(h[0].efforts.length,7);
});
test('G3.8','G3: methods','Lengthened Partials (2 stages) and Mechanical Drop Set (3 stages) save structured records in Giant B-Upper',async p=>{
 await p.eval(()=>start('bu'));
 const lp=await slotIndex(p,'bu','Chest Isolation'),jl=await p.eval(i=>workSetCount(i),lp);
 const a=await logStages(p,lp,jl,[[40,10],[40,6]]);assert.strictEqual(a.mode,'Lengthened Partials');
 const md=await slotIndex(p,'bu','Horizontal Row'),jm=await p.eval(i=>workSetCount(i),md);
 const b=await logStages(p,md,jm,[[60,8],[50,5],[40,4]]);assert.strictEqual(b.mode,'Mechanical Drop Set');
 const h=await hist(p);assert.deepStrictEqual(h.map(x=>x.intensifier).sort(),['Lengthened Partials','Mechanical Drop Set']);assert.deepStrictEqual(h.map(x=>x.efforts.length).sort(),[2,3]);
});
test('G3.9','G3: methods','Widowmaker (Giant B rotation group 2, Leg Press) logs one set record in Widowmaker mode',async p=>{
 await startB(p,2);const i=await slotIndex(p,'b','Widowmaker'),j=await p.eval(i=>workSetCount(i),i);
 const mode=await p.eval((i,j)=>setMode(i,j,selected('b',i)),i,j);assert.strictEqual(mode,'Widowmaker');
 await logStraight(p,i,j,{w:'180',r:'20',rir:null});const h=await hist(p);assert.strictEqual(h.length,1);assert.strictEqual(h[0].intensifier,'Widowmaker');assert.strictEqual(h[0].reps,20);
});
test('G3.10','G3: methods','BFR can be chosen from the intensifier selector and requires all 4 sets',async p=>{
 await startB(p,0);const i=await slotIndex(p,'b','Triceps');
 await p.eval(i=>{const s=document.querySelectorAll('#exs .exercise')[i].querySelector('select.intsel');s.value='BFR';s.dispatchEvent(new Event('change',{bubbles:true}))},i);
 const j=await p.eval(i=>workSetCount(i),i);assert.strictEqual(await p.eval((i,j)=>setMode(i,j,selected('b',i)),i,j),'BFR');
 const r=await logStages(p,i,j,[[15,30],[15,15],[15,15]]);assert.strictEqual((await hist(p)).length,0);
 await typeKey(p,r.base+'w3',15);await typeKey(p,r.base+'r3',15);await tagClick(p,(i,j)=>document.querySelectorAll('#exs .exercise')[i].querySelectorAll('.final-set-block [data-record="stage"]')[3],i,j);
 await tagClick(p,i=>document.querySelectorAll('#exs .exercise')[i].querySelector('button[data-record="cluster"]'),i);
 assert.strictEqual((await hist(p)).filter(x=>x.intensifier==='BFR').length,1);
});
test('G3.11','G3: methods','Cluster Sets (Giant A Horizontal Row) store the cluster split note and strength method on the record',async p=>{
 await p.eval(()=>start('a'));const i=await slotIndex(p,'a','Horizontal Row');
 const base=await key(p,i,1,'Straight Sets','');await typeKey(p,base+'clusterSplit','2+2+2');await logStraight(p,i,1,{w:'80',r:'6',rir:'2'});
 const h=await hist(p);assert.strictEqual(h.length,1);assert.strictEqual(h[0].clusterSplit,'2+2+2');assert.strictEqual(h[0].strengthMethod,'Cluster Sets');
});
test('G3.12','G3: methods','Heavy primer (Giant A press) is stored in the strength history, separate from work sets',async p=>{
 await p.eval(()=>start('a'));const k=await p.eval(()=>document.querySelector('#exs input[data-save^="primer:0:"][data-save$=":w"]').dataset.save);
 const base=k.slice(0,-2);await typeKey(p,base+':w','245');await typeKey(p,base+':r','1');await typeKey(p,base+':rir','3');
 await p.click('#exs button[data-record="primer"]');
 const sh=await p.eval(()=>JSON.parse(localStorage.pa_strength_hist||'[]'));assert.strictEqual(sh.length,1);assert.strictEqual(sh[0].w,245);assert.strictEqual((await hist(p)).length,0,'primer leaked into work-set history');
});
test('G3.13','G3: methods','Loaded stretch hold: needs a positive time; a valid hold is stored in the stretch history',async p=>{
 await p.eval(()=>start('a'));
 const sel=await p.eval(()=>{const b=document.querySelector('#exs .lstretch');return !!b});if(!sel)throw Error('no loaded stretch rendered');
 await p.eval(()=>{document.querySelectorAll('#exs .lstretch input')[1].value=''});
 await clearNotice(p);await tagClick(p,()=>document.querySelector('#exs .lstretch button'));assert(/positive hold/i.test(await notice(p)),'empty hold accepted: '+await notice(p));assert.strictEqual((await p.eval(()=>JSON.parse(localStorage.pa_ls_hist||'[]'))).length,0);
 await p.eval(()=>{const i=document.querySelectorAll('#exs .lstretch input');i[0].value='45';i[1].value='60'});
 await tagClick(p,()=>document.querySelector('#exs .lstretch button'));
 const ls=await p.eval(()=>JSON.parse(localStorage.pa_ls_hist||'[]'));assert.strictEqual(ls.length,1);assert.strictEqual(ls[0].seconds,60);assert.strictEqual(ls[0].load,45);
});
test('G3.14','G3: methods','Activator (Giant B first slot): logged to the activator history, not to work-set history',async p=>{
 await startB(p,0);
 const k=await p.eval(()=>{const el=document.querySelector('#exs input[data-save^="activator:"][data-save$=":r"]');return el?el.dataset.save:null});if(!k)throw Error('no activator on Giant B');
 await typeKey(p,k,'20');await p.click('#exs button[data-record="activator"]');
 const ah=await p.eval(()=>JSON.parse(localStorage.pa_activator_hist||'[]'));assert.strictEqual(ah.length,1);assert.strictEqual((await hist(p)).length,0);
});
test('G3.15','G3: methods','Conditioning cardio entry saves one cardio record for the session',async p=>{
 await p.eval(()=>start('conditioning'));
 await p.eval(()=>{const i=document.querySelector('#exs [data-cardio] input[data-field]');i.value='30'});
 await p.click('#exs button.save-cardio');
 const c=await p.eval(()=>JSON.parse(localStorage.pa_cardio_hist||'[]'));assert.strictEqual(c.length,1);assert.strictEqual(Object.values(c[0].data).includes('30'),true);
});

// =====================================================================
// G4  Draft persistence and interrupted-session recovery
// =====================================================================
test('G4.1','G4: drafts & recovery','Interrupted mid-workout: logged sets, typed-but-unlogged values and the chosen exercise all come back after a reload, in the SAME session (no duplicate)',async p=>{
 await startUI(p,'Giant ACore workout');const id=await p.eval(()=>currentSession.id);
 await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});
 const k2=await key(p,4,1,'Straight Sets','');await typeKey(p,k2+'w','30');await typeKey(p,k2+'r','11');
 await reopen(p);
 assert(/Unfinished workouts/.test(await p.eval(()=>document.getElementById('homePlan').innerText)),'no resume banner');
 await p.click('#homePlan button.secondary','RESUME Giant A');
 assert.strictEqual(await p.eval(()=>currentSession.id),id);
 assert.strictEqual(await p.eval(k=>document.querySelector(`input[data-save="${k}w"]`).value,k2),'30');assert.strictEqual(await p.eval(k=>document.querySelector(`input[data-save="${k}r"]`).value,k2),'11');
 const k1=await key(p,3,1,'Straight Sets','');assert.strictEqual(await p.eval(k=>document.querySelector(`input[data-save="${k}w"]`).closest('.set').querySelector('button.check').textContent,k1),'✓');
 assert.strictEqual((await sessionsOf(p)).filter(s=>s.status==='draft').length,1);
});
test('G4.2','G4: drafts & recovery','EXIT keeps the draft; starting the same template again resumes it instead of creating another',async p=>{
 await startUI(p,'Giant ACore workout');await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});
 await p.click('button','EXIT');await p.click('#n-home');await p.click('#homePlan button.secondary','RESUME Giant A');await p.waitForFunction('document.querySelectorAll("#exs .exercise").length>0');
 assert.strictEqual((await sessionsOf(p)).length,1);assert.strictEqual((await hist(p)).length,1);
});
test('G4.3','G4: drafts & recovery','Two different drafts (A and B) coexist; each resumes with its own data',async p=>{
 await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});await p.eval(()=>show('home'));
 await p.eval(()=>start('b'));await logStraight(p,0,1,{w:'40',r:'10',rir:'2'});await p.eval(()=>show('home'));
 await reopen(p);const txt=await p.eval(()=>document.getElementById('homePlan').innerText);assert(/RESUME Giant A/.test(txt)&&/RESUME Giant B/.test(txt),txt);
 await p.click('#homePlan button.secondary','RESUME Giant B');assert.strictEqual(await p.eval(()=>currentSession.template),'b');
 assert.strictEqual((await hist(p)).filter(x=>x.template==='b').length,1);assert.strictEqual((await hist(p)).filter(x=>x.template==='a').length,1);
});
test('G4.4','G4: drafts & recovery','An interrupted Myo-Reps block keeps its typed efforts and effort check marks across a reload',async p=>{
 await startB(p,0);const i=await slotIndex(p,'b','Rear Delts'),j=await p.eval(i=>workSetCount(i),i);
 const r=await logStages(p,i,j,[[20,12],[20,5]],{save:false});
 await reopen(p);await p.click('#homePlan button.secondary','RESUME Giant B');
 assert.strictEqual(await p.eval(k=>document.querySelector(`input[data-save="${k}r1"]`).value,r.base),'5');
 const marks=await p.eval(i=>[...document.querySelectorAll('#exs .exercise')[i].querySelectorAll('[data-record="stage"]')].map(b=>b.textContent.trim()),i);assert.deepStrictEqual(marks.slice(0,2),['✓','✓']);
 assert.strictEqual((await hist(p)).length,0,'unsaved block must not be a history record');
});
test('G4.5','G4: drafts & recovery','The rest timer end time is saved with the draft and resumes after a reload',async p=>{
 await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});
 const te=await p.eval(()=>currentSession.timerEnd);assert(te>Date.now(),'timer end not stored');
 await reopen(p);await p.click('#homePlan button.secondary','RESUME Giant A');
 assert(!(await p.eval(()=>document.getElementById('timer').classList.contains('hidden'))),'timer not restored');
});
test('G4.6','G4: drafts & recovery','Session is autosaved on every input (no explicit save): typed values reach storage immediately',async p=>{
 await p.eval(()=>start('a'));const k=await key(p,3,1,'Straight Sets','');await typeKey(p,k+'w','77');
 const s=await sessionsOf(p);assert.strictEqual(s[0].forms[k+'w'],'77');
});

// =====================================================================
// G5  Completion, history records, summaries
// =====================================================================
test('G5.1','G5: completion','Finishing with nothing logged is refused and the session stays a draft',async p=>{
 await startUI(p,'Giant ACore workout');await finishUI(p);
 assert(/Log some work/.test(await notice(p)),await notice(p));assert.strictEqual((await sessionsOf(p))[0].status,'draft');
});
test('G5.2','G5: completion','Finishing a workout marks it complete with finish time, set count, recovery and notes; the draft banner and current-session pointer are gone',async p=>{
 await startUI(p,'Giant ACore workout');await logStraight(p,0,1,{w:'135',r:'5',rir:'2'});await logStraight(p,0,2,{w:'135',r:'5',rir:'1'});
 await p.click('button','FINISH WORKOUT');await p.eval(()=>{document.getElementById('finishRecovery').value='mixed'});await p.type('#finishNotes','felt flat');await p.click('button','SAVE COMPLETED WORKOUT');
 const s=(await sessionsOf(p))[0];assert.strictEqual(s.status,'complete');assert(!isNaN(Date.parse(s.finishedAt)));assert.strictEqual(s.setCount,2);assert.strictEqual(s.recovery,'mixed');assert.strictEqual(s.notes,'felt flat');
 assert.strictEqual(await p.eval(()=>localStorage.getItem('pa_current_session')),null);
 assert(!/Unfinished workouts/.test(await p.eval(()=>{renderPlan();return document.getElementById('homePlan').innerText})));
});
test('G5.3','G5: completion','A completed session is not resumable: starting the same template afterwards creates a new draft',async p=>{
 await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});await finishUI(p);
 await p.eval(()=>start('a'));const s=await sessionsOf(p);assert.strictEqual(s.length,2);assert.deepStrictEqual(s.map(x=>x.status).sort(),['complete','draft']);
});
test('G5.4','G5: completion','History records carry the session id, template, block, set number, final-set flag and a valid timestamp; ids are unique',async p=>{
 await p.eval(()=>start('a'));
 for(const j of [1,2,3])await logStraight(p,0,j,{w:'135',r:'5',rir:'2'});
 const h=await hist(p),sid=await p.eval(()=>currentSession.id);
 assert.strictEqual(h.length,3);for(const r of h){assert.strictEqual(r.sessionId,sid);assert.strictEqual(r.template,'a');assert.strictEqual(r.block,1);assert(Number.isInteger(r.setNumber));assert.strictEqual(typeof r.finalSet,'boolean');assert(!isNaN(Date.parse(r.date)))}
 assert.strictEqual(new Set(h.map(r=>r.id)).size,3);assert.strictEqual(h.filter(r=>r.finalSet).length,1);
});
test('G5.5','G5: summaries','After finishing A, B and Athletic through the UI, Training Budget and Coach Handoff count each exactly once with the corrected categories',async p=>{
 for(const [k,logfn] of [['a',()=>logStraight(p,3,1,{w:'95',r:'12',rir:'2'})],['b',()=>logStraight(p,0,1,{w:'40',r:'10',rir:'2'})]]){await p.eval(k=>start(k),k);await logfn();await finishUI(p)}
 await p.eval(()=>start('athletic'));await tagClick(p,()=>document.querySelector('#exs button.check'));await finishUI(p);
 const b=await p.eval(()=>budgetData());assert.deepStrictEqual(b,{Strength:1,Hypertrophy:1,Explosive:1,'High-intensity engine':0,'Low-intensity engine':0,Capability:1});
 const t=await p.eval(()=>coachSummary());assert(/Completed sessions: 3/.test(t),t.slice(0,400));assert(/Giant A: 1/.test(t)&&/Giant B: 1/.test(t)&&/Athletic: 1/.test(t),t);
});
test('G5.6','G5: summaries','Progress page set count and "Recent performance" reflect the logged work after a reload',async p=>{
 await p.eval(()=>start('a'));await logStraight(p,0,1,{w:'95',r:'12',rir:'2'});await logStraight(p,0,2,{w:'95',r:'11',rir:'2'});await finishUI(p);
 await reopen(p);await p.click('#n-progress');
 assert.strictEqual(await p.eval(()=>document.getElementById('setCount').textContent),'2');
 assert(/95 × 11/.test(await p.eval(()=>document.getElementById('recentPRs').innerText)),await p.eval(()=>document.getElementById('recentPRs').innerText));
});
test('G5.7','G5: persistence','A finished session, its records and the Home state survive refresh and reopen',async p=>{
 await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});await finishUI(p);
 const before=PA(await storage(p));await reopen(p);await reopen(p);const after=PA(await storage(p));
 assert.deepStrictEqual(Object.keys(after).sort(),Object.keys(before).sort());assert.strictEqual(after.pa_hist,before.pa_hist);assert.strictEqual(after.pa_sessions_v2,before.pa_sessions_v2);
 assert.deepStrictEqual(errorsOf(p),[]);
});

// =====================================================================
// G6  Can the athlete tell recorded / skipped / incomplete / completed apart?  (gap characterization)
// =====================================================================
test('G6.1','G6: distinguishing work (gap)','RECORDED vs NOT RECORDED is visible while training: a logged set shows a check mark, an unlogged set shows an open circle',async p=>{
 await p.eval(()=>start('a'));await logStraight(p,0,1,{w:'95',r:'12',rir:'2'});
 const marks=await p.eval(()=>[...document.querySelectorAll('#exs .exercise')[0].querySelectorAll('.set button.check')].map(b=>b.textContent.trim()));assert.deepStrictEqual(marks,['✓','○','○']);
});
test('G6.2','G6: distinguishing work','FIXED IN PHASE 2 (labels only): a workout finished with ONE logged set out of ~20 still counts as one completed session and one budget exposure, but Coach Handoff and the Finish notice now label it Partial',async p=>{
 await seedBSessions(p,0);
 await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});await finishUI(p);
 const t=await p.eval(()=>coachSummary()),b=await p.eval(()=>budgetData());
 assert(/Completed sessions: 1/.test(t));assert.strictEqual(b.Strength,1,'exposure counting is deliberately unchanged (decision D5)');
 assert(/Completion: Full 0 • Partial 1/.test(t)&&/Partial: Giant A: 1 of \d+ sets/.test(t),t.slice(0,400));
 const s=(await sessionsOf(p))[0];assert.strictEqual(s.setCount,1);assert.strictEqual(s.completion.prescription,'partial');assert.strictEqual(s.completion.performed,1);
});
test('G6.3','G6: distinguishing work (gap)','KNOWN GAP (narrowed in Phase 2): there is still no per-session history view; skipped work is labelled only in the Finish notice and Coach Handoff, not on Progress, Home or the After-action page',async p=>{
 await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});await finishUI(p);
 const screens=[];
 await p.eval(()=>show('progress'));screens.push(await p.eval(()=>document.getElementById('progress').innerText));
 await p.eval(()=>show('home'));screens.push(await p.eval(()=>document.getElementById('home').innerText));
 await p.eval(()=>osPage('aar'));screens.push(await p.eval(()=>document.getElementById('mpBody').innerText));
 for(const s of screens)assert(!/skipped|not done|omitted|incomplete/i.test(s),'a screen already labels skipped work: '+s.slice(0,200));
});
test('G6.4','G6: distinguishing work (gap)','INCOMPLETE is visible only as a draft: an unfinished workout is listed under "Unfinished workouts" with RESUME, never as a completed session',async p=>{
 await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});await p.eval(()=>show('home'));
 assert.strictEqual(await p.eval(()=>budgetData().Strength),0,'draft counted as exposure');
 assert(/Unfinished workouts/.test(await p.eval(()=>{renderPlan();return document.getElementById('homePlan').innerText})));
});

// =====================================================================
// G7  Backup export/import, malformed import rejection
// =====================================================================
async function openBackupPage(p){await p.click('#n-more');await p.click('button.moreitem[onclick="morePage(\'data\')"]');await p.waitForFunction('!!document.querySelector("#morepage input[type=file]")')}
async function importFile(p,file){await openBackupPage(p);await p.eval('document.getElementById("importPreview").textContent=""');await p.setFile('#morepage input[type=file]',file);await p.waitForFunction('document.getElementById("importPreview").textContent.trim().length>0',20000);return p.eval(()=>({text:document.getElementById('importPreview').textContent,can:[...document.querySelectorAll('#importPreview button')].some(b=>b.textContent.trim()==='RESTORE THIS BACKUP')}))}
async function restoreUI(p){const re=p.waitForLoad(30000).then(()=>true,()=>false);await p.click('button','RESTORE THIS BACKUP');const ok=await re;if(ok)await p.waitForFunction('typeof validateBackup==="function"&&document.readyState==="complete"');return ok}
const buildWorkflow=async p=>{
 await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});await logStraight(p,0,1,{w:'135',r:'5',rir:'2'});await finishUI(p);
 await startB(p,0);const i=await slotIndex(p,'b','Rear Delts'),j=await p.eval(i=>workSetCount(i),i);await logStages(p,i,j,[[20,12],[20,5]]);
 const k=await key(p,0,1,'Straight Sets','');await typeKey(p,k+'w','41');await p.eval(()=>show('home'));
};
test('G7.1','G7: backup & restore','Export after a real workflow (finished session + draft with a saved Myo block + typed value) restores in a clean profile with every stored value identical (draft updatedAt aside), and the draft resumes with its inputs',async p=>{
 await buildWorkflow(p);const before=PA(await storage(p));
 await openBackupPage(p);const d=await p.download(()=>p.click('button','EXPORT FULL BACKUP'));const exp=JSON.parse(fs.readFileSync(d.file,'utf8'));
 assert.strictEqual(exp.format,'project-america-full-backup');sameStore(exp.data,before,'export vs live');
 const q=await openApp();
 try{const r=await importFile(q,d.file);assert(r.can,r.text);assert(await restoreUI(q));
  sameStore(PA(await storage(q)),before,'restored vs exported');
  await q.click('#homePlan button.secondary','RESUME Giant B');
  const k=await key(q,0,1,'Straight Sets','');assert.strictEqual(await q.eval(k=>document.querySelector(`input[data-save="${k}w"]`).value,k),'41');
  assert.deepStrictEqual(errorsOf(q),[]);
 }finally{await q.close()}
});
const MAL=[
 ['not JSON','{"format":'],['empty file',''],['JSON array','[1,2,3]'],['JSON null','null'],
 ['wrong format',JSON.stringify({format:'other',version:1,data:{}})],['wrong version',JSON.stringify({format:'project-america-full-backup',version:2,data:{}})],
 ['data is an array',JSON.stringify({format:'project-america-full-backup',version:1,data:[]})],
 ['unknown pa_ key',JSON.stringify({format:'project-america-full-backup',version:1,data:{pa_evil:'1'}})],
 ['non-string value',JSON.stringify({format:'project-america-full-backup',version:1,data:{pa_hist:[1]}})],
 ['hist is an object',JSON.stringify({format:'project-america-full-backup',version:1,data:{pa_hist:'{}'}})],
 ['hist item is an array',JSON.stringify({format:'project-america-full-backup',version:1,data:{pa_hist:'[[1]]'}})],
 ['session with unknown template',JSON.stringify({format:'project-america-full-backup',version:1,data:{pa_sessions_v2:JSON.stringify([{id:'x1',template:'nope',phase:1,weekMode:'normal',status:'draft',forms:{},checks:{},choices:{},modes:{}}])}})],
 ['session with bad status',JSON.stringify({format:'project-america-full-backup',version:1,data:{pa_sessions_v2:JSON.stringify([{id:'x1',template:'a',phase:1,weekMode:'normal',status:'weird',forms:{},checks:{},choices:{},modes:{}}])}})],
 ['script in exercise name',JSON.stringify({format:'project-america-full-backup',version:1,data:{pa_hist:JSON.stringify([{id:'x',name:'<img src=x onerror=alert(1)>',w:1,reps:1,date:'2026-01-01T00:00:00.000Z'}])}})],
 ['__proto__ key in OS state',JSON.stringify({format:'project-america-full-backup',version:1,data:{pa_os_v2:'{"__proto__":{"x":1},"readiness":{},"tests":{},"skill":{},"bodyweight":1}'}})],
 ['unknown intensifier preference',JSON.stringify({format:'project-america-full-backup',version:1,data:{pa_int_a_0_Bench:'Hax'}})],
];
test('G7.2','G7: backup & restore',`Malformed or hostile imports (${MAL.length} cases) are rejected, the restore button never appears, and storage and the draft are unchanged afterwards (draft updatedAt aside)`,async p=>{
 await buildWorkflow(p);const before=await storage(p);
 for(const [name,body] of MAL){
  const r=await importFile(p,writeFile(body));assert(!r.can,name+': restore offered');assert(r.text.trim().length>0,name+': no explanation');
 }
 sameStore(await storage(p),before,'after 16 rejected imports');
 await p.eval(()=>show('home'));await p.click('#homePlan button.secondary','RESUME Giant B');assert.strictEqual(await p.eval(()=>currentSession.template),'b');
});
test('G7.3','G7: backup & restore','A tampered file changed after preview is re-validated at restore time and refused with storage unchanged',async p=>{
 await buildWorkflow(p);const before=await storage(p);
 const good=await p.eval(()=>backupPayload());const r=await importFile(p,writeFile(good));assert(r.can);const pre=PA(await storage(p));
 await p.eval(()=>{pendingImport.data.pa_sessions_v2='[{"id":"bad id!","template":"a"}]'});
 await p.click('button','RESTORE THIS BACKUP');await sleep(300);
 assert(/Restore failed/.test(await notice(p)),await notice(p));sameStore(PA(await storage(p)),pre,'after refused restore (strict, vs state at preview)',true);sameStore(PA(await storage(p)),PA(before),'after refused restore vs start');
});

test('G7.4','G7: backup & restore','Cardio text with comparison signs ("<10:00") is saved, the app\'s own export validates and restores it, and HTML-like text ("<b>") is refused at logging (fix of the Phase 1 defect D1)',async p=>{
 await p.eval(()=>start('conditioning'));
 await p.eval(()=>{const i=document.querySelector('#exs [data-cardio] input[data-field]');i.value='<10:00'});
 await p.click('#exs button.save-cardio');
 assert.strictEqual((await p.eval(()=>JSON.parse(localStorage.pa_cardio_hist||'[]'))).length,1,'cardio entry was not saved: '+await notice(p));
 assert.strictEqual(await p.eval(()=>{try{validateBackup(backupPayload());return 'accepted'}catch(e){return e.message}}),'accepted');
 await p.eval(()=>{localStorage.pa_cardio_hist='[]';const i=document.querySelector('#exs [data-cardio] input[data-field]');i.value='<b>bold</b>'});
 await clearNotice(p);await p.click('#exs button.save-cardio');
 assert.strictEqual((await p.eval(()=>JSON.parse(localStorage.pa_cardio_hist||'[]'))).length,0,'HTML-like text was stored');assert(/comparison/i.test(await notice(p)),await notice(p));
});

// =====================================================================
// G8  Storage-failure handling (real quota)
// =====================================================================
async function fillStorage(p,headroom){
 return p.eval(h=>{const probe='x'.repeat(1024);let n=0;localStorage.removeItem('zz_filler');let s='';
  // grow one filler value until the origin quota is hit, then trim back to leave `h` characters free
  let size=1<<22;let lo=0,hi=size;
  const fits=len=>{try{localStorage.setItem('zz_filler','y'.repeat(len));return true}catch{return false}};
  while(fits(hi))hi*=2;while(hi-lo>1){const mid=(lo+hi)>>1;if(fits(mid))lo=mid;else hi=mid}
  fits(Math.max(0,lo-h));return lo},headroom);
}
test('G8.1','G8: storage failure','When browser storage is full, logging a set shows a clear message, writes no partial record, does not mark the set done, and works again once space is freed',async p=>{
 await p.eval(()=>start('a'));const before=await hist(p);
 await fillStorage(p,10);
 await clearNotice(p);await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});
 const msg=await notice(p);assert(/Storage could not save/i.test(msg),'no storage message: '+msg);
 assert.deepStrictEqual(await hist(p),before,'a partial record was written');
 const mark=await p.eval(()=>document.querySelectorAll('#exs .exercise')[3].querySelector('.set button.check').textContent.trim());assert.strictEqual(mark,'○','set shown as done although it was not saved');
 await p.eval(()=>localStorage.removeItem('zz_filler'));await clearNotice(p);
 await tagClick(p,()=>document.querySelectorAll('#exs .exercise')[3].querySelector('.set[data-set="1"] button[data-record="straight"]'));
 assert.strictEqual((await hist(p)).length,1,'logging did not recover after space was freed');
 assert.deepStrictEqual(errorsOf(p),[]);
});
test('G8.2','G8: storage failure','If saving the finished session fails, the workout stays an unfinished draft with its records intact, and finishing succeeds after space is freed',async p=>{
 await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});
 await p.eval(()=>{window.__realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='pa_sessions_v2'&&/"status":"complete"/.test(v))throw new DOMException('forced','QuotaExceededError');return window.__realSet.call(this,k,v)}});
 await finishUI(p);
 assert(/Storage could not save/i.test(await notice(p)),await notice(p));
 const s=await sessionsOf(p);assert.strictEqual(s[0].status,'draft','session recorded as complete although the save failed');assert.strictEqual((await hist(p)).length,1);
 await p.eval(()=>{Storage.prototype.setItem=window.__realSet});await p.click('button','SAVE COMPLETED WORKOUT');
 assert.strictEqual((await sessionsOf(p))[0].status,'complete');
});
test('G8.3','G8: storage failure','A restore that cannot fit in storage is refused with a plain message and leaves every byte of existing data (including the draft) unchanged',async p=>{
 await buildWorkflow(p);const before=await storage(p);
 const big=await p.eval(()=>{const n=baseSlots.a[0][1][0],h=[];for(let i=0;i<27000;i++)h.push({id:'big-'+i,sessionId:'big',name:n,intensifier:'Straight Sets',w:100,reps:5,rir:2,date:'2026-10-01T12:00:00.000Z',pad:'x'.repeat(80)});return JSON.stringify(h)});
 const r=await importFile(p,writeFile({format:'project-america-full-backup',version:1,appVersion:'2.3',createdAt:'2026-10-12T00:00:00.000Z',data:{pa_hist:big}}));assert(r.can,r.text);const pre=PA(await storage(p));
 await p.click('button','RESTORE THIS BACKUP');await p.waitForFunction('/Restore failed|could not|rollback/i.test(document.getElementById("appNotice").textContent)',30000);
 assert(/storage/i.test(await notice(p)),await notice(p));sameStore(PA(await storage(p)),pre,'after refused restore (strict, vs state at preview)',true);sameStore(PA(await storage(p)),PA(before),'after refused restore vs start');
});

// =====================================================================
// G9  PWA: offline behaviour and service-worker cache updates
// =====================================================================
async function swState(p){return p.eval(async()=>{const reg=await navigator.serviceWorker.getRegistration();return {controller:!!navigator.serviceWorker.controller,active:!!reg?.active,waiting:!!reg?.waiting,caches:await caches.keys(),updateVisible:!document.getElementById('updateButton').classList.contains('hidden'),status:document.getElementById('offlineStatus').textContent}})}
test('G9.1','G9: PWA / offline','The service worker installs, takes control after a reload, and caches the shell under the integration cache name',async p=>{
 await p.waitForFunction('navigator.serviceWorker&&navigator.serviceWorker.getRegistration().then(r=>!!r&&!!r.active)',15000).catch(()=>{});
 await p.reload();await sleep(500);const s=await swState(p);
 assert(s.active&&s.controller,JSON.stringify(s));assert(s.caches.some(c=>c==='project-america-shell-v2-3-phase3-20261019'),JSON.stringify(s.caches));assert(/Ready offline/.test(s.status),s.status);
});
test('G9.2','G9: PWA / offline','Offline: the app reloads from cache, a workout can be started, a set logged, saved and finished with the network disabled',async p=>{
 await p.reload();await sleep(800);assert((await swState(p)).controller);
 await p.offline(true);
 try{
  await p.reload();await p.waitForFunction('typeof start==="function"');
  await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});await finishUI(p);
  assert.strictEqual((await sessionsOf(p))[0].status,'complete');assert.strictEqual((await hist(p)).length,1);
  assert(/Offline|Ready offline/.test(await p.eval(()=>document.getElementById('offlineStatus').textContent)));
 }finally{await p.offline(false)}
 assert.deepStrictEqual(p.requests.filter(u=>!u.startsWith(ctx.origin)&&!u.startsWith('data:')&&!u.startsWith('blob:')),[],'external requests');
});

// ---- swap-able server for the cache-update tests ----
function swapServer(initialDir){
 let root=path.resolve(initialDir);const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png'};
 const srv=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');const rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');const f=path.resolve(root,rel);if(!f.startsWith(root)){res.writeHead(403);return res.end()}
  fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(b)})});
 return new Promise(r=>srv.listen(0,'127.0.0.1',()=>r({origin:'http://127.0.0.1:'+srv.address().port,setRoot:d=>{root=path.resolve(d)},close:()=>new Promise(c=>srv.close(c))})));
}
test('G9.3','G9: PWA / offline','Cache update path: an installed OLD version shows an update prompt when the new version is deployed, does NOT replace itself mid-workout, keeps the draft, and after the tap runs the new code under the new cache name with the old cache deleted',async()=>{
 if(!oldApp)throw Error('skipped: pass --old-app <dir> (a previously deployed tree: app/ for PR #1, baseline/hq-2.3 for the original)');
 const s=await swapServer(oldApp);const b=ctx.browser;const p=await b.newPage(dl);
 try{
  await p.goto(s.origin+'/');await p.waitForFunction('navigator.serviceWorker.getRegistration().then(r=>!!r&&!!r.active)',15000);await p.reload();await sleep(500);
  const old=await swState(p);const oldCache=/const CACHE='([^']+)'/.exec(fs.readFileSync(path.join(oldApp,'sw.js'),'utf8'))[1];
  assert(old.controller&&old.caches.includes(oldCache),JSON.stringify(old));
  assert.strictEqual(await p.eval(()=>typeof readinessStatus),'undefined','old app unexpectedly has new code');
  await p.eval(()=>start('a'));await logStraight(p,3,1,{w:'95',r:'12',rir:'2'});const draftBefore=(await sessionsOf(p))[0].id;
  s.setRoot(appDir);
  await p.eval(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
  await p.waitForFunction('document.getElementById("updateButton")&&!document.getElementById("updateButton").classList.contains("hidden")',15000);
  const waiting=await swState(p);assert(waiting.waiting&&waiting.updateVisible,JSON.stringify(waiting));
  assert.strictEqual(await p.eval(()=>typeof readinessStatus),'undefined','new code took over before the user tapped update');
  assert.strictEqual(await p.eval(()=>currentSession&&currentSession.id),draftBefore,'running workout was disturbed');
  assert(!(await p.eval(()=>document.getElementById('updateButton').offsetParent!==null)),'update button is on the workout screen; expected only on Home');
  await p.click('#n-home');
  const re=p.waitForLoad(20000).then(()=>true,()=>false);await p.click('#updateButton');assert(await re,'page did not reload after update');
  await p.waitForFunction('typeof readinessStatus==="function"',15000);await sleep(500);
  const now=await swState(p);assert.deepStrictEqual(now.caches,['project-america-shell-v2-3-phase3-20261019'],JSON.stringify(now.caches));
  const ss=await sessionsOf(p);assert.strictEqual(ss.length,1);assert.strictEqual(ss[0].id,draftBefore);assert.strictEqual((await hist(p)).length,1);
  await p.click('#homePlan button.secondary','RESUME Giant A');assert.strictEqual(await p.eval(()=>currentSession.id),draftBefore);
 }finally{await p.close();await s.close()}
});
test('G9.4','G9: PWA / offline','Every file the service worker pre-caches exists on the server and the cached index.html is the served one (no stale shell)',async p=>{
 await p.reload();await sleep(500);
 const r=await p.eval(async()=>{const files=['/','/index.html','/install.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon.png'];const c=await caches.open((await caches.keys())[0]);const out=[];for(const f of files){const net=await fetch(f,{cache:'no-store'});const hit=await c.match(f);out.push({f,net:net.status,cached:!!hit,same:hit?(await hit.clone().text()).length===(await net.clone().text()).length||f.endsWith('.png'):false})}return out});
 for(const x of r){assert.strictEqual(x.net,200,x.f);assert(x.cached,'not cached: '+x.f);assert(x.same,'cached copy differs: '+x.f)}
});

// ---------- runner ----------
(async()=>{
 const server=await serve(appDir),browser=await launch();ctx={browser,origin:server.origin};
 const results=[];let failed=0;
 console.log(`Project America gym-workflow suite\nApp under test: ${path.resolve(appDir)}\n`);
 try{
  for(const t of tests){
   if(only&&!only.includes(t.id))continue;
   let p,error=null;const start=Date.now();
   try{p=await openApp();await t.fn(p)}catch(e){error=e.message.split('\n').slice(0,4).join(' | ').slice(0,520)}
   finally{if(p)await p.close()}
   results.push({id:t.id,group:t.group,title:t.title,pass:!error,error,ms:Date.now()-start});if(error)failed++;
   console.log(`${error?'FAIL':'PASS'} ${t.id.padEnd(5)} ${t.title.slice(0,150)}${error?'\n      → '+error:''}`);
  }
 }finally{await browser.close();await server.close()}
 console.log(`\n${results.length-failed} passed, ${failed} failed, ${results.length} total`);
 if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify({app:path.resolve(appDir),date:new Date().toISOString(),passed:results.length-failed,failed,results},null,1));
 process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=2});

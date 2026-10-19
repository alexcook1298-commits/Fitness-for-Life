'use strict';
// Project America HQ 2.3 — Phase 3 suite: training accuracy.
//   RT  Giant B intensifier-rotation credit (performed, not merely finished)   (Priority 1)
//   EV  evidence engine vs partial / skipped work (audit, characterization)    (Priority 2)
//   SK  explicit exercise skip                                                  (Priority 3)
//   BX  training-budget exposure reporting                                      (Priority 4)
//   HB  historical cardio backup compatibility                                  (Priority 5)
// Usage: node tests/phase3.test.js <appDir> [--json out.json] [--only ID,ID] [--group RT,EV,...]
// Drives the real app in headless Chrome. Synthetic data, disposable profiles. Written BEFORE each implementation.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const {launch}=require('./lib/cdp'),{serve}=require('./lib/server'),clock=require('./lib/clock');

const args=process.argv.slice(2);
const opt=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
const appDir=args.find(a=>!a.startsWith('--')&&!['--json','--only','--group'].includes(args[args.indexOf(a)-1]));
if(!appDir){console.error('Usage: node tests/phase3.test.js <appDir> [--json out.json] [--only ID,ID] [--group RT,EV,SK,BX,HB]');process.exit(2)}
const jsonOut=opt('--json'),only=opt('--only')?opt('--only').split(','):null,groups=opt('--group')?opt('--group').split(','):null;
const work=fs.mkdtempSync(path.join(os.tmpdir(),'pa-p3-'));const dl=path.join(work,'downloads');fs.mkdirSync(dl);
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

// =====================================================================
// RT — Giant B intensifier rotation credited by what was performed
// =====================================================================
// Perform the presented intensifier on slot i exactly as the athlete would (stage inputs + SAVE FINAL BLOCK, or the single Widowmaker set).
const rtPerform=(p,i)=>p.eval(i=>{
 const n=selected(active,i),j=workSetCount(i),mode=setMode(i,j,n);if(mode==='Straight Sets')return 'straight';
 const key=formKey(i,j,mode,''),labels=methodStages(mode),put=(k,v)=>{const el=document.querySelector(`#exs input[data-save="${k}"]`);if(!el)throw Error('no input '+k);el.value=v};
 if(labels){const need=mode==='Myo-Reps'?2:labels.length;for(let k=0;k<need;k++){put(key+'w'+k,'50');put(key+'r'+k,'10')}saveCluster(i,j)}
 else{put(key+'w','100');put(key+'r','12');put(key+'rir','1');logSet(null,i,j)}
 return mode},i);
const rtStraight=(p,i,j=1)=>p.eval((i,j)=>{const n=selected(active,i),mode='Straight Sets',key=formKey(i,j,mode,'');
 const put=(f,v)=>{const el=document.querySelector(`#exs input[data-save="${key}${f}"]`);if(!el)throw Error('no straight input '+key+f);el.value=v};put('w','60');put('r','10');put('rir','2');logSet(null,i,j)},i,j);
const rtStart=(p,o={})=>p.eval(o=>{if(o.weekMode)weekMode=o.weekMode;start('b');if(o.compact)toggleCompact();return {id:currentSession.id,rotation:currentSession.rotation||null}},o);
const rtShown=p=>p.eval(()=>[3,4,1,5,0,6].map(i=>[i,todayInt(i,selected('b',i))]).filter(x=>x[1]!=='Straight Sets').map(x=>x[0]).sort());
const rtFinish=async p=>{await p.eval(()=>{openFinish();finishSession()})};
// Falls back to the legacy counter so that, before the fix, tests fail on BEHAVIOUR rather than on a missing function.
const rtNext=p=>p.eval(()=>typeof rotationNextGroup==='function'?rotationNextGroup():completedTemplateCount('b')%3);
const rtSessions=p=>p.eval(()=>JSON.parse(localStorage.pa_sessions_v2||'[]'));
// One whole Giant B: start, perform every presented intensifier slot, finish. Returns the group it presented.
async function rtFullB(p){const s=await rtStart(p);const g=await p.eval(()=>currentSession.rotation?.group??completedTemplateCount('b')%3);for(const i of await rtShown(p))await rtPerform(p,i);await rtFinish(p);return g}
const legacyGroup=p=>p.eval(()=>completedTemplateCount('b')%3);

test('RT1','Parity: with only pre-change history (no rotation snapshots) the next group equals the legacy counter for 0-8 completed Giant B, and drafts and other templates are ignored exactly as before',async p=>{
 for(let n=0;n<=8;n++){
  const rows=Array.from({length:n},(_,k)=>bsess('p'+k,'b','complete',20-k));rows.push(bsess('d','b','draft',0),bsess('a1','a'),bsess('u1','bu'));
  await seedS(p,rows);const [leg,nxt]=[await legacyGroup(p),await rtNext(p)];assert.strictEqual(nxt,leg,'n='+n);
  const live=await p.eval(()=>{currentSession=null;return [3,4,1,5,0,6].map(i=>[i,giantBRotation(i,selected('b',i))])});
  const want=await p.eval(()=>{const act=[[3,4],[1,5],[0,6]][completedTemplateCount('b')%3];return [3,4,1,5,0,6].map(i=>[i,act.includes(i)?preferredIntensifier(selected('b',i)):'Straight Sets'])});
  assert.deepStrictEqual(live,want,'presented intensifiers differ from the legacy rule at n='+n);
 }
});
test('RT2','Starting Giant B writes an additive rotation snapshot (group, slots, presented methods); other templates get none; the snapshot equals what is displayed',async p=>{
 await seedS(p,[]);const r=await rtStart(p);assert(r.rotation,'no snapshot');
 assert.strictEqual(r.rotation.v,1);assert.strictEqual(r.rotation.group,0);assert.deepStrictEqual(r.rotation.slots,GROUPS[0]);
 assert.strictEqual(r.rotation.methods['3'],'Myo-Reps');assert.strictEqual(r.rotation.methods['4'],'DC Rest-Pause');
 assert.deepStrictEqual(await rtShown(p),[3,4]);
 for(const k of ['a','bu','bl','mobility']){await p.eval(k=>{show('home');currentSession=null;start(k)},k);assert.strictEqual(await p.eval(()=>currentSession.rotation),undefined,k+' got a rotation snapshot')}
});
test('RT3','A Giant B whose presented intensifiers were performed credits its group: the groups then rotate 0,1,2,0,1,2 exactly as before for an athlete who performs them',async p=>{
 await seedS(p,[]);const seq=[];for(let k=0;k<6;k++)seq.push(await rtFullB(p));
 assert.deepStrictEqual(seq,[0,1,2,0,1,2]);assert.strictEqual(await rtNext(p),0);
});
test('RT4','A finished Giant B in which the presented intensifier was SKIPPED (straight work only) earns no credit: the same group is offered at the next Giant B, and the finished session still counts as a session',async p=>{
 await seedS(p,[]);await rtStart(p);await rtStraight(p,2);await rtFinish(p);
 assert.strictEqual(await p.eval(()=>completedTemplateCount('b')),1,'session count must be unchanged');
 assert.strictEqual(await rtNext(p),0,'group 0 must be offered again');
 const s2=await rtStart(p);assert.strictEqual(s2.rotation.group,0);assert.deepStrictEqual(await rtShown(p),[3,4]);
});
test('RT5','A partially done intensifier earns nothing: Myo-Reps with one effort cannot be saved, and a session that finishes after that attempt does not credit the group',async p=>{
 await seedS(p,[]);await rtStart(p);
 await p.eval(()=>{const i=3,n=selected('b',i),j=workSetCount(i),key=formKey(i,j,'Myo-Reps','');const el=document.querySelector(`#exs input[data-save="${key}r0"]`);el.value='10';saveCluster(i,j)});
 assert(!(await p.eval(()=>JSON.parse(localStorage.pa_hist||'[]').some(x=>x.intensifier==='Myo-Reps'))),'a one-effort block was stored');
 await rtStraight(p,2);await rtFinish(p);assert.strictEqual(await rtNext(p),0);
});
test('RT6','Credit policy "any": if a group presents two intensifier slots and only one is performed, the group is credited (the other method waits for the group to come round again)',async p=>{
 await seedS(p,[]);await rtStart(p);await rtPerform(p,3);await rtFinish(p);assert.strictEqual(await rtNext(p),1);
});
test('RT7','Interrupted then resumed: a draft that performed the intensifier is credited ONCE; resuming (even after a reload) shows the same methods, and finishing does not credit again',async p=>{
 await seedS(p,[]);const a=await rtStart(p);await rtPerform(p,3);const shownBefore=await rtShown(p);
 await p.eval(()=>show('home'));assert.strictEqual(await rtNext(p),1,'performed work must credit even while the session is still a draft');
 await p.goto(ctx.origin+'/');const b=await rtStart(p);assert.strictEqual(b.id,a.id,'a new session was created instead of resuming');assert.strictEqual(b.rotation.group,0);
 assert.deepStrictEqual(await rtShown(p),shownBefore,'the displayed intensifiers flipped after the draft was credited');
 await rtPerform(p,4);await rtFinish(p);assert.strictEqual(await rtNext(p),1,'finishing a resumed session credited twice');
 assert.strictEqual((await rtSessions(p)).length,1);
});
test('RT8','Interrupted before any intensifier: no credit, no lapse count; resuming keeps the same snapshot',async p=>{
 await seedS(p,[]);const a=await rtStart(p);await rtStraight(p,2);await p.eval(()=>show('home'));
 assert.strictEqual(await rtNext(p),0);const led=await p.eval(()=>rotationLedger());assert.deepStrictEqual(led.streak,[0,0,0]);
 await p.goto(ctx.origin+'/');const b=await rtStart(p);assert.strictEqual(b.id,a.id);assert.deepStrictEqual(b.rotation,a.rotation);
});
test('RT9','No duplicate credit: duplicated session objects and duplicated records (as from a merged restore) credit a group once',async p=>{
 await seedS(p,[]);const a=await rtStart(p);await rtPerform(p,3);await rtFinish(p);
 await p.eval(()=>{const s=JSON.parse(localStorage.pa_sessions_v2);localStorage.pa_sessions_v2=JSON.stringify([...s,...s,...s]);const h=JSON.parse(localStorage.pa_hist);localStorage.pa_hist=JSON.stringify([...h,...h])});
 await p.goto(ctx.origin+'/');assert.strictEqual(await rtNext(p),1,'duplicates advanced the rotation more than once');
});
test('RT10','Lapse (decision R4 = 2): a group that two consecutive finished sessions presented but nobody performed is moved back, so rotation can never be blocked and the same method is not offered forever',async p=>{
 await seedS(p,[]);const g=[];
 for(let k=0;k<2;k++){await rtStart(p);g.push(await p.eval(()=>currentSession.rotation?currentSession.rotation.group:completedTemplateCount('b')%3));await rtStraight(p,2);await rtFinish(p)}
 assert.deepStrictEqual(g,[0,0]);assert.strictEqual(await rtNext(p),1,'group 0 should lapse after two uncredited finished presentations');
 assert.strictEqual(await p.eval(()=>completedTemplateCount('b')),2,'counts unchanged');
});
test('RT11','Busy week and COMPACT hide or suppress the intensifier: the session finishes and counts, but the group is not credited',async p=>{
 await seedS(p,[]);await rtStart(p,{weekMode:'busy'});await rtStraight(p,2);await rtFinish(p);assert.strictEqual(await rtNext(p),0,'busy week credited an intensifier nobody performed');
 await p.eval(()=>{weekMode='normal'});await seedS(p,[]);await rtStart(p,{compact:true});await rtStraight(p,2);await rtFinish(p);assert.strictEqual(await rtNext(p),0,'compact credited');
});
test('RT12','Other templates never move the Giant B rotation, even when they perform intensifiers (Giant B Upper/Lower, Giant A)',async p=>{
 await seedS(p,[bsess('x1','a'),bsess('x2','bu'),bsess('x3','bl'),bsess('x4','bonusarms')]);assert.strictEqual(await rtNext(p),0);
});
test('RT13','A manual intensifier on a slot OUTSIDE the presented group does not credit any group',async p=>{
 await seedS(p,[]);await rtStart(p);
 await p.eval(()=>{const i=1,n=selected('b',i);currentSession.modes[i+':'+n]='Rest-Pause';render()});await rtPerform(p,1);
 assert(await p.eval(()=>JSON.parse(localStorage.pa_hist).some(x=>x.intensifier==='Rest-Pause')),'override not logged');
 await rtFinish(p);assert.strictEqual(await rtNext(p),0);
});
test('RT14','Legacy history then new sessions: pre-change completed Giant B keep their legacy meaning (no re-judging), and the new era continues from them',async p=>{
 await seedS(p,[bsess('p0','b','complete',9),bsess('p1','b','complete',8)]);assert.strictEqual(await rtNext(p),2);
 assert.strictEqual(await rtFullB(p),2);assert.strictEqual(await rtNext(p),0);
});
test('RT15','Order and clock independence: the derived group does not depend on array order of sessions; every session is judged on its own snapshot',async p=>{
 await seedS(p,[]);await rtFullB(p);await rtFullB(p);
 const forward=await rtNext(p);await p.eval(()=>{const s=JSON.parse(localStorage.pa_sessions_v2).reverse();localStorage.pa_sessions_v2=JSON.stringify(s)});await p.goto(ctx.origin+'/');
 assert.strictEqual(await rtNext(p),forward);assert.strictEqual(forward,2);
});
test('RT16','Derivation is read-only and preserves history: calling it writes nothing; legacy sessions and every earlier record stay byte-identical after new sessions',async p=>{
 await seedS(p,[bsess('p0','b','complete',9)]);await p.eval(()=>{localStorage.pa_hist=JSON.stringify([{id:'p0|3|Rear-Delt Fly (DB)|2|Myo-Reps',sessionId:'p0',name:'Rear-Delt Fly (DB)',intensifier:'Myo-Reps',structured:true,reps:20,w:50,efforts:[{stage:1,w:50,reps:10},{stage:2,w:50,reps:10}],template:'b',block:1,setNumber:2,date:'2026-01-01T10:00:00.000Z'}])});
 await p.goto(ctx.origin+'/');const before=await storage(p);await p.eval(()=>{rotationNextGroup();rotationLedger()});assert.deepStrictEqual(await storage(p),before);
 const s0=(await rtSessions(p))[0],h0=await p.eval(()=>localStorage.pa_hist);await rtFullB(p);
 assert.deepStrictEqual((await rtSessions(p))[0],s0);assert(JSON.parse(await p.eval(()=>localStorage.pa_hist))[0]&&(await p.eval(()=>localStorage.pa_hist)).startsWith(h0.slice(0,-1)),'earlier record changed');
 assert.strictEqual((await rtSessions(p))[0].rotation,undefined);
});
test('RT17','Backup round trip and validation: a session carrying a rotation snapshot restores identically; malformed snapshots (bad group, slots that do not match the group, unknown method, extra keys, markup) are refused',async p=>{
 await seedS(p,[]);await rtFullB(p);const s=(await rtSessions(p))[0];assert(s.rotation);
 const payload=await p.eval(()=>{const b=backupPayload();validateBackup(b);return b});
 await p.eval(()=>{localStorage.clear()});await p.goto(ctx.origin+'/');
 const back=await p.eval(b=>{validateBackup(b);replacePAData(b.data);return JSON.parse(localStorage.pa_sessions_v2)[0]},payload);assert.deepStrictEqual(back.rotation,s.rotation);
 const ok=s.rotation;
 const rej=async rot=>p.eval(t=>{const o=JSON.parse(t);const b=fullBackup({pa_sessions_v2:JSON.stringify([o])});try{validateBackup(b);return 'ACCEPTED'}catch(e){return e.message}},JSON.stringify({...s,rotation:rot}));
 assert.strictEqual(await rej(ok),'ACCEPTED');
 const bad={'group 3':{...ok,group:3},'slots mismatch':{...ok,slots:[0,1]},'unknown method':{...ok,methods:{'3':'Zumba'}},'extra key':{...ok,x:1},'version':{...ok,v:2},'markup method':{...ok,methods:{'3':'<img src=x>'}},'basis':{...ok,basis:'magic'},'not object':'0','methods slot outside group':{...ok,methods:{'0':'Myo-Reps'}}};
 for(const [why,r] of Object.entries(bad)){const m=await rej(r);assert(m!=='ACCEPTED'&&/rotation/i.test(m),why+' -> '+m)}
});
test('RT18','A Giant B started on an older install (draft without a snapshot) resumes safely: no snapshot is invented, the legacy group is displayed, and finishing keeps the legacy credit',async p=>{
 await seedS(p,[bsess('old','b','draft',0)]);await p.eval(()=>{const s=JSON.parse(localStorage.pa_sessions_v2);s[0].startedAt=new Date().toISOString();localStorage.pa_sessions_v2=JSON.stringify(s)});await p.goto(ctx.origin+'/');
 const r=await rtStart(p);assert.strictEqual(r.id,'old');assert.strictEqual(r.rotation,null);assert.deepStrictEqual(await rtShown(p),[3,4]);
 await rtStraight(p,2);await rtFinish(p);assert.strictEqual(await rtNext(p),1,'a pre-change draft finished as a pre-change session credits by the legacy rule');
});
test('RT19','Full Session prescriptions unchanged: Giant B set counts per slot and the base slot table are untouched by rotation',async p=>{
 assert.deepStrictEqual(await p.eval(()=>baseSlots.b.map(x=>x[2])),[2,2,2,2,2,2,1,2]);
 await seedS(p,[]);await rtFullB(p);assert.deepStrictEqual(await p.eval(()=>baseSlots.b.map(x=>x[2])),[2,2,2,2,2,2,1,2]);
});

// =====================================================================
// SK — explicit exercise skip (Priority 3)
// =====================================================================
const skStart=(p,k,o={})=>p.eval((k,o)=>{if(o.weekMode)weekMode=o.weekMode;start(k);if(o.compact)toggleCompact();
 (slots[k]||[]).forEach((x,i)=>{currentSession.modes[i+':'+selected(k,i)]='Straight Sets'});render();return currentSession.id},k,o);
const skSkip=(p,i)=>p.eval(i=>{document.querySelector(`#exs button[data-skip="${i}"]`).click()},i);
const skLog=(p,i,j)=>p.eval((i,j)=>{const n=selected(active,i),mode=setMode(i,j,n),key=formKey(i,j,mode,'');
 const put=(f,v)=>{const el=document.querySelector(`#exs input[data-save="${key}${f}"]`);if(!el)throw Error('no input '+key+f);el.value=v};put('w','100');put('r','10');put('rir','2');logSet(null,i,j)},i,j);
const skFinish=async p=>{await p.eval(()=>{openFinish();finishSession()});return p.eval(()=>JSON.parse(localStorage.pa_sessions_v2).at(-1))};
const skSets=p=>p.eval(()=>slots[active].map((x,i)=>workSetCount(i)));

test('SK1','One Skip control per displayed exercise of a lifting template (labelled), none on checklist templates; nothing else in the workout screen changes',async p=>{
 await skStart(p,'a');const r=await p.eval(()=>({ex:document.querySelectorAll('#exs .exercise').length,skip:[...document.querySelectorAll('#exs button[data-skip]')].map(b=>b.getAttribute('aria-label'))}));
 assert.strictEqual(r.ex,7);assert.strictEqual(r.skip.length,7);assert(r.skip.every(l=>/skip/i.test(l)),JSON.stringify(r.skip));
 await skStart(p,'a').catch(()=>{});await p.eval(()=>{currentSession=null;show('home');start('a');toggleCompact()});
 assert.strictEqual(await p.eval(()=>document.querySelectorAll('#exs button[data-skip]').length),await p.eval(()=>document.querySelectorAll('#exs .exercise').length),'compact: one control per displayed exercise');
 await p.eval(()=>{show('home');start('mobility')});assert.strictEqual(await p.eval(()=>document.querySelectorAll('#exs button[data-skip]').length),0);
});
test('SK2','Skipping records ONLY a flag on the draft session: no work-set, strength, activator, stretch or cardio record is created, and no set is checked',async p=>{
 await skStart(p,'a');const before=PA(await storage(p));await skSkip(p,3);const after=PA(await storage(p));
 const changed=Object.keys(after).filter(k=>after[k]!==before[k]);assert.deepStrictEqual(changed.sort(),['pa_sessions_v2'],'unexpected storage writes: '+changed);
 const s=(await p.eval(()=>JSON.parse(localStorage.pa_sessions_v2)))[0];assert.deepStrictEqual(s.skips,{'3':true});
 assert.strictEqual(await p.eval(()=>[...document.querySelectorAll('#exs .exercise')[3].querySelectorAll('.set button.check')].filter(b=>b.textContent.trim()==='✓').length),0);
 assert(/undo/i.test(await p.eval(()=>document.querySelector('#exs button[data-skip="3"]').textContent)),'no visible skipped state');
});
test('SK3','Skip is reversible while the session is a draft',async p=>{
 await skStart(p,'a');await skSkip(p,3);await skSkip(p,3);
 assert.deepStrictEqual((await p.eval(()=>currentSession.skips))||{},{});assert(!/undo/i.test(await p.eval(()=>document.querySelector('#exs button[data-skip="3"]').textContent)));
});
test('SK4','An exercise with logged sets cannot be skipped (nothing is changed, the athlete is told); logging a set on a skipped exercise lifts the skip, so a record always wins',async p=>{
 await skStart(p,'a');await skLog(p,3,1);await clearNotice(p);await skSkip(p,3);
 assert.strictEqual((await p.eval(()=>currentSession.skips))?.['3'],undefined);assert(/logged/i.test(await notice(p)),await notice(p));
 await skSkip(p,1);assert.strictEqual(await p.eval(()=>currentSession.skips['1']),true);await skLog(p,1,1);
 assert.strictEqual((await p.eval(()=>currentSession.skips))?.['1'],undefined,'skip not lifted by a logged set');
});
test('SK5','All four execution states in one session: performed, explicitly skipped, partially performed, unmarked gap (skipped, not marked) and not reached; no sets invented',async p=>{
 await skStart(p,'a');const n=await skSets(p);
 for(let j=1;j<=n[0];j++)await skLog(p,0,j);await skSkip(p,1);await skLog(p,2,1);for(let j=1;j<=n[4];j++)await skLog(p,4,j);
 const s=await skFinish(p),c=s.completion;
 assert.deepStrictEqual(c.exercises.map(e=>e.status),['performed','skipped','partial','skipped','performed','not_reached','not_reached']);
 assert.deepStrictEqual(c.exercises.map(e=>e.basis),['logged','explicit','logged','later-work-logged','logged','no-later-work','no-later-work']);
 assert.strictEqual(c.performed,n[0]+1+n[4]);assert.strictEqual(c.prescription,'partial');
 assert.strictEqual(await p.eval(id=>JSON.parse(localStorage.pa_hist).filter(x=>x.sessionId===id).length,s.id),n[0]+1+n[4],'records were invented or lost');
});
test('SK6','Deliberate skip vs interruption: an explicitly skipped exercise AFTER the last logged one is "skipped", whereas the untouched ones after it are "not reached"',async p=>{
 await skStart(p,'a');const n=await skSets(p);for(let j=1;j<=n[0];j++)await skLog(p,0,j);await skSkip(p,3);
 const c=(await skFinish(p)).completion;
 assert.deepStrictEqual(c.exercises.map(e=>e.status),['performed','not_reached','not_reached','skipped','not_reached','not_reached','not_reached']);assert.strictEqual(c.exercises[3].basis,'explicit');
});
test('SK7','Skipping never makes a session full, never reduces what was prescribed and never fabricates performed sets; skipping everything with no logged work is "none"',async p=>{
 await skStart(p,'a');const total=(await skSets(p)).reduce((a,b)=>a+b,0);for(let i=0;i<7;i++)await skSkip(p,i);
 await p.eval(()=>{openFinish();finishSession()});assert(/log some work/i.test(await notice(p)),'finishing with only skips must still be refused (nothing was done): '+await notice(p));
 await p.eval(()=>document.querySelector('#exs button.check:not([data-record])').click());
 const c=(await skFinish(p)).completion;assert.strictEqual(c.prescribed,total);assert.strictEqual(c.performed,0);assert.strictEqual(c.prescription,'none');assert(c.exercises.every(e=>e.status==='skipped'&&e.basis==='explicit'));
});
test('SK8','Skipping the presented intensifier never credits or advances the Giant B rotation, and logs no intensifier record',async p=>{
 await seedS(p,[]);await skStart(p,'b');await p.eval(()=>{currentSession.modes['2:'+selected('b',2)]='Straight Sets'});
 await skSkip(p,3);await skSkip(p,4);await rtStraight(p,2);const s=await skFinish(p);
 assert.deepStrictEqual(s.completion.exercises.filter(e=>e.status==='skipped'&&e.basis==='explicit').map(e=>e.slot),[3,4]);
 assert.strictEqual(await rtNext(p),0);assert(!(await p.eval(()=>JSON.parse(localStorage.pa_hist||'[]').some(x=>x.intensifier!=='Straight Sets'))));
 assert.strictEqual(await p.eval(()=>completedTemplateCount('b')),1,'the session still counts');
});
test('SK9','A skip survives a reload and resume, and a backup round trip',async p=>{
 await skStart(p,'a');await skSkip(p,2);await p.eval(()=>show('home'));await p.goto(ctx.origin+'/');
 await p.eval(()=>start('a'));assert.strictEqual(await p.eval(()=>currentSession.skips['2']),true);assert(/undo/i.test(await p.eval(()=>document.querySelector('#exs button[data-skip="2"]').textContent)));
 const payload=await p.eval(()=>{const b=backupPayload();validateBackup(b);return b});await p.eval(()=>localStorage.clear());await p.goto(ctx.origin+'/');
 const back=await p.eval(b=>{validateBackup(b);replacePAData(b.data);return JSON.parse(localStorage.pa_sessions_v2)[0].skips},payload);assert.deepStrictEqual(back,{'2':true});
});
test('SK10','Validator: skips must be {slot index: true} for slots that exist; anything else is refused with a specific message',async p=>{
 const base=bsess('s1','a','draft');const rej=async skips=>p.eval(t=>{const o=JSON.parse(t);const b=fullBackup({pa_sessions_v2:JSON.stringify([o])});try{validateBackup(b);return 'ACCEPTED'}catch(e){return e.message}},JSON.stringify({...base,skips}));
 assert.strictEqual(await rej({'3':true}),'ACCEPTED');assert.strictEqual(await rej({}),'ACCEPTED');
 const bad={'false value':{'3':false},'text key':{x:true},'slot beyond template':{'9':true},'array':[true],'string value':{'3':'yes'},'markup key':{'<b>':true},'too many':Object.fromEntries(Array.from({length:41},(_,i)=>[String(i),true])),'null':null};
 for(const [why,v] of Object.entries(bad)){const m=await rej(v);assert(m!=='ACCEPTED'&&/skip/i.test(m),why+' -> '+m)}
});
test('SK11','A finished session cannot be re-skipped, and the Finish preview and notice name explicit skips as "skipped" (not "not reached")',async p=>{
 await skStart(p,'a');await skLog(p,0,1);await skSkip(p,6);await p.eval(()=>openFinish());
 const panel=await p.eval(()=>document.getElementById('finishPanel').innerText);assert(/Farmer Carry \(DB\) \(skipped\)/.test(panel),panel);
 await p.eval(()=>finishSession());const n=await notice(p);assert(/Farmer Carry \(DB\) \(skipped\)/.test(n),n);
 await p.eval(()=>skipExercise(1));assert.strictEqual((await p.eval(()=>JSON.parse(localStorage.pa_sessions_v2).at(-1))).skips['1'],undefined);
});

// =====================================================================
// BX — Training Budget: report logged exposure, never invent equivalence (Priority 4)
// =====================================================================
const comp=(prescription,performed,prescribed,basis='sets')=>({v:1,basis,scope:'full',prescription,prescribed,performed,extra:0,exercises:[]});
const csess=(id,template,c,daysAgo=1)=>({...bsess(id,template,'complete',daysAgo),...(c?{completion:c}:{})});
const budgetPage=p=>p.eval(()=>{renderBudgetPage();return document.getElementById('mpBody').innerText});

test('BX1','budgetExposure(): per bar, the sessions split into full / partial / none / not recorded, with sets logged and checklist items ticked kept as separate units',async p=>{
 await seedS(p,[csess('f','a',comp('full',16,16)),csess('p','a',comp('partial',1,16)),csess('l','a',null),csess('m','mobility',comp('partial',2,6,'items'))]);
 const e=await p.eval(()=>budgetExposure());
 assert.deepStrictEqual(e.Strength,{sessions:3,full:1,partial:1,none:0,notRecorded:1,setsLogged:17,itemsTicked:0});
 assert.deepStrictEqual(e['Low-intensity engine'],{sessions:1,full:0,partial:1,none:0,notRecorded:0,setsLogged:0,itemsTicked:2});
 assert.deepStrictEqual(Object.keys(e),['Strength','Hypertrophy','Explosive','High-intensity engine','Low-intensity engine','Capability']);
});
test('BX2','The bars themselves are unchanged: budgetData() still counts every completed session once per category it belongs to, whatever its completion',async p=>{
 await seedS(p,[csess('f','a',comp('full',16,16)),csess('p','a',comp('partial',1,16)),csess('l','a',null),csess('n','a',comp('none',0,16)),csess('at','athletic',comp('partial',3,20,'items'))]);
 const b=await p.eval(()=>budgetData());assert.deepStrictEqual(b,{Strength:4,Hypertrophy:0,Explosive:1,'High-intensity engine':0,'Low-intensity engine':0,Capability:1});
});
test('BX3','Budget page: a full and a partial Strength session are told apart under the bar; the line reports logged sets and flags earlier sessions as not recorded; no combined total is shown',async p=>{
 await seedS(p,[csess('f','a',comp('full',16,16)),csess('p','a',comp('partial',1,16)),csess('l','a',null)]);
 const t=await budgetPage(p);
 assert(/3 exposures/.test(t)&&/1 full/.test(t)&&/1 partial/.test(t)&&/1 not recorded/.test(t)&&/17 sets logged/.test(t),t);
 assert(!/\b(total sets|equivalent|equals|sets per exposure)\b/i.test(t),t);
});
test('BX4','Units are never mixed: checklist sessions report checklist items, lifting sessions report sets, and neither is converted into the other',async p=>{
 await seedS(p,[csess('m','mobility',comp('full',6,6,'items')),csess('a1','a',comp('full',16,16))]);
 const t=await budgetPage(p);assert(/6 checklist items ticked/.test(t)&&/16 sets logged/.test(t),t);
 const rows=await p.eval(()=>[...document.querySelectorAll('#mpBody .budget-row')].map(r=>r.innerText));
 const mob=rows.find(r=>/Low-intensity/.test(r)),str=rows.find(r=>/^Strength/.test(r));assert(!/sets logged/.test(mob)&&!/checklist items/.test(str),rows.join('\n'));
});
test('BX5','Coach Handoff carries the same logged-exposure lines (sessions with their completion split, and the unit-specific work logged); no bar means no line',async p=>{
 await seedS(p,[csess('f','a',comp('full',16,16)),csess('p','a',comp('partial',1,16)),csess('l','a',null)]);
 const t=await p.eval(()=>coachSummary());
 assert(/LOGGED EXPOSURE \(last 7 days\)/.test(t)&&/Strength: 3 sessions \(1 full, 1 partial, 0 none, 1 not recorded\); 17 sets logged/.test(t),t.slice(0,700));
 assert(!/Hypertrophy: \d/.test(t.split('EVIDENCE FLAG')[0].split('LOGGED EXPOSURE')[1]||''));
});
test('BX6','Classification unchanged: Giant C stays Capability, the six ambiguous templates stay unclassified and are still disclosed as not counted; they never get a logged-exposure line',async p=>{
 assert.deepStrictEqual(await p.eval(()=>budgetCategories('c')),['Capability']);
 for(const k of ['bodycontrol','athletepractice','combatintro','waterpractice','carrypractice','practicalskills'])assert.deepStrictEqual(await p.eval(k=>budgetCategories(k),k),[],k);
 await seedS(p,[csess('u','bodycontrol',comp('full',5,5,'items')),csess('k','a',comp('full',16,16))]);
 const t=await budgetPage(p);assert(/not counted/i.test(t)&&/Body Control/.test(t),t);const e=await p.eval(()=>budgetExposure());assert.strictEqual(Object.values(e).reduce((a,x)=>a+x.sessions,0),1);
});
test('BX7','Only completed sessions from the last 7 days count; drafts and old sessions are excluded from bars and from exposure alike',async p=>{
 await seedS(p,[csess('old','a',comp('full',16,16),10),{...bsess('d','a','draft',0),completion:undefined},csess('new','a',comp('partial',2,16),2)]);
 const e=await p.eval(()=>budgetExposure());assert.deepStrictEqual(e.Strength,{sessions:1,full:0,partial:1,none:0,notRecorded:0,setsLogged:2,itemsTicked:0});
});
test('BX8','Reporting is read-only and does not alter any record',async p=>{
 await seedS(p,[csess('p','a',comp('partial',1,16)),csess('l','a',null)]);const before=await storage(p);
 await p.eval(()=>{budgetExposure();renderBudgetPage();coachSummary()});assert.deepStrictEqual(await storage(p),before);
});

// =====================================================================
// HB — historical cardio records containing tag-like text (Priority 5)
// =====================================================================
async function openCardio(p,machine='Outdoor'){await p.eval(()=>start('conditioning'));await p.click('#exs .machine-btn',machine);return p.eval(()=>document.querySelector('#exs [data-cardio]').dataset.cardio)}
async function typeCardio(p,field,value){await p.eval(f=>{const i=document.querySelector(`#exs [data-cardio] input[data-field="${f}"]`);i.scrollIntoView({block:'center'});i.focus();i.select()},field);await p.send('Input.insertText',{text:value})}
async function saveCardioUI(p){await clearNotice(p);await p.click('#exs button.save-cardio')}
const cardioHist=p=>p.eval(()=>JSON.parse(localStorage.pa_cardio_hist||'[]'));
async function openBackupPage(p){await p.click('#n-more');await p.click('button.moreitem[onclick="morePage(\'data\')"]');await p.waitForFunction('!!document.querySelector("#morepage input[type=file]")')}
async function importFile(p,file){await openBackupPage(p);await p.eval('document.getElementById("importPreview").textContent=""');await p.setFile('#morepage input[type=file]',file);await p.waitForFunction('document.getElementById("importPreview").textContent.trim().length>0',20000);return p.eval(()=>({text:document.getElementById('importPreview').textContent,can:[...document.querySelectorAll('#importPreview button')].some(b=>/RESTORE THIS BACKUP/i.test(b.textContent))}))}
async function restoreUI(p){const re=p.waitForLoad(30000).then(()=>true,()=>false);await p.click('button','RESTORE THIS BACKUP');const ok=await re;if(ok)await p.waitForFunction('typeof validateBackup==="function"&&document.readyState==="complete"');return ok}
const bkWrap=data=>({format:'project-america-full-backup',version:1,appVersion:'2.3',createdAt:'2026-10-12T09:00:00.000Z',data});
const cardioRec=(data,extra={})=>({id:'s1|Outdoor|conditioning',sessionId:'s1',date:'2026-10-10T12:00:00.000Z',machine:'Outdoor',mode:'conditioning',data,...extra});
const backupWith=records=>bkWrap({pa_cardio_hist:JSON.stringify(records)});
const validates=(p,records)=>p.eval(b=>{try{validateBackup(b);return 'ok'}catch(e){return e.message}},backupWith(records));
const LOOKALIKE=['<Z2>','<easy>','</easy>','HR <Z2> and <Z3>','<x1>','<Z2/>','pace <fast> then <slow>','<Zone2>','<Z2><Z3>x</Z3></Z2>'];
const REAL_HTML=['a<b>c','</script>','</b>','</style>','</iframe>','<b>','<B>x','<i>x</i>','<u>','<img src=x onerror=window.__pwn=1>','<a href="javascript:window.__pwn=1">x</a>','<script>window.__pwn=1</script>','<style>*{}</style>','<svg onload=window.__pwn=1>','<math>','<iframe src=x>','<form>','<input>','<button>','<video src=x>','<details open ontoggle=window.__pwn=1>','<template>','<noscript>','<font>','<center>','<marquee>','<textarea>','<select>','<table>','<p>','<div>','<span>','<br>','<h1>','<!-- c -->','<?php x ?>','<!DOCTYPE html>','<![CDATA[x]]>','<Z2><b>','<easy><img src=x>'];
const SYNTAX_TRICKS=['<Z2 onclick=window.__pwn=1>','<Z2 a>','<Z2/onload=window.__pwn=1>','<Z2 x="1">','<zone-2>','<x-foo>','<easy\tclass=x>','<Z2 onmouseover="window.__pwn=1">'];

test('HB1','Tag-lookalike text that no HTML element could be built from (<Z2>, <easy>, "HR <Z2> and <Z3>") is accepted by backup validation in every cardio field, exactly as stored',async p=>{
 for(const v of LOOKALIKE){const r=await validates(p,[cardioRec({pace:v,hr:v,notes:v})]);assert.strictEqual(r,'ok',JSON.stringify(v)+': '+r)}
});
test('HB2','The same text can be logged through the cardio form and is stored exactly as typed (logging and import judge text identically)',async p=>{
 await openCardio(p,'Outdoor');
 for(const v of ['<Z2>','HR <Z2> and <Z3>','<easy>']){await p.eval(()=>{localStorage.pa_cardio_hist='[]'});await clearNotice(p);await typeCardio(p,'pace',v);await saveCardioUI(p);
  const h=await cardioHist(p);assert.strictEqual(h.length,1,JSON.stringify(v)+' not saved: '+await notice(p));assert.strictEqual(h[0].data.pace,v)}
});
test('HB3','A historical cardio record containing such text restores from a backup file byte-for-byte, through the real preview and restore buttons',async p=>{
 const recs=[cardioRec({pace:'<Z2> steady',hr:'HR <Z2> and <Z3>',notes:'<easy>'},{id:'h1'}),cardioRec({pace:'<10:00'},{id:'h2'})];const file=writeFile(backupWith(recs));
 const r=await importFile(p,file);assert(r.can,'restore refused: '+r.text);assert(await restoreUI(p));
 assert.strictEqual(await p.eval(()=>localStorage.pa_cardio_hist),JSON.stringify(recs));
});
test('HB4','Real HTML is still refused at import AND at logging: every real element name, comments, processing instructions, doctype, CDATA, and lookalikes that nest a real element',async p=>{
 for(const v of REAL_HTML){const r=await validates(p,[cardioRec({pace:v})]);assert(r!=='ok'&&/cardio/i.test(r)&&/pace/i.test(r),JSON.stringify(v)+' -> '+r)}
 await openCardio(p,'Outdoor');
 for(const v of ['<b>','<img src=x onerror=window.__pwn=1>','<!-- x -->','<Z2><b>']){await p.eval(()=>{localStorage.pa_cardio_hist='[]'});await clearNotice(p);await typeCardio(p,'pace',v);await saveCardioUI(p);
  assert.strictEqual((await cardioHist(p)).length,0,JSON.stringify(v)+' was stored')}
 assert.strictEqual(await p.eval(()=>window.__pwn),undefined);
});
test('HB5','A lookalike carrying ANY attribute or tag-syntax trick (event handlers, bare attributes, slash tricks, tab-separated attributes, custom-element names) is refused',async p=>{
 for(const v of SYNTAX_TRICKS){const r=await validates(p,[cardioRec({pace:v})]);assert(r!=='ok',JSON.stringify(v)+' accepted')}
});
test('HB6','Stored lookalike text is inert wherever the app can show it: literal text in the cardio PREVIOUS line and no element anywhere in the document is ever created from it',async p=>{
 const mode=await openCardio(p,'Outdoor');await typeCardio(p,'pace','<Z2><easy>x');await saveCardioUI(p);
 await p.eval(()=>render());await sleep(200);
 const r=await p.eval(()=>{const t=document.querySelector('#exs .cardio-prev').textContent;const pages=[];
  for(const f of [()=>show('home'),()=>show('train'),()=>show('progress'),()=>show('more'),()=>renderBudgetPage(),()=>renderAARPage(),()=>coachSummary()]){try{f()}catch(e){}pages.push(document.querySelectorAll('z2,easy,x1').length)}
  return {t,els:pages,pwn:window.__pwn}});
 assert(r.t.includes('<Z2><easy>x'),r.t);assert.deepStrictEqual(r.els,[0,0,0,0,0,0,0]);assert.strictEqual(r.pwn,undefined);
});
test('HB7','Judging text never executes or loads it: validating real-HTML payloads sets no flag and makes no network request',async p=>{
 const before=p.requests.length;
 for(const v of REAL_HTML)await validates(p,[cardioRec({pace:v})]);await sleep(300);
 assert.strictEqual(await p.eval(()=>window.__pwn),undefined);
 assert.deepStrictEqual(p.requests.slice(before).filter(u=>/\/x(\?|$)/.test(String(u.url||u))),[]);
});
test('HB8','Nothing else about import validation is relaxed: control characters, over-long text, bad keys and non-text values are still refused, and < or > is still refused in every other record type',async p=>{
 for(const [why,rec] of Object.entries({control:cardioRec({pace:'a\u0001b'}),long:cardioRec({pace:'x'.repeat(2000)}),'bad key':cardioRec({'<b>':'1'}),proto:JSON.parse('{"id":"s1|O|c","date":"2026-10-10T12:00:00.000Z","machine":"Outdoor","mode":"conditioning","data":{"constructor":"1"}}'),object:cardioRec({pace:{a:1}}),bool:cardioRec({pace:true})})){
  const r=await validates(p,[rec]);assert(r!=='ok',why+' accepted')}
 const other=await p.eval(b=>{try{validateBackup(b);return 'ok'}catch(e){return e.message}},bkWrap({pa_ls_hist:JSON.stringify([{id:'x',sessionId:'s',exercise:'a<Z2>b',seconds:30,date:'2026-10-10T12:00:00.000Z'}])}));
 assert(other!=='ok',"a lookalike was accepted in another record type's text: "+other);
});
test('HB9','Original data is preserved: refusing a file with real HTML changes nothing; restoring a lookalike file does not rewrite or escape any value; existing cardio history is untouched by validation',async p=>{
 await p.eval(()=>{localStorage.pa_cardio_hist='[{"id":"keep","sessionId":"k","date":"2026-10-01T00:00:00.000Z","machine":"Outdoor","mode":"conditioning","data":{"hr":"<Z2>"}}]'});const before=await storage(p);
 const r=await importFile(p,writeFile(backupWith([cardioRec({pace:'<b>'})])));assert(!r.can);assert.deepStrictEqual(PA(await storage(p)),PA(before));
 assert.strictEqual(JSON.parse(await p.eval(()=>localStorage.pa_cardio_hist))[0].data.hr,'<Z2>');
});

// =====================================================================
// EV — evidence engine vs partial / skipped / omitted work (Priority 2: audit guards; no engine change)
// Limitations the audit found (back-off-only partials, UTC-day exposure splitting, draft records, last-record targets) are NOT
// asserted here as passes; they are reported by tests/audit/evidence_partial_audit.js and proposed in PHASE3_EVIDENCE_AUDIT_AND_DESIGN.md.
// =====================================================================
const evDay=n=>new Date(Date.now()-n*86400000).toISOString();
const evRec=(id,sid,name,d,w,reps,x={})=>({id,sessionId:sid,name,intensifier:'Straight Sets',w,reps,rir:2,template:'a',block:1,setNumber:1,date:evDay(d),...x});
const evSeed=(p,rows)=>p.eval(r=>{localStorage.pa_hist=JSON.stringify(r)},rows);

test('EV1','An exercise omitted from the latest session (no records) leaves its series untouched and never reads as deterioration',async p=>{
 await evSeed(p,[...[14,10,7,3].map((d,k)=>evRec('b'+k,'s'+k,'Bench Press (BB)',d,200,5)),...[14,10,7,3,0].map((d,k)=>evRec('r'+k,'t'+k,'Row (DB)',d,100,10))]);
 const ev=await p.eval(()=>evidenceDecision());assert.strictEqual(ev.state,'OBSERVE');
});
test('EV2','A partial exposure with fewer sets at the same load carries the same evidence as a full one (best performed set per exposure)',async p=>{
 const h=[];[14,10,7].forEach((d,k)=>{for(let s=1;s<=3;s++)h.push(evRec('f'+k+s,'s'+k,'Bench Press (BB)',d,200,5,{setNumber:s}))});h.push(evRec('p1','sp','Bench Press (BB)',0,200,5));
 await evSeed(p,h);const ev=await p.eval(()=>evidenceDecision());assert.strictEqual(ev.state,'OBSERVE');assert.strictEqual(ev.vals.length,4);assert(ev.vals.every(v=>Math.abs(v-ev.vals[0])<1e-9),JSON.stringify(ev.vals));
});
test('EV3','Legitimate evidence from a partial workout is preserved: a real workout in which only ONE exercise was done (all its sets logged) adds that exercise\'s exposure to its series, and nothing else',async p=>{
 await skStart(p,'a');const name=await p.eval(()=>selected('a',0));const n=await skSets(p);
 for(let j=1;j<=n[0];j++)await skLog(p,0,j);const s=await skFinish(p);assert.strictEqual(s.completion.prescription,'partial');
 const logged=await p.eval(()=>JSON.parse(localStorage.pa_hist).filter(x=>!x.structured));assert(logged.length>0&&logged.every(x=>x.name===name),'only the performed exercise may have records');
 const top=logged.reduce((a,b)=>(b.w*(1+b.reps/30)>a.w*(1+a.reps/30)?b:a));
 const olds=[[14,'old1'],[7,'old2']].map(([d,id])=>({...top,id,sessionId:id,date:evDay(d),w:top.w*0.9}));
 await p.eval(o=>{localStorage.pa_hist=JSON.stringify([...o,...JSON.parse(localStorage.pa_hist)])},olds);
 const ev=await p.eval(()=>evidenceDecision());assert.strictEqual(ev.name,name);assert.strictEqual(ev.vals.length,3,JSON.stringify(ev.vals));
 assert(Math.abs(ev.vals[2]-top.w*(1+top.reps/30))<1e-9&&ev.vals[2]>ev.vals[1],JSON.stringify(ev.vals));
});
test('EV4','Skipped and not-reached exercises leave no record, so they cannot enter any series or be read as deterioration',async p=>{
 await skStart(p,'a');const name=await p.eval(()=>selected('a',0));
 await evSeed(p,[evRec('a1','old1',name,14,100,10),evRec('a2','old2',name,7,100,10)]);
 const evBefore=await p.eval(()=>evidenceDecision());
 await skSkip(p,0);await skLog(p,3,1);await skFinish(p);
 const n=await p.eval(n=>JSON.parse(localStorage.pa_hist).filter(x=>x.name===n).length,name);assert.strictEqual(n,2,'a record was created for the skipped exercise');
 const ev=await p.eval(()=>evidenceDecision());
 assert.deepStrictEqual(ev.name===name?ev.vals:null,evBefore.name===name?evBefore.vals:null,'the skipped exercise series changed');
 assert.notStrictEqual(ev.state,'ACT');
});
test('EV5','Structured intensifier blocks never enter the evidence series, so an incomplete or smaller cluster cannot read as decline',async p=>{
 const r=(id,sid,d,reps)=>({id,sessionId:sid,name:'Rear-Delt Fly (DB)',intensifier:'Myo-Reps',structured:true,w:30,reps,efforts:[{stage:1,w:30,reps:10}],setNumber:2,date:evDay(d)});
 await evSeed(p,[r('a','s0',20,30),r('b','s1',12,10),r('c','s2',4,5)]);const ev=await p.eval(()=>evidenceDecision());assert.strictEqual(ev.name,'SYSTEM');
});
test('EV6','Nothing in the engine raises a load automatically: the decision only reports OBSERVE / INVESTIGATE / ACT about a decline, and a single exposure never changes the program',async p=>{
 await evSeed(p,[evRec('a','s0','Bench Press (BB)',3,200,5)]);const ev=await p.eval(()=>evidenceDecision());assert.strictEqual(ev.state,'OBSERVE');
 assert(['OBSERVE','INVESTIGATE','ACT'].includes(ev.state));
 const src=await p.eval(()=>[evidenceDecision,targetStrength,targetMode].map(f=>f.toString()).join('\n'));assert(!/inc\)?\s*[\+\*]|w\s*\+=|\.w\s*=\s*\(?[^=]*\+/.test(src.replace(/before \+\$\{e\?\.inc\|\|5\} lb/,'')),'a function appears to compute a heavier load');
});

// ---------- runner ----------
(async()=>{
 const server=await serve(appDir),browser=await launch();ctx={browser,origin:server.origin};
 const results=[];let failed=0;
 console.log(`Project America Phase 3 suite (training accuracy)\nApp under test: ${path.resolve(appDir)}\n`);
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

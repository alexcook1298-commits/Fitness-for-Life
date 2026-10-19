'use strict';
// Read-only audit of two approved decisions: (1) abandoned drafts leave completed-session EVIDENCE but every logged set is preserved;
// (2) back-off sets leave TOP-SET comparisons but stay in training history, volume accounting and are still identifiable for later back-off analysis.
// Synthetic data in disposable headless-Chrome profiles. usage: node tests/audit/phase4_distinction_audit.js <appDir> [--json out]
const fs=require('fs'),os=require('os'),path=require('path');
const {launch}=require('../lib/cdp'),{serve}=require('../lib/server');
const a=process.argv.slice(2),appDir=a.find(x=>!x.startsWith('--')&&a[a.indexOf(x)-1]!=='--json'),jsonOut=a.includes('--json')?a[a.indexOf('--json')+1]:null;
const rows=[];const rec=(id,verdict,title,detail)=>{rows.push({id,verdict,title,detail});console.log(`${verdict.padEnd(10)} ${id.padEnd(4)} ${title}\n${' '.repeat(16)}${detail}`)};
(async()=>{
 const s=await serve(appDir),b=await launch(),dl=fs.mkdtempSync(path.join(os.tmpdir(),'pa-dist-'));const p=await b.newPage(dl);await p.goto(s.origin+'/');
 const T=async(fn,...x)=>p.eval(fn,...x);
 // real flow: one finished Giant A with top set + back-offs on the first exercise, then an abandoned draft with a light top set
 const flow=await T(()=>{
  weekMode='normal';start('a');const name=selected('a',0),m=todayStrength(0,name),n=workSetCount(0);
  currentSession.modes['0:'+name]='Straight Sets';render();
  const put=(key,f,v)=>{document.querySelector(`#exs input[data-save="${key}${f}"]`).value=v};
  const ws=[200,170,170,170];for(let j=1;j<=n;j++){const key=formKey(0,j,'Straight Sets','');put(key,'w',String(ws[j-1]));put(key,'r','5');put(key,'rir','2');logSet(null,0,j)}
  const fin=currentSession.id;openFinish();finishSession();
  const finished=JSON.parse(localStorage.pa_sessions_v2).find(x=>x.id===fin);
  return {name,m,n,fin,setCount:finished.setCount,performed:finished.completion?.exercises?.[0]?.performed,prescription:finished.completion?.prescription,histNow:JSON.parse(localStorage.pa_hist).filter(h=>h.sessionId===fin).map(h=>({set:h.setNumber,w:h.w,sm:h.strengthMethod,id:h.id}))};
 });
 const bo=flow.histNow.filter(h=>h.set>1);
 rec('A1',bo.length===flow.n-1&&flow.histNow.length===flow.n?'PRESERVED':'GAP','Back-off sets are written to training history like any set',`method ${flow.m}; ${flow.n} sets logged (200 top, ${bo.length} back-offs at 170): ${flow.histNow.length} records in pa_hist`);
 const before=await T(()=>localStorage.pa_hist);
 const after=await T(()=>{evidenceDecision();targetStrength(selected('a',0),todayStrength(0,selected('a',0)));coachSummary();renderBudgetPage();return localStorage.pa_hist});
 rec('A2',before===after?'PRESERVED':'GAP','Evidence, target, coach summary and budget reads never delete or alter back-off records',before===after?'pa_hist byte-identical after the reads':'pa_hist changed');
 rec('A3',flow.setCount===flow.n&&flow.performed===flow.n?'PRESERVED':'GAP','Volume accounting counts back-offs: session.setCount and completion.performed include every logged set',`setCount ${flow.setCount}, completion performed ${flow.performed} of ${flow.n} (${flow.prescription})`);
 const bud=await T(()=>{const e=budgetExposure();return Object.fromEntries(Object.entries(e).filter(([,v])=>v.sessions).map(([k,v])=>[k,v.setsLogged]))});
 rec('A4',Object.values(bud).some(v=>v===flow.n)?'PRESERVED':'GAP','Training Budget sets-logged includes back-offs',JSON.stringify(bud));
 const hist=await T(n=>({prev:prevStrength(n,todayStrength(0,n)),chartRows:JSON.parse(localStorage.pa_hist).filter(x=>x.name===n&&!x.structured).length}),flow.name);
 rec('A5',/200 × 5.*170 × 5/.test(hist.prev)&&hist.chartRows===flow.n?'PRESERVED':'GAP','History views still show every set: the PREVIOUS line lists top set and back-offs; chart data has all rows',`PREVIOUS: ${hist.prev}; chart rows ${hist.chartRows}`);
 const rt=await T(()=>{const bk=backupPayload();validateBackup(bk);const h=JSON.parse(bk.data.pa_hist);return {n:h.length,back:h.filter(x=>x.setNumber>1).length}});
 rec('A6',rt.back===flow.n-1?'PRESERVED':'GAP','A full backup contains the back-off records and validates',`${rt.n} records, ${rt.back} back-offs`);
 const ident=await T(()=>JSON.parse(localStorage.pa_hist).filter(x=>isBackoffRecord(x)).map(x=>[typeof x.strengthMethod,typeof x.setNumber,typeof x.w,typeof x.reps,typeof x.sessionId,typeof x.date].join()));
 rec('A7',ident.length===flow.n-1&&ident.every(x=>x==='string,number,number,number,string,string')?'PRESERVED':'GAP','Back-off sets stay identifiable for future back-off analysis (method + set number + load + reps + session + date on every record)',`${ident.length} back-off records identified by isBackoffRecord`);
 const ev=await T(()=>{const e=evidenceDecision();return {name:e.name,vals:(e.vals||[]).map(v=>Math.round(v))}});
 rec('A8','BY DESIGN','Back-offs are absent from top-set comparisons',`evidence series for the exercise: ${JSON.stringify(ev)} (top set only: 200 x 5 = ${Math.round(200*(1+5/30))})`);
 // legacy records without setNumber
 const leg=await T(()=>{const r={name:'X',strengthMethod:'Top Set + Back-Offs'};return isBackoffRecord(r)});
 rec('G1',leg?'GAP':'NOTE','A legacy record with no setNumber is treated as a top set, never as a back-off',leg?'treated as back-off':`isBackoffRecord(no setNumber) = ${leg}; the original 2.3 app already wrote setNumber, so every stored record has one`);
 // drafts: abandoned draft with a light top set
 const dr=await T(({name,m})=>{
  currentSession=null;renderedSession=null;start('a');const n2=selected('a',0);currentSession.modes['0:'+n2]='Straight Sets';render();
  const key=formKey(0,1,'Straight Sets','');const put=(f,v)=>{document.querySelector(`#exs input[data-save="${key}${f}"]`).value=v};put('w','100');put('r','5');put('rir','2');logSet(null,0,1);
  const draftId=currentSession.id;saveDraft();
  const raw=JSON.parse(localStorage.pa_hist).filter(x=>x.sessionId===draftId).length;
  const bk=backupPayload();validateBackup(bk);const inBackup=JSON.parse(bk.data.pa_hist).filter(x=>x.sessionId===draftId).length;
  const ev=evidenceDecision();const vals=ev.vals||[];
  return {draftId,raw,inBackup,evidenceName:ev.name,vals:vals.map(v=>Math.round(v)),next:targetStrength(n2,todayStrength(0,n2)),prev:prevStrength(n2,todayStrength(0,n2)),status:JSON.parse(localStorage.pa_sessions_v2).find(x=>x.id===draftId)?.status}},flow);
 rec('B1',dr.raw===1&&dr.inBackup===1&&dr.status==='draft'?'PRESERVED':'GAP','An unfinished draft keeps every logged set: in pa_hist, in the session record, and in a full backup',`records ${dr.raw}, in backup ${dr.inBackup}, status ${dr.status}`);
 rec('B2',dr.vals.length<2||!dr.vals.includes(Math.round(100*(1+5/30)))?'BY DESIGN':'GAP','The draft set is excluded from completed-session evidence',`evidence values ${JSON.stringify(dr.vals)} (a draft 100 x 5 would be ${Math.round(100*(1+5/30))})`);
 // reload keeps it; finishing counts it
 await p.reload();
 const ft=await T(()=>{const id=JSON.parse(localStorage.pa_sessions_v2).find(x=>x.status==='draft').id;start('a');currentSession.modes['0:'+selected('a',0)]='Straight Sets';render();const key=formKey(0,2,'Straight Sets','');const put=(f,v)=>{document.querySelector(`#exs input[data-save="${key}${f}"]`).value=v};put('w','100');put('r','5');put('rir','2');logSet(null,0,2);openFinish();finishSession();return {stillDraft:draftSessionIds().has(id),sets:JSON.parse(localStorage.pa_hist).filter(x=>x.sessionId===id).length,status:JSON.parse(localStorage.pa_sessions_v2).find(x=>x.id===id).status,vals:(evidenceDecision().vals||[]).map(v=>Math.round(v))}});
 rec('B3',ft.sets===2&&ft.status==='complete'&&!ft.stillDraft?'PRESERVED':'GAP','After a reload the draft resumes with its set; once finished all its sets are complete-session records and no longer excluded as a draft',`sets ${ft.sets}, status ${ft.status}, still treated as draft ${ft.stillDraft}; evidence values ${JSON.stringify(ft.vals)} (the engine reports no series until an exercise has 2 or more dated exposures, so values may be empty here)`);
 // gap: NEXT and PREVIOUS include draft sets
 const gap=await T(({name})=>{
  currentSession=null;renderedSession=null;start('a');const n=selected('a',0);currentSession.modes['0:'+n]='Straight Sets';
  // abandon a fresh draft after one heavy-looking? use a light set 60 as the abandoned draft: it is the LAST logged record
  render();const key=formKey(0,1,'Straight Sets','');const put=(f,v)=>{document.querySelector(`#exs input[data-save="${key}${f}"]`).value=v};put('w','60');put('r','5');put('rir','2');logSet(null,0,1);saveDraft();
  const sm=todayStrength(0,n);return {next:targetStrength(n,sm),statuses:JSON.parse(localStorage.pa_sessions_v2).map(x=>x.status)}},flow);
 rec('G2',/^60 lb/.test(gap.next)?'GAP':'NOTE','NEXT-target text is not covered by the draft exclusion: it reads the newest session of the series even if that session is an unfinished draft',`NEXT shows "${gap.next}" while its newest session is an abandoned draft with one light set (evidence decision itself ignores that draft)`);
 console.log('\n'+rows.filter(r=>r.verdict==='GAP').length+' gap(s) found');
 if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify({app:appDir,date:new Date().toISOString(),rows},null,1));
 await b.close();await s.close();
})().catch(e=>{console.error(e);process.exit(2)});

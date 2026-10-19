'use strict';
// READ-ONLY investigation of progression recommendations (item 4). Nothing is changed or proposed in code here.
// Usage: node reliability/scripts/progression_investigation.js <appDir> <out.json>
const fs=require('fs');
const {launch}=require('../../tests/lib/cdp.js'),{serve}=require('../../tests/lib/server.js');
const [appDir,outFile]=process.argv.slice(2);
(async()=>{const s=await serve(appDir),b=await launch();const p=await b.newPage('/tmp');await p.goto(s.origin+'/');
 const out=await p.eval(()=>{
  const D=d=>new Date(Date.UTC(2026,9,19,12)-d*864e5).toISOString();
  const R=(name,d,w,reps,rir,x={})=>({id:name+d+w+reps+(x.setNumber||1),name,w,reps,rir,date:D(d),intensifier:'Straight Sets',strengthMethod:null,setNumber:1,...x});
  const run=(label,rows,n,range,method)=>{localStorage.setItem('pa_hist',JSON.stringify(rows));
   return {label,history:rows.map(r=>`${r.w}x${r.reps}@${r.rir} d-${Math.round((Date.UTC(2026,9,19,12)-Date.parse(r.date))/864e5)} ${r.strengthMethod||''} set${r.setNumber}`),
    previous:method?prevStrength(n,method):prevMode(n,'Straight Sets'),next:method?targetStrength(n,method):targetMode(n,'Straight Sets',range)}};
  const n='Seated Leg Curl',N='Hack Squat';
  const res=[];
  res.push(run('A. 8-12 range, hit TOP of range (3 sets x12 @RIR1) - should advise load increase',[R(n,3,100,12,1),R(n,3,100,12,1,{setNumber:2})],n,'8–12'));
  res.push(run('B. 8-12 range, BOTTOM of range (8 @RIR0) - should advise hold/earn reps',[R(n,3,100,8,0)],n,'8–12'));
  res.push(run('C. Missed range badly (100x5 vs 8-12)',[R(n,3,100,5,0)],n,'8–12'));
  res.push(run('D. Two sets, last-logged set is the lighter one (105x10 then 100x8)',[R(n,3,105,10,1),R(n,3,100,8,0,{setNumber:2})],n,'8–12'));
  res.push(run('E. Last exposure 120 days ago',[R(n,120,100,10,1)],n,'8–12'));
  res.push(run('F. Top Set + Back-Offs: 200x5 top, 170x8 back-off',[R(N,3,200,5,2,{strengthMethod:'Top Set + Back-Offs'}),R(N,3,170,8,2,{strengthMethod:'Top Set + Back-Offs',setNumber:2})],N,'6–10','Top Set + Back-Offs'));
  res.push(run('G. Top Set + Back-Offs: top set earned (200x10 on 6-10 range)',[R(N,3,200,10,1,{strengthMethod:'Top Set + Back-Offs'})],N,'6–10','Top Set + Back-Offs'));
  res.push(run('H. History logged out of date order (insertion order != date order)',[R(n,1,110,10,1),R(n,30,90,10,1)],n,'8–12'));
  res.push(run('I. Pain/limited session recorded at RIR 4 (deliberately easy)',[R(n,10,100,10,1),R(n,3,70,10,4)],n,'8–12'));
  const incs={};L.forEach(e=>{incs[e.inc]=(incs[e.inc]||0)+1});
  const lat=getEx('Lateral Raise (Cable)');
  return {scenarios:res,exerciseIncrementCounts:incs,lateralRaiseInc:lat.inc,note:'targetMode ignores its range argument; recommendations never read reps/RIR against the range.'};
 });
 fs.writeFileSync(outFile,JSON.stringify(out,null,1));
 for(const r of out.scenarios)console.log(r.label+'\n   history:',r.history.join(' | '),'\n   previous:',r.previous,'\n   NEXT:    ',r.next);
 await p.close();await b.close();await s.close();
})().catch(e=>{console.error(e);process.exit(1)});

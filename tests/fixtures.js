'use strict';
// Page-side fixture builders. Each function is serialized and evaluated inside the app page,
// so it uses the app's real constants (templates, slots, exercises, blocks).

// Realistic synthetic dataset covering every storage key the app writes. Returns {key: storedString}.
function buildDataset(){
 const dt='2026-10-10T12:00:00.000Z',sid='s-complete-1',did='s-draft-1';
 const a0=baseSlots.a[0][1][0],a1=baseSlots.a[1][1][0],a5=baseSlots.a[5][1][0];
 const b0=baseSlots.b[0][1][0],b3=baseSlots.b[3][1][0],b4=baseSlots.b[4][1][0];
 const act=ACTIVATORS[baseSlots.b[0][0]].options[0];
 const id=(s,i,n,j,m)=>[s,i,n,j,m].join('|');
 const base=(s,i,n,j,m,t)=>({id:id(s,i,n,j,m),sessionId:s,name:n,intensifier:m,strengthMethod:null,template:t,block:1,setNumber:j,finalSet:false,date:dt});
 const hist=[
  {name:a0,w:205,reps:8,rir:2,date:'2026-01-05T12:00:00.000Z',intensifier:'Straight Sets'},
  {...base(sid,0,a0,1,'Straight Sets','a'),strengthMethod:'Primer + Paused Top/Back-Offs',w:225,reps:5,rir:2,clusterSplit:null},
  {...base(sid,1,a1,1,'Straight Sets','a'),strengthMethod:'Cluster Sets',w:80,reps:6,rir:2,clusterSplit:'2+2+2'},
  {...base(sid,5,a5,1,'Straight Sets','a'),strengthMethod:'Cluster Sets',w:25,reps:6,rir:1,clusterSplit:'3+3 <20s> then stop if speed drops >10%'},
  {...base(did,3,b3,2,'Myo-Reps','b'),finalSet:true,w:20,reps:22,rir:null,efforts:[{stage:1,w:20,reps:12},{stage:2,w:20,reps:5},{stage:3,w:20,reps:5}],volume:440,structured:true},
  {...base(did,4,b4,2,'DC Rest-Pause','b'),finalSet:true,w:35,reps:18,rir:null,efforts:[{stage:1,w:35,reps:9},{stage:2,w:35,reps:5},{stage:3,w:35,reps:4}],volume:630,structured:true}
 ];
 const complete={id:sid,template:'a',phase:1,weekMode:'normal',startedAt:'2026-10-10T11:00:00.000Z',status:'complete',forms:{['lift:1:'+a1+':1:Straight Sets:w']:'80',['lift:1:'+a1+':1:Straight Sets:clusterSplit']:'2+2+2'},checks:{['check:a:general:0']:true},choices:{0:a0},modes:{},clusters:{},strengthModes:{['1:'+a1]:'Cluster Sets'},activators:{},compact:false,mobTier:5,cardioMachine:'Peloton',oneOff:false,updatedAt:dt,timerEnd:0,finishedAt:dt,setCount:3,checkCount:1,recovery:'good',notes:'Felt strong; bench < last week but rows > target.'};
 const draft={id:did,template:'b',phase:1,weekMode:'normal',startedAt:'2026-10-11T11:00:00.000Z',status:'draft',forms:{['lift:0:'+b0+':1:Straight Sets:w']:'60',['lift:0:'+b0+':1:Straight Sets:r']:'10',['lift:3:'+b3+':2:Myo-Reps:r0']:'12'},checks:{['lift:3:'+b3+':2:Myo-Reps:stage0']:true},choices:{},modes:{['3:'+b3]:'Myo-Reps'},clusters:{['lift:3:'+b3+':2:Myo-Reps:']:5},strengthModes:{},activators:{0:act},compact:false,mobTier:10,cardioMachine:'Rower',oneOff:false,updatedAt:'2026-10-11T11:20:00.000Z',timerEnd:0,finishNotes:'Elbow fine; keep RIR >2',finishRecovery:'mixed'};
 const os={bodyweight:191.5,mode:'expansion',readiness:{sleep:4,energy:3,soreness:4,joints:5,motivation:4,date:dt},tests:{forty:{value:'5.82',date:dt},vertical:{value:'21',date:dt},pullup:{value:'214 x 6',date:dt}},fuel:{},skill:{SPEED:1,DUNK:2,ROPE:0,PULL:1},experiments:[{q:'Does a primer help bench >225?',a:'Primer',b:'No primer',date:dt,status:'OBSERVE'}],combine:[{date:dt,forty:'5.82',vertical:'21',hang:'48',carry:'2x50lb 40m',zone2:'210W',mobility:'OK',notes:'Turf, light wind <5mph'}],notes:[],gymProfiles:[{name:'Primary Gym',equipment:['Barbell / rack','Dumbbells','Cable stack','Machines','Pull-up bar','Cardio machine']},{name:'Hotel',equipment:['Dumbbells','Cardio machine']}],activeGym:1,friction:[{session:'b',outcome:'Shortened',reason:'Time',note:'Meeting ran long',date:dt}],lifeWins:[{text:'Carried groceries up 3 flights',date:dt}],technique:[{exercise:a0,cue:'Pause 1s on chest',angle:'Side angle',note:'Bar path drifted > 2in',date:dt}],availability:{0:90,1:40,2:90,3:10,4:30,5:10,6:40}};
 const d={
  pa_hist:hist,
  pa_strength_hist:[{id:sid+'|primer|0|'+a0,sessionId:sid,name:a0,kind:'Heavy Primer',w:245,reps:1,rir:3,date:dt}],
  pa_activator_hist:[{id:did+'|activator|0|'+act,sessionId:did,name:act,kind:'Activator',w:15,reps:20,targetRIR:'4–6',date:dt}],
  pa_ls_hist:[{id:sid+'|stretch|Pec Stretch',sessionId:sid,exercise:'Pec Stretch',load:null,seconds:60,date:dt}],
  pa_cardio_hist:[{id:sid+'|Peloton|zone2',sessionId:sid,date:dt,machine:'Peloton',mode:'zone2',data:{minutes:'30',output:'210'}}],
  pa_sessions_v2:[complete,draft],
  pa_reviews_v1:[{date:dt,block:1,action:'continue',target:1,weekMode:'normal',notes:'Keep going; sleep < 7h hurts'}],
  pa_plan_v1:{active:1,visited:[1]},
  pa_phase_entered:{block:1,date:dt},
  pa_os_v2:os
 };
 const out={};for(const [k,v] of Object.entries(d))out[k]=JSON.stringify(v);
 Object.assign(out,{pa_week_mode:'normal',pa_cardio_machine:'Peloton',pa_current_session:did,['pa_sel_a_0']:a0,['pa_int_b_3_'+b3]:'Myo-Reps',['pa_todayint_a_0']:'Straight Sets',['pa_strength_a_1_'+a1]:'Cluster Sets',['pa_strength_a_0_'+a0]:'Primer + Paused Top/Back-Offs'});
 return out;
}

// OS state with an HTML/JS payload in every user-controlled text field. Each payload records
// which field executed so a failure names the vulnerable render location.
function buildHostileOS(structurallyValid){
 const p=f=>`</textarea>"'><img src=x onerror="(window.__pwned=window.__pwned||[]).push('${f}')">`;
 const dt='2026-10-10T12:00:00.000Z',ex=L[0].name;
 const os={bodyweight:190,mode:'standard',readiness:{sleep:3,energy:3,soreness:4,joints:4,motivation:4,date:null},
  tests:{forty:{value:p('tests.forty'),date:dt},vertical:{value:p('tests.vertical'),date:dt},rope:{value:p('tests.rope'),date:dt},pullup:{value:p('tests.pullup'),date:dt},hang:{value:p('tests.hang'),date:dt},zone2:{value:p('tests.zone2'),date:dt}},
  fuel:{},skill:{},experiments:[{q:p('experiments.q'),a:p('experiments.a'),b:p('experiments.b'),date:dt,status:'OBSERVE'}],
  combine:[{date:dt,forty:p('combine.forty'),vertical:p('combine.vertical'),hang:p('combine.hang'),carry:p('combine.carry'),zone2:p('combine.zone2'),mobility:p('combine.mobility'),notes:p('combine.notes')}],
  notes:[],gymProfiles:[{name:p('gymProfiles.name'),equipment:['Dumbbells']}],activeGym:0,
  friction:[{session:'a',outcome:'Missed',reason:'Other',note:p('friction.note'),date:dt}],
  lifeWins:[{text:p('lifeWins.text'),date:dt}],technique:[{exercise:ex,cue:p('technique.cue'),angle:'Front angle',note:p('technique.note'),date:dt}],availability:{0:60}};
 if(!structurallyValid){
  // Values the import validator rejects, but which could already be in storage from another path.
  os.mode=p('mode');os.bodyweight=p('bodyweight');os.availability={0:p('availability.0')};os.experiments[0].status=p('experiments.status');
 }
 return os;
}

module.exports={buildDataset,buildHostileOS};

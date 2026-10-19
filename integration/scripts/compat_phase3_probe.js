'use strict';
// Compatibility of the Phase 3 additive fields (session.rotation, session.skips, completion basis "explicit", tag-like cardio text)
// with every earlier shipped validator, and of earlier-shaped backups with the Phase 3 validator. Read-only probe of each tree's own validateBackup.
// usage: node integration/scripts/compat_phase3_probe.js <current app dir> <label=dir> [<label=dir> ...]
const fs=require('fs'),os=require('os'),path=require('path');
const {launch}=require('../../tests/lib/cdp'),{serve}=require('../../tests/lib/server');const {make}=require('../device/make_disposable_backup');
(async()=>{
 const [cur,...others]=process.argv.slice(2);const tmp=path.join(os.tmpdir(),'pa-probe-'+process.pid+'.json');
 await make(path.resolve(cur),tmp);const full=JSON.parse(fs.readFileSync(tmp,'utf8'));fs.rmSync(tmp);
 const browser=await launch(),out={};
 const strip0=b=>{const c=JSON.parse(JSON.stringify(b));c.data.pa_sessions_v2=JSON.stringify(JSON.parse(c.data.pa_sessions_v2).map(s=>s.completion?{...s,completion:{...s.completion,exercises:s.completion.exercises.map(e=>e.basis==='explicit'?{...e,basis:'later-work-logged'}:e)}}:s));return c};
 const verdict=(dir,b)=>serve(dir).then(async s=>{const p=await browser.newPage('/tmp');try{await p.goto(s.origin+'/');return await p.eval(b=>{try{validateBackup(b);return 'accepted'}catch(e){return 'rejected: '+e.message}},b)}finally{await p.close();await s.close()}});
 const sessionsOnly=JSON.parse(JSON.stringify(full));delete sessionsOnly.data.pa_cardio_hist;
 const S=JSON.parse(sessionsOnly.data.pa_sessions_v2);
 out.payload={sessions:S.length,withRotation:S.filter(s=>s.rotation).length,withSkips:S.filter(s=>s.skips).length,withCompletion:S.filter(s=>s.completion).length,explicitSkipBasis:S.some(s=>(s.completion?.exercises||[]).some(e=>e.basis==='explicit')),cardioWithTagLikeText:/<Z2>/.test(full.data.pa_cardio_hist)};
 const noExplicit=strip0(sessionsOnly);
 out.newFieldsOnly={current:await verdict(cur,sessionsOnly)};out.withTagLikeCardio={current:await verdict(cur,full)};
 for(const a of others){const [label,dir]=a.split('=');out.newFieldsOnly[label]=await verdict(dir,sessionsOnly);(out.rotationAndSkipsWithoutExplicitBasis=out.rotationAndSkipsWithoutExplicitBasis||{})[label]=await verdict(dir,noExplicit);out.withTagLikeCardio[label]=await verdict(dir,full)}
 const strip=(b,f)=>{const c=JSON.parse(JSON.stringify(b));c.data.pa_sessions_v2=JSON.stringify(JSON.parse(c.data.pa_sessions_v2).map(f));return c};
 out.earlierShapeInCurrent={noRotationNoSkips:await verdict(cur,strip(sessionsOnly,({rotation,skips,...s})=>s)),noCompletionNoRotationNoSkips:await verdict(cur,strip(sessionsOnly,({rotation,skips,completion,...s})=>s))};
 const bad=(f)=>strip(sessionsOnly,s=>f(s));
 out.malformedStillRefused={
  rotationBadGroup:await verdict(cur,bad(s=>s.rotation?{...s,rotation:{...s.rotation,group:9}}:s)),
  rotationOnWrongTemplate:await verdict(cur,bad(s=>s.template==='a'?{...s,rotation:{v:1,group:0,slots:[3,4],methods:{},basis:'ledger'}}:s)),
  skipsBadValue:await verdict(cur,bad(s=>s.skips?{...s,skips:{'1':false}}:s)),
  skipsUnknownSlot:await verdict(cur,bad(s=>s.template==='a'?{...s,skips:{'99':true}}:s))};
 console.log(JSON.stringify(out,null,1));await browser.close();
})().catch(e=>{console.error(e);process.exit(2)});
